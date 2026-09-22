import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { createPool, type Pool } from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  async connection(): Promise<Pool> {
    if (this.pool) return this.pool;

    const passwordFile = this.config.get<string>('DATABASE_PASSWORD_FILE');
    const passwordBase64 = this.config.get<string>('DATABASE_PASSWORD_BASE64');
    const password = passwordFile
      ? (await readFile(passwordFile, 'utf8')).trim()
      : passwordBase64
        ? Buffer.from(passwordBase64, 'base64').toString('utf8').trim()
        : this.config.get<string>('DATABASE_PASSWORD', '');

    this.pool = createPool({
      host: this.config.get('DATABASE_HOST', '127.0.0.1'),
      port: Number(this.config.get('DATABASE_PORT', 3306)),
      user: this.config.get('DATABASE_USER', 'root'),
      password,
      database: this.config.get('DATABASE_NAME', 'impact_flow'),
      charset: 'utf8mb4',
      connectionLimit: 10,
      // MySQL DATETIME stores Beijing wall-clock values without an offset.
      timezone: '+08:00',
      dateStrings: true,
    });

    await this.pool.query('SELECT 1');
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
