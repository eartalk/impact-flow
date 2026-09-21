import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const environment = await readEnvironment(resolve(workspaceRoot, '.env'));
let password = environment.DATABASE_PASSWORD ?? '';
if (environment.DATABASE_PASSWORD_BASE64) {
  password = Buffer.from(environment.DATABASE_PASSWORD_BASE64, 'base64')
    .toString('utf8')
    .trim();
}
if (environment.DATABASE_PASSWORD_FILE) {
  password = (await readFile(
    resolve(workspaceRoot, environment.DATABASE_PASSWORD_FILE),
    'utf8',
  )).trim();
}

const database = environment.DATABASE_NAME ?? 'impact_flow';
const connection = await mysql.createConnection({
  host: environment.DATABASE_HOST ?? '127.0.0.1',
  port: Number(environment.DATABASE_PORT ?? 3306),
  user: environment.DATABASE_USER ?? 'root',
  password,
  database,
  charset: 'utf8mb4',
});

const requirements = [
  ['workspace', 'owner_user_id'],
  ['workspace', 'archived_at'],
  ['user_account', 'last_workspace_id'],
  ['workspace_member', 'updated_at'],
  ['workspace_member', 'owner_workspace_id'],
];

try {
  const [columns] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?`,
    [database],
  );
  const available = new Set(
    columns.map((column) => `${column.tableName}.${column.columnName}`),
  );
  const missing = requirements
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !available.has(column));

  const [analysisColumns] = await connection.query(
    `SELECT COLUMN_COMMENT AS comment
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'analysis_task'
       AND COLUMN_NAME = 'status'`,
    [database],
  );
  if (!String(analysisColumns[0]?.comment ?? '').includes('CANCELLED')) {
    missing.push('analysis_task.status(CANCELLED)');
  }

  if (missing.length) {
    console.error(`Workspace schema is incomplete: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else {
    const [invalidOwners] = await connection.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT w.id
         FROM workspace w
         LEFT JOIN workspace_member m
           ON m.workspace_id = w.id AND m.role = 'OWNER'
         GROUP BY w.id, w.owner_user_id
         HAVING COUNT(m.user_id) <> 1
            OR MAX(m.user_id) <> w.owner_user_id
       ) inconsistent`,
    );
    const invalidOwnerCount = Number(invalidOwners[0]?.total ?? 0);
    if (invalidOwnerCount) {
      console.error(
        `Workspace schema exists, but ${invalidOwnerCount} workspace owner record(s) are inconsistent`,
      );
      process.exitCode = 1;
    } else {
      console.log('Workspace schema verified');
    }
  }
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
