import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  PendingNotificationRepository,
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
      'SELECT COUNT(*) AS total FROM pending_notification_delivery ' +
        'WHERE project_id = ? AND target_commit = ?',
      [projectId, targetCommit],
    );
    return Number(rows[0]?.total ?? 0) > 0;
  }

  async markDelivered(projectId: string, targetCommit: string) {
    const db = await this.database.connection();
    await db.execute(
      'INSERT IGNORE INTO pending_notification_delivery ' +
        '(id, project_id, target_commit) VALUES (?, ?, ?)',
      [randomUUID(), projectId, targetCommit],
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
}
