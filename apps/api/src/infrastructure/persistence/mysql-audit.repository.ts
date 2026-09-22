import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { AuditLog, AuditLogPage, AuditLogQuery } from '@impact-flow/contracts';
import type {
  AuditRepository,
  AuditWriteInput,
} from '../../core/ports/audit.repository';
import { DatabaseService } from './database.service';
import { mysqlDateTimeToIso } from './mysql-datetime';

type AuditRow = RowDataPacket & {
  id: string;
  workspace_id: string | null;
  operator_id: string | null;
  operator_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: string | Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type CountRow = RowDataPacket & { total: number };

@Injectable()
export class MysqlAuditRepository implements AuditRepository {
  constructor(private readonly database: DatabaseService) {}

  async write(input: AuditWriteInput): Promise<void> {
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

  async list(query: AuditLogQuery, workspaceId: string): Promise<AuditLogPage> {
    const db = await this.database.connection();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    // 工作空间条件恒定存在，避免跨空间读到其他租户的操作记录
    const conditions: string[] = ['a.workspace_id = ?'];
    const values: Array<string> = [workspaceId];
    if (query.action) {
      conditions.push('a.action = ?');
      values.push(query.action);
    }
    if (query.operatorId) {
      conditions.push('a.operator_id = ?');
      values.push(query.operatorId);
    }
    if (query.resourceType) {
      conditions.push('a.resource_type = ?');
      values.push(query.resourceType);
    }
    if (query.from) {
      conditions.push('a.created_at >= ?');
      values.push(query.from);
    }
    if (query.to) {
      conditions.push('a.created_at <= ?');
      values.push(query.to);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [counts] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM audit_log a ${where}`,
      values,
    );
    const total = Number(counts[0]?.total ?? 0);

    const [rows] = await db.query<AuditRow[]>(
      `SELECT a.id, a.workspace_id, a.operator_id, u.display_name AS operator_name,
              a.action, a.resource_type, a.resource_id, a.detail, a.ip_address,
              a.created_at
       FROM audit_log a
       LEFT JOIN user_account u ON u.id = a.operator_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );

    return {
      items: rows.map((row) => this.map(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private map(row: AuditRow): AuditLog {
    let detail: Record<string, unknown> | null = null;
    if (row.detail) {
      if (typeof row.detail === 'string') {
        try {
          detail = JSON.parse(row.detail) as Record<string, unknown>;
        } catch {
          detail = null;
        }
      } else {
        detail = row.detail;
      }
    }
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      detail,
      ipAddress: row.ip_address,
      createdAt: mysqlDateTimeToIso(row.created_at),
    };
  }
}
