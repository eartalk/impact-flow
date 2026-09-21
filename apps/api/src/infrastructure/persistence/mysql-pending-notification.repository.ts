import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  NotificationChannel,
  NotificationDeliveryLog,
  NotificationDeliveryLogPage,
  NotificationDeliveryLogQuery,
} from '@impact-flow/contracts';
import type {
  PendingNotificationRepository,
  RecordDeliveryInput,
  StoredPendingNotificationConfig,
} from '../../core/ports/pending-notification.repository';
import { DatabaseService } from './database.service';

type NotificationConfigRow = RowDataPacket & {
  enabled: number;
  webhook_encrypted: string | null;
  webhook_hint: string | null;
  updated_at: string;
};

type CountRow = RowDataPacket & { total: number };

type DeliveryRow = RowDataPacket & {
  id: string;
  project_id: string;
  project_name: string | null;
  project_code: string | null;
  target_commit: string;
  channel: string;
  attempt: number;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

/** MySQL 唯一键冲突错误码 */
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

@Injectable()
export class MysqlPendingNotificationRepository
  implements PendingNotificationRepository
{
  constructor(private readonly database: DatabaseService) {}

  async findConfig(workspaceId: string): Promise<StoredPendingNotificationConfig> {
    const db = await this.database.connection();
    const [rows] = await db.query<NotificationConfigRow[]>(
      `SELECT enabled, webhook_encrypted, webhook_hint, updated_at
       FROM pending_notification_config WHERE workspace_id = ?`,
      [workspaceId],
    );
    if (!rows[0]) {
      await db.execute(
        'INSERT INTO pending_notification_config (workspace_id, enabled) VALUES (?, 0)',
        [workspaceId],
      );
      return {
        enabled: false,
        webhookEncrypted: null,
        webhookHint: null,
        updatedAt: null,
      };
    }
    return this.map(rows[0]);
  }

  async saveConfig(workspaceId: string, input: {
    enabled: boolean;
    webhookEncrypted?: string;
    webhookHint?: string;
  }) {
    const db = await this.database.connection();
    const fields = ['enabled = ?'];
    const values: Array<string | number> = [input.enabled ? 1 : 0];
    if (input.webhookEncrypted !== undefined) {
      fields.push('webhook_encrypted = ?', 'webhook_hint = ?');
      values.push(input.webhookEncrypted, input.webhookHint ?? '');
    }
    const sql =
      'INSERT INTO pending_notification_config (workspace_id, enabled) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE ' +
      fields.join(', ');
    await db.execute(sql, [workspaceId, input.enabled ? 1 : 0, ...values]);
    return this.findConfig(workspaceId);
  }

  async wasDelivered(projectId: string, targetCommit: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM pending_notification_delivery
       WHERE project_id = ? AND target_commit = ? AND status = 'SUCCESS'`,
      [projectId, targetCommit],
    );
    return Number(rows[0]?.total ?? 0) > 0;
  }

  async recordDelivery(input: RecordDeliveryInput) {
    const db = await this.database.connection();
    const [counts] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM pending_notification_delivery
       WHERE project_id = ? AND target_commit = ?`,
      [input.projectId, input.targetCommit],
    );
    const attempt = Number(counts[0]?.total ?? 0) + 1;
    try {
      await db.execute(
        `INSERT INTO pending_notification_delivery
           (id, workspace_id, project_id, target_commit, channel, attempt,
            status, error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.workspaceId,
          input.projectId,
          input.targetCommit,
          input.channel,
          attempt,
          input.status,
          input.errorCode ?? null,
          input.errorMessage?.slice(0, 1000) ?? null,
        ],
      );
    } catch (error) {
      // 成功投递已存在（唯一键冲突）说明并发下已通知过，忽略即可
      if (this.isDuplicateEntry(error)) return;
      throw error;
    }
  }

  async listDeliveries(
    workspaceId: string,
    query: NotificationDeliveryLogQuery,
  ): Promise<NotificationDeliveryLogPage> {
    const db = await this.database.connection();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const offset = (page - 1) * pageSize;

    const conditions = ['d.workspace_id = ?'];
    const filterValues: string[] = [workspaceId];
    if (query.projectId) {
      conditions.push('d.project_id = ?');
      filterValues.push(query.projectId);
    }
    if (query.status) {
      conditions.push('d.status = ?');
      filterValues.push(query.status);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [counts] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM pending_notification_delivery d ${where}`,
      filterValues,
    );
    const total = Number(counts[0]?.total ?? 0);

    const [rows] = await db.query<DeliveryRow[]>(
      `SELECT d.id, d.project_id, p.name AS project_name, p.code AS project_code,
              d.target_commit, d.channel, d.attempt, d.status,
              d.error_code, d.error_message, d.created_at
       FROM pending_notification_delivery d
       LEFT JOIN project p ON p.id = d.project_id
       ${where}
       ORDER BY d.created_at DESC, d.attempt DESC
       LIMIT ? OFFSET ?`,
      [...filterValues, pageSize, offset],
    );

    return {
      items: rows.map((row) => this.mapDelivery(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private isDuplicateEntry(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === DUPLICATE_ENTRY
    );
  }

  private map(row: NotificationConfigRow): StoredPendingNotificationConfig {
    return {
      enabled: Boolean(row.enabled),
      webhookEncrypted: row.webhook_encrypted,
      webhookHint: row.webhook_hint,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapDelivery(row: DeliveryRow): NotificationDeliveryLog {
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      projectCode: row.project_code,
      targetCommit: row.target_commit,
      shortCommit: row.target_commit.slice(0, 8),
      channel: row.channel as NotificationChannel,
      attempt: Number(row.attempt),
      status: row.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
