import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import mysql from 'mysql2/promise';

const migration = basename(process.argv[2] ?? '');
if (!/^\d{3}_[a-z0-9_]+\.sql$/i.test(migration)) {
  throw new Error('Usage: node scripts/apply-migration.mjs 020_example.sql');
}

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const environment = await readEnvironment(resolve(workspaceRoot, '.env'));
let password = environment.DATABASE_PASSWORD ?? '';
if (environment.DATABASE_PASSWORD_BASE64) {
  password = Buffer.from(environment.DATABASE_PASSWORD_BASE64, 'base64').toString('utf8').trim();
}
if (environment.DATABASE_PASSWORD_FILE) {
  password = (await readFile(resolve(workspaceRoot, environment.DATABASE_PASSWORD_FILE), 'utf8')).trim();
}

const connection = await mysql.createConnection({
  host: environment.DATABASE_HOST ?? '127.0.0.1',
  port: Number(environment.DATABASE_PORT ?? 3306),
  user: environment.DATABASE_USER ?? 'root',
  password,
  database: environment.DATABASE_NAME ?? 'impact_flow',
  charset: 'utf8mb4',
  multipleStatements: true,
});

try {
  const sql = await readFile(resolve(workspaceRoot, 'database', migration), 'utf8');
  await connection.query(sql);
  console.log(`Applied migration ${migration}`);
} finally {
  await connection.end();
}

async function readEnvironment(path) {
  const result = {};
  const content = await readFile(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
