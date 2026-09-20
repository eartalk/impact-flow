import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AuthSession,
  CreateWorkspaceMemberInput,
  WorkspaceMember,
  WorkspaceRole,
} from '@impact-flow/contracts';
import type {
  IdentityRepository,
  StoredUser,
} from '../../core/ports/identity.repository';
import { DatabaseService } from './database.service';

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
         (id, username, password_hash, display_name)
         VALUES (?, ?, ?, ?)`,
        [userId, input.username, input.passwordHash, input.displayName],
      );
      await connection.execute(
        `INSERT INTO workspace_member (workspace_id, user_id, role)
         VALUES (?, ?, 'OWNER')`,
        [DEFAULT_WORKSPACE_ID, userId],
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
    const [rows] = await db.query<SessionRow[]>(
      `SELECT u.id AS user_id, u.username, u.display_name,
              u.status AS user_status, w.id AS workspace_id,
              w.name AS workspace_name, w.code AS workspace_code, m.role
       FROM auth_session s
       JOIN user_account u ON u.id = s.user_id
       JOIN workspace w ON w.id = s.workspace_id
       JOIN workspace_member m
         ON m.workspace_id = s.workspace_id AND m.user_id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)
         AND u.status = 'ACTIVE' AND w.status = 'ACTIVE'
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

  async writeAudit(input: {
    workspaceId?: string | null;
    operatorId?: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    detail?: object | null;
    ipAddress?: string | null;
  }) {
    const db = await this.database.connection();
    await db.execute(
      `INSERT INTO audit_log
       (id, workspace_id, operator_id, action, resource_type, resource_id, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.workspaceId ?? null,
        input.operatorId ?? null,
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
        input.ipAddress ?? null,
      ],
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
      joinedAt: new Date(row.joined_at).toISOString(),
    };
  }
}
