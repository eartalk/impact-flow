import { Injectable } from '@nestjs/common';
import type { AutomationCode } from '@impact-flow/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AutomationPolicyRepository,
  StoredAutomationPolicy,
} from '../../core/ports/automation-policy.repository';
import { DatabaseService } from './database.service';
import { mysqlDateTimeToIso } from './mysql-datetime';

type AutomationPolicyRow = RowDataPacket & {
  automation_code: AutomationCode;
  enabled: number;
  settings: string | Record<string, unknown> | null;
  config_version: number;
  updated_at: string;
};

@Injectable()
export class MysqlAutomationPolicyRepository
  implements AutomationPolicyRepository
{
  constructor(private readonly database: DatabaseService) {}

  async findAll(workspaceId: string): Promise<StoredAutomationPolicy[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AutomationPolicyRow[]>(
      `SELECT automation_code, enabled, settings, config_version, updated_at
       FROM workspace_automation_policy
       WHERE workspace_id = ?`,
      [workspaceId],
    );
    return rows.map((row) => this.map(row));
  }

  async saveAll(
    workspaceId: string,
    updatedBy: string,
    policies: Array<{ code: AutomationCode; enabled: boolean }>,
  ): Promise<StoredAutomationPolicy[]> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (const policy of policies) {
        await connection.execute(
          `INSERT INTO workspace_automation_policy
             (workspace_id, automation_code, enabled, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
          [workspaceId, policy.code, policy.enabled ? 1 : 0, updatedBy],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.findAll(workspaceId);
  }

  private map(row: AutomationPolicyRow): StoredAutomationPolicy {
    return {
      code: row.automation_code,
      enabled: Boolean(row.enabled),
      settings: row.settings
        ? typeof row.settings === 'string'
          ? JSON.parse(row.settings) as Record<string, unknown>
          : row.settings
        : null,
      configVersion: Number(row.config_version),
      updatedAt: mysqlDateTimeToIso(row.updated_at),
    };
  }
}
