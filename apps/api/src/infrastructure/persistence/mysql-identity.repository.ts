import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AuthSession,
  CreateWorkspaceMemberInput,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceStatus,
} from '@impact-flow/contracts';
import type {
  IdentityRepository,
  RegisterOwnerInput,
  StoredUser,
} from '../../core/ports/identity.repository';
import { DatabaseService } from './database.service';
import { mysqlDateTimeToIso } from './mysql-datetime';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  status: StoredUser['status'];
};

type SessionRow = RowDataPacket & {
  user_id: string;
  username: string;
  display_name: string;
  user_status: StoredUser['status'];
  workspace_id: string;
  workspace_name: string;
  workspace_code: string;
  workspace_status: WorkspaceStatus;
  role: WorkspaceRole;
};

type MemberRow = RowDataPacket & {
  user_id: string;
  username: string;
  display_name: string;
  status: StoredUser['status'];
  role: WorkspaceRole;
  joined_at: string;
};

@Injectable()
export class MysqlIdentityRepository implements IdentityRepository {
  constructor(private readonly database: DatabaseService) {}

  async hasUsers() {
    const db = await this.database.connection();
    const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM user_account',
    );
    return Number(rows[0]?.total ?? 0) > 0;
  }

  async createInitialOwner(input: {
    username: string;
    passwordHash: string;
    displayName: string;
    workspaceName: string;
  }) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    const userId = randomUUID();
    try {
      await connection.beginTransaction();
      const [counts] = await connection.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) AS total FROM user_account FOR UPDATE',
      );
      if (Number(counts[0]?.total ?? 0) > 0) {
        throw new ConflictException('系统已经完成初始化');
      }
      await connection.execute(
        'UPDATE workspace SET name = ? WHERE id = ?',
        [input.workspaceName, DEFAULT_WORKSPACE_ID],
      );
      await connection.execute(
        `INSERT INTO user_account
         (id, username, password_hash, display_name, last_workspace_id)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, input.username, input.passwordHash, input.displayName, DEFAULT_WORKSPACE_ID],
      );
      await connection.execute(
        `INSERT INTO workspace_member (workspace_id, user_id, role)
         VALUES (?, ?, 'OWNER')`,
        [DEFAULT_WORKSPACE_ID, userId],
      );
      // 默认工作空间的所有者与创建人必须与成员关系一致，否则违反单所有者不变量
      await connection.execute(
        `UPDATE workspace SET owner_user_id = ?, created_by = ?
         WHERE id = ?`,
        [userId, userId, DEFAULT_WORKSPACE_ID],
      );
      await connection.commit();
      return (await this.findUserByUsername(input.username))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createRegisteredOwner(input: RegisterOwnerInput) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    const userId = randomUUID();
    const workspaceId = randomUUID();
    try {
      await connection.beginTransaction();
      // workspace 与 user_account 互相引用：先建立无所有者空间，再补齐账号和所有权。
      await connection.execute(
        `INSERT INTO workspace (id, name, code, description, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')`,
        [
          workspaceId,
          input.workspaceName,
          input.workspaceCode,
          input.workspaceDescription,
        ],
      );
      await connection.execute(
        `INSERT INTO user_account
         (id, username, password_hash, display_name, last_workspace_id)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, input.username, input.passwordHash, input.displayName, workspaceId],
      );
      await connection.execute(
        `UPDATE workspace SET owner_user_id = ?, created_by = ? WHERE id = ?`,
        [userId, userId, workspaceId],
      );
      await connection.execute(
        `INSERT INTO workspace_member (workspace_id, user_id, role)
         VALUES (?, ?, 'OWNER')`,
        [workspaceId, userId],
      );
      await connection.execute(
        `INSERT INTO pending_notification_config (workspace_id, enabled)
         VALUES (?, 0)`,
        [workspaceId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        const message = String((error as { message?: string }).message ?? '');
        if (message.includes('uk_user_account_username')) {
          throw new ConflictException('用户名已存在');
        }
        throw new ConflictException('工作空间编码已存在');
      }
      throw error;
    } finally {
      connection.release();
    }

    const user = await this.findUserByUsername(input.username);
    if (!user) throw new ConflictException('账号创建后无法读取，请稍后重试');
    return { user, workspaceId };
  }

  async findUserByUsername(username: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<UserRow[]>(
      `SELECT id, username, password_hash, display_name, status
       FROM user_account WHERE username = ? LIMIT 1`,
      [username],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async createSession(input: {
    userId: string;
    workspaceId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const db = await this.database.connection();
    await db.execute(
      `INSERT INTO auth_session
       (id, user_id, workspace_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), input.userId, input.workspaceId, input.tokenHash, input.expiresAt],
    );
    await db.execute(
      'UPDATE user_account SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [input.userId],
    );
  }

  async findSession(tokenHash: string): Promise<AuthSession | null> {
    const db = await this.database.connection();
    // 已归档工作空间同样允许建立会话，否则归档后连所有者都无法进入只读管理页去恢复，
    // 归档就成了只能改数据库才能撤销的单向门。写入限制由 ArchivedWorkspaceGuard 统一拦截。
    const [rows] = await db.query<SessionRow[]>(
      `SELECT u.id AS user_id, u.username, u.display_name,
              u.status AS user_status, w.id AS workspace_id,
              w.name AS workspace_name, w.code AS workspace_code,
              w.status AS workspace_status, m.role
       FROM auth_session s
       JOIN user_account u ON u.id = s.user_id
       JOIN workspace w ON w.id = s.workspace_id
       JOIN workspace_member m
         ON m.workspace_id = s.workspace_id AND m.user_id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        status: row.user_status,
      },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        code: row.workspace_code,
        role: row.role,
        status: row.workspace_status,
      },
    };
  }

  async revokeSession(tokenHash: string) {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  /**
   * 就地切换会话所属工作空间，不轮换 token。
   * 只更新仍然有效的会话，避免复活已撤销或已过期的记录。
   */
  async switchSessionWorkspace(tokenHash: string, workspaceId: string) {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE auth_session SET workspace_id = ?
       WHERE token_hash = ? AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP(3)`,
      [workspaceId, tokenHash],
    );
  }

  async updateLastWorkspace(userId: string, workspaceId: string) {
    const db = await this.database.connection();
    await db.execute(
      'UPDATE user_account SET last_workspace_id = ? WHERE id = ?',
      [workspaceId, userId],
    );
  }

  async findMember(workspaceId: string, userId: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<MemberRow[]>(
      `SELECT u.id AS user_id, u.username, u.display_name, u.status,
              m.role, m.joined_at
       FROM workspace_member m
       JOIN user_account u ON u.id = m.user_id
       WHERE m.workspace_id = ? AND m.user_id = ?
       LIMIT 1`,
      [workspaceId, userId],
    );
    return rows[0] ? this.mapMember(rows[0]) : null;
  }

  async listMembers(workspaceId: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<MemberRow[]>(
      `SELECT u.id AS user_id, u.username, u.display_name, u.status,
              m.role, m.joined_at
       FROM workspace_member m
       JOIN user_account u ON u.id = m.user_id
       WHERE m.workspace_id = ?
       ORDER BY FIELD(m.role, 'OWNER', 'ADMIN', 'MEMBER', 'VIEWER'), m.joined_at`,
      [workspaceId],
    );
    return rows.map((row) => this.mapMember(row));
  }

  async createMember(
    workspaceId: string,
    input: Omit<CreateWorkspaceMemberInput, 'password'> & { passwordHash: string },
  ) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    const userId = randomUUID();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO user_account
         (id, username, password_hash, display_name)
         VALUES (?, ?, ?, ?)`,
        [userId, input.username, input.passwordHash, input.displayName],
      );
      await connection.execute(
        `INSERT INTO workspace_member (workspace_id, user_id, role)
         VALUES (?, ?, ?)`,
        [workspaceId, userId, input.role],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('用户名已存在');
      }
      throw error;
    } finally {
      connection.release();
    }
    const members = await this.listMembers(workspaceId);
    return members.find((member) => member.userId === userId)!;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ) {
    const db = await this.database.connection();
    const [result] = await db.execute(
      `UPDATE workspace_member SET role = ?
       WHERE workspace_id = ? AND user_id = ? AND role <> 'OWNER'`,
      [role, workspaceId, userId],
    );
    if (!('affectedRows' in result) || result.affectedRows === 0) return null;
    const members = await this.listMembers(workspaceId);
    return members.find((member) => member.userId === userId) ?? null;
  }

  async removeMember(workspaceId: string, userId: string) {
    const db = await this.database.connection();
    const [result] = await db.execute(
      'DELETE FROM workspace_member WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId],
    );
    return 'affectedRows' in result && result.affectedRows > 0;
  }

  /**
   * 撤销该成员在此工作空间下的全部有效会话。
   * 移除成员后必须调用，否则对方的现有会话仍能继续访问该空间数据。
   */
  async revokeMemberSessions(workspaceId: string, userId: string) {
    const db = await this.database.connection();
    const [result] = await db.execute(
      `UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
       WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
      [workspaceId, userId],
    );
    return 'affectedRows' in result ? result.affectedRows : 0;
  }

  async findUserById(userId: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<UserRow[]>(
      `SELECT id, username, password_hash, display_name, status
       FROM user_account WHERE id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async setUserStatus(userId: string, status: StoredUser['status']) {
    const db = await this.database.connection();
    const [result] = await db.execute(
      'UPDATE user_account SET status = ? WHERE id = ?',
      [status, userId],
    );
    return 'affectedRows' in result && result.affectedRows > 0;
  }

  /** 撤销账号在**所有**工作空间下的全部有效会话；账号停用后必须调用 */
  async revokeAllSessions(userId: string) {
    const db = await this.database.connection();
    const [result] = await db.execute(
      `UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    );
    return 'affectedRows' in result ? result.affectedRows : 0;
  }

  async updatePassword(userId: string, passwordHash: string) {
    const db = await this.database.connection();
    await db.execute(
      'UPDATE user_account SET password_hash = ? WHERE id = ?',
      [passwordHash, userId],
    );
  }

  private mapUser(row: UserRow): StoredUser {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      status: row.status,
    };
  }

  private mapMember(row: MemberRow): WorkspaceMember {
    return {
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      status: row.status,
      role: row.role,
      joinedAt: mysqlDateTimeToIso(row.joined_at),
    };
  }
}
