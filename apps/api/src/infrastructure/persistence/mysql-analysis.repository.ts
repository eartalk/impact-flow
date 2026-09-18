import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  AnalysisTask,
  ChangedFile,
  CommitSummary,
} from '@impact-flow/contracts';
import type { AnalysisRepository } from '../../core/ports/analysis.repository';
import { DatabaseService } from './database.service';

type AnalysisRow = RowDataPacket & {
  id: string;
  project_id: string;
  project_name: string;
  base_commit: string;
  target_commit: string;
  status: AnalysisTask['status'];
  commit_count: number;
  changed_file_count: number;
  additions: number;
  deletions: number;
  error_message: string | null;
  risk_level: AnalysisTask['riskLevel'];
  risk_summary: string | null;
  impacted_modules: string | AnalysisTask['impactedModules'] | null;
  regression_suggestions: string | AnalysisTask['regressionSuggestions'] | null;
  commit_summary: string | CommitSummary[] | null;
  created_at: string;
  finished_at: string | null;
};

type ChangeFileRow = RowDataPacket & {
  id: string;
  file_path: string;
  old_path: string | null;
  change_type: ChangedFile['changeType'];
  additions: number;
  deletions: number;
};

@Injectable()
export class MysqlAnalysisRepository implements AnalysisRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()} ORDER BY a.created_at DESC`,
    );
    return rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<AnalysisTask | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()} WHERE a.id = ?`,
      [id],
    );
    if (!rows[0]) return null;

    const [files] = await db.query<ChangeFileRow[]>(
      'SELECT * FROM change_file WHERE analysis_task_id = ? ORDER BY file_path',
      [id],
    );
    return {
      ...this.map(rows[0]),
      files: files.map((file) => ({
        id: file.id,
        path: file.file_path,
        oldPath: file.old_path,
        changeType: file.change_type,
        additions: file.additions,
        deletions: file.deletions,
      })),
    };
  }

  async findPending(): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()} WHERE a.status IN ('READY', 'RUNNING') ORDER BY a.created_at`,
    );
    return rows.map((row) => this.map(row));
  }

  async findActiveByProject(projectId: string): Promise<AnalysisTask | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()}
       WHERE a.project_id = ? AND a.status IN ('READY', 'RUNNING')
       ORDER BY a.created_at DESC LIMIT 1`,
      [projectId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(
    input: Omit<AnalysisTask, 'id' | 'createdAt'>,
  ): Promise<AnalysisTask> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const releaseId = randomUUID();
      const analysisId = randomUUID();
      await connection.execute(
        `INSERT INTO \`release\`
         (id, project_id, base_commit, target_commit, status)
         VALUES (?, ?, ?, ?, 'DETECTED')`,
        [releaseId, input.projectId, input.baseCommit, input.targetCommit],
      );
      await connection.execute(
        `INSERT INTO analysis_task
         (id, project_id, release_id, base_commit, target_commit, status,
          commit_count, changed_file_count, additions, deletions, error_message,
          finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          analysisId,
          input.projectId,
          releaseId,
          input.baseCommit,
          input.targetCommit,
          input.status,
          input.commitCount,
          input.changedFileCount,
          input.additions,
          input.deletions,
          input.errorMessage,
          input.finishedAt ? new Date(input.finishedAt) : null,
        ],
      );
      await connection.commit();
      return (await this.findById(analysisId))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markRunning(id: string): Promise<AnalysisTask> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE analysis_task SET status = 'RUNNING', error_message = NULL
       WHERE id = ?`,
      [id],
    );
    return (await this.findById(id))!;
  }

  async complete(
    id: string,
    result: {
      commits: CommitSummary[];
      files: ChangedFile[];
      additions: number;
      deletions: number;
      riskLevel: AnalysisTask['riskLevel'];
      riskSummary: string;
      impactedModules: NonNullable<AnalysisTask['impactedModules']>;
      regressionSuggestions: NonNullable<AnalysisTask['regressionSuggestions']>;
    },
  ): Promise<AnalysisTask> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE analysis_task
         SET status = 'SUCCESS', commit_count = ?, changed_file_count = ?,
             additions = ?, deletions = ?, commit_summary = ?, risk_level = ?,
             risk_summary = ?, impacted_modules = ?, regression_suggestions = ?,
             finished_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          result.commits.length,
          result.files.length,
          result.additions,
          result.deletions,
          JSON.stringify(result.commits),
          result.riskLevel,
          result.riskSummary,
          JSON.stringify(result.impactedModules),
          JSON.stringify(result.regressionSuggestions),
          id,
        ],
      );
      await this.insertFiles(connection, id, result.files);
      await connection.execute(
        `UPDATE \`release\` r
         JOIN analysis_task a ON a.release_id = r.id
         SET r.status = 'ANALYZED'
         WHERE a.id = ?`,
        [id],
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

  async fail(id: string, errorMessage: string): Promise<AnalysisTask> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE analysis_task
       SET status = 'FAILED', error_message = ?, finished_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [errorMessage.slice(0, 2000), id],
    );
    return (await this.findById(id))!;
  }

  private async insertFiles(
    connection: PoolConnection,
    analysisId: string,
    files: ChangedFile[],
  ) {
    for (const file of files) {
      await connection.execute(
        `INSERT INTO change_file
         (id, analysis_task_id, file_path, old_path, change_type, additions, deletions)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          analysisId,
          file.path,
          file.oldPath,
          file.changeType,
          file.additions,
          file.deletions,
        ],
      );
    }
  }

  private baseSelect() {
    return `SELECT a.*, p.name AS project_name
            FROM analysis_task a
            JOIN project p ON p.id = a.project_id`;
  }

  private map(row: AnalysisRow): AnalysisTask {
    const commits = row.commit_summary
      ? typeof row.commit_summary === 'string'
        ? (JSON.parse(row.commit_summary) as CommitSummary[])
        : row.commit_summary
      : undefined;
    const impactedModules = this.parseJson(row.impacted_modules);
    const regressionSuggestions = this.parseJson(row.regression_suggestions);
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      baseCommit: row.base_commit,
      targetCommit: row.target_commit,
      status: row.status,
      commitCount: row.commit_count,
      changedFileCount: row.changed_file_count,
      additions: row.additions,
      deletions: row.deletions,
      errorMessage: row.error_message,
      riskLevel: row.risk_level,
      riskSummary: row.risk_summary,
      impactedModules,
      regressionSuggestions,
      commits,
      createdAt: new Date(row.created_at).toISOString(),
      finishedAt: row.finished_at
        ? new Date(row.finished_at).toISOString()
        : null,
    };
  }

  private parseJson<T>(value: string | T | null): T | undefined {
    if (!value) return undefined;
    return typeof value === 'string' ? (JSON.parse(value) as T) : value;
  }
}
