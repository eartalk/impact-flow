import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  CreateAiProviderConfigInput,
  UpdateAiProviderConfigInput,
} from '@impact-flow/contracts';
import type {
  AiConfigRepository,
  StoredAiProviderConfig,
} from '../../core/ports/ai-config.repository';
import { DatabaseService } from './database.service';

type AiConfigRow = RowDataPacket & {
  id: string;
  name: string;
  base_url: string;
  api_key_encrypted: string;
  api_key_hint: string;
  model: string;
  api_format: 'OPENAI' | 'ANTHROPIC';
  enabled: number;
  is_default: number;
  timeout_ms: number;
  max_files: number;
  max_symbols: number;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class MysqlAiConfigRepository implements AiConfigRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll() {
    const db = await this.database.connection();
    const [rows] = await db.query<AiConfigRow[]>(
      'SELECT * FROM ai_provider_config ORDER BY is_default DESC, created_at DESC',
    );
    return rows.map((row) => this.map(row));
  }

  async findById(id: string) {
    const db = await this.database.connection();
    const [rows] = await db.query<AiConfigRow[]>(
      'SELECT * FROM ai_provider_config WHERE id = ?',
      [id],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findDefault() {
    const db = await this.database.connection();
    const [rows] = await db.query<AiConfigRow[]>(
      'SELECT * FROM ai_provider_config WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1',
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(
    input: Omit<CreateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted: string;
      apiKeyHint: string;
    },
  ) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    const id = randomUUID();
    try {
      await connection.beginTransaction();
      if (input.isDefault) {
        await connection.execute('UPDATE ai_provider_config SET is_default = 0');
      }
      await connection.execute(
        `INSERT INTO ai_provider_config
         (id, name, base_url, api_key_encrypted, api_key_hint, model, api_format, enabled,
          is_default, timeout_ms, max_files, max_symbols)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name,
          input.baseUrl,
          input.apiKeyEncrypted,
          input.apiKeyHint,
          input.model,
          input.apiFormat,
          input.enabled ? 1 : 0,
          input.isDefault ? 1 : 0,
          input.timeoutMs,
          input.maxFiles,
          input.maxSymbols,
        ],
      );
      await connection.commit();
      return (await this.findById(id))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async update(
    id: string,
    input: Omit<UpdateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted?: string;
      apiKeyHint?: string;
    },
  ) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (input.isDefault) {
        await connection.execute('UPDATE ai_provider_config SET is_default = 0 WHERE id <> ?', [id]);
      }
      const fields: string[] = [];
      const values: Array<string | number> = [];
      const columns: Array<[
        keyof typeof input,
        string,
        (value: string | number | boolean) => string | number,
      ]> = [
        ['name', 'name', (value) => String(value)],
        ['baseUrl', 'base_url', (value) => String(value)],
        ['model', 'model', (value) => String(value)],
        ['apiFormat', 'api_format', (value) => String(value)],
        ['enabled', 'enabled', (value) => value ? 1 : 0],
        ['isDefault', 'is_default', (value) => value ? 1 : 0],
        ['timeoutMs', 'timeout_ms', (value) => Number(value)],
        ['maxFiles', 'max_files', (value) => Number(value)],
        ['maxSymbols', 'max_symbols', (value) => Number(value)],
        ['apiKeyEncrypted', 'api_key_encrypted', (value) => String(value)],
        ['apiKeyHint', 'api_key_hint', (value) => String(value)],
      ];
      for (const [key, column, transform] of columns) {
        if (input[key] === undefined) continue;
        fields.push(`${column} = ?`);
        values.push(transform(input[key] as string | number | boolean));
      }
      if (fields.length) {
        values.push(id);
        await connection.execute(
          `UPDATE ai_provider_config SET ${fields.join(', ')} WHERE id = ?`,
          values,
        );
      }
      await connection.commit();
      return this.findById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async remove(id: string) {
    const db = await this.database.connection();
    const [result] = await db.execute('DELETE FROM ai_provider_config WHERE id = ?', [id]);
    return 'affectedRows' in result && result.affectedRows > 0;
  }

  private map(row: AiConfigRow): StoredAiProviderConfig {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKeyEncrypted: row.api_key_encrypted,
      apiKeyHint: row.api_key_hint,
      model: row.model,
      apiFormat: row.api_format,
      enabled: Boolean(row.enabled),
      isDefault: Boolean(row.is_default),
      timeoutMs: row.timeout_ms,
      maxFiles: row.max_files,
      maxSymbols: row.max_symbols,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
