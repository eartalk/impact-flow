import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  UpdateWorkspaceInput,
  WorkspaceOverview,
  WorkspaceRole,
  WorkspaceStatus,
} from '@impact-flow/contracts';
import type {
  CreateWorkspaceWithOwnerInput,
  WorkspaceRepository,
} from '../../core/ports/workspace.repository';
import { DatabaseService } from './database.service';
import { mysqlDateTimeToIso } from './mysql-datetime';

type WorkspaceRow = RowDataPacket & {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  owner_user_id: string | null;
  member_count: number;
  project_count: number;
  created_at: string;
  archived_at: string | null;
};

/**
 * 成员关系与项目数量用关联子查询统计，而不是 JOIN + COUNT。
 * JOIN 两个集合会在同一工作空间有多个成员与多个项目时产生笛卡尔积，
 * 导致计数被放大；子查询不受影响且更易读。
 */
const WORKSPACE_SELECT = `
  SELECT w.id, w.name, w.code, w.description, w.status, w.owner_user_id,
         w.created_at, w.archived_at, m.role,
         (SELECT COUNT(*) FROM workspace_member mc WHERE mc.workspace_id = w.id)
           AS member_count,
         (SELECT COUNT(*) FROM project pc WHERE pc.workspace_id = w.id)
           AS project_count
  FROM workspace w
  JOIN workspace_member m ON m.workspace_id = w.id AND m.user_id = ?`;

@Injectable()
export class MysqlWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string): Promise<WorkspaceOverview[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<WorkspaceRow[]>(
      `${WORKSPACE_SELECT}
       ORDER BY FIELD(w.status, 'ACTIVE', 'ARCHIVED'), w.created_at`,
      [userId],
    );
    return rows.map(this.map);
  }

  async findForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceOverview | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<WorkspaceRow[]>(
      `${WORKSPACE_SELECT} WHERE w.id = ? LIMIT 1`,
      [userId, workspaceId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async isActive(workspaceId: string): Promise<boolean> {
    const db = await this.database.connection();
    const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM workspace WHERE id = ? AND status = 'ACTIVE'",
      [workspaceId],
    );
    return Number(rows[0]?.total ?? 0) > 0;
  }

  async findByCode(code: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<(RowDataPacket & { id: string; name: string })[]>(
      'SELECT id, name FROM workspace WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  }

  async resolveLoginWorkspace(userId: string) {
    const db = await this.database.connection();
    // 单个 ORDER BY 表达优先级：最后使用 > 担任 OWNER > 最早加入
    // last_workspace_id 为 NULL 时比较结果为 NULL，DESC 排序下自然落到最后
    const [rows] = await db.query<(RowDataPacket & { id: string; name: string })[]>(
      `SELECT w.id, w.name
       FROM workspace w
       JOIN workspace_member m ON m.workspace_id = w.id AND m.user_id = ?
       WHERE w.status = 'ACTIVE' OR (w.status = 'ARCHIVED' AND m.role = 'OWNER')
       ORDER BY (w.status = 'ACTIVE') DESC,
                (w.id = (SELECT ua.last_workspace_id
                         FROM user_account ua WHERE ua.id = ?)) DESC,
                (m.role = 'OWNER') DESC,
                m.joined_at ASC
       LIMIT 1`,
      [userId, userId],
    );
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  }

  async createWithOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<WorkspaceOverview> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    const workspaceId = randomUUID();
    try {
      await connection.beginTransaction();
      await this.insertWorkspace(connection, workspaceId, input);
      await connection.execute(
        `INSERT INTO workspace_member (workspace_id, user_id, role)
         VALUES (?, ?, 'OWNER')`,
        [workspaceId, input.ownerUserId],
      );
      // 与现有默认工作空间保持一致：通知配置有实体行，自动化策略留空走惰性默认
      await connection.execute(
        `INSERT INTO pending_notification_config (workspace_id, enabled)
         VALUES (?, 0)`,
        [workspaceId],
      );
      await connection.execute(
        'UPDATE user_account SET last_workspace_id = ? WHERE id = ?',
        [workspaceId, input.ownerUserId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('工作空间编码已存在');
      }
      throw error;
    } finally {
      connection.release();
    }

    const created = await this.findForUser(workspaceId, input.ownerUserId);
    if (!created) {
      throw new ConflictException('工作空间创建后无法读取，请稍后重试');
    }
    return created;
  }

  async update(
    workspaceId: string,
    input: UpdateWorkspaceInput,
    updatedBy: string,
  ): Promise<void> {
    const db = await this.database.connection();
    const fields: string[] = ['updated_by = ?'];
    const values: Array<string | null> = [updatedBy];
    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    // description 传 undefined 表示不修改，传 null 表示清空
    if (input.description !== undefined) {
      fields.push('description = ?');
      values.push(input.description);
    }
    values.push(workspaceId);
    await db.execute(
      `UPDATE workspace SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
  }

  private async insertWorkspace(
    connection: PoolConnection,
    workspaceId: string,
    input: CreateWorkspaceWithOwnerInput,
  ) {
    await connection.execute(
      `INSERT INTO workspace
         (id, name, code, description, owner_user_id, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        workspaceId,
        input.name,
        input.code,
        input.description,
        input.ownerUserId,
        input.ownerUserId,
      ],
    );
  }

  async archive(workspaceId: string, byUserId: string): Promise<boolean> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [changed] = await connection.execute(
        `UPDATE workspace
         SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP(3), updated_by = ?
         WHERE id = ? AND status = 'ACTIVE'`,
        [byUserId, workspaceId],
      );
      if (!('affectedRows' in changed) || changed.affectedRows === 0) {
        await connection.rollback();
        return false;
      }
      // 与状态变更同事务：避免出现「已归档但任务仍是 READY」的不一致，
      // 否则一旦恢复该空间，这些任务会被调度器重新捡起来执行
      await connection.execute(
        `UPDATE analysis_task a
         JOIN project p ON p.id = a.project_id
         SET a.status = 'CANCELLED', a.finished_at = CURRENT_TIMESTAMP(3)
         WHERE p.workspace_id = ? AND a.status = 'READY'`,
        [workspaceId],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async restore(workspaceId: string, byUserId: string): Promise<boolean> {
    const db = await this.database.connection();
    // 不补跑历史巡检，自动化配置原样保留，恢复后由调度器按原策略继续
    const [result] = await db.execute(
      `UPDATE workspace
       SET status = 'ACTIVE', archived_at = NULL, updated_by = ?
       WHERE id = ? AND status = 'ARCHIVED'`,
      [byUserId, workspaceId],
    );
    return 'affectedRows' in result && result.affectedRows > 0;
  }

  private map(row: WorkspaceRow): WorkspaceOverview {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      role: row.role,
      ownerUserId: row.owner_user_id,
      memberCount: Number(row.member_count),
      projectCount: Number(row.project_count),
      createdAt: mysqlDateTimeToIso(row.created_at),
      archivedAt: row.archived_at ? mysqlDateTimeToIso(row.archived_at) : null,
    };
  }
}
