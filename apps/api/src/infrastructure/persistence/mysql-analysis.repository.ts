import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  AnalysisExecutionLog,
  AnalysisLogPage,
  AnalysisLogQuery,
  AnalysisTask,
  AiAnalysisResult,
  ChangeEvidence,
  ChangedFile,
  CommitSummary,
} from '@impact-flow/contracts';
import type { AnalysisRepository } from '../../core/ports/analysis.repository';
import { DatabaseService } from './database.service';
import { mysqlDateTimeToIso } from './mysql-datetime';

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
  symbol_summary: string | null;
  symbol_changes: string | AnalysisTask['symbolChanges'] | null;
  symbol_impacts: string | AnalysisTask['symbolImpacts'] | null;
  change_evidence: string | ChangeEvidence[] | null;
  ai_analysis: string | AnalysisTask['aiAnalysis'] | null;
  ai_analysis_requested: number;
  commit_summary: string | CommitSummary[] | null;
  created_at: string;
  finished_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  progress_stage: NonNullable<AnalysisTask['progressStage']>;
  progress_percent: number;
  progress_message: string | null;
  progress_updated_at: string | null;
  started_at: string | null;
  ai_attempt_count: number;
  ai_max_attempts: number;
  ai_next_attempt_at: string | null;
};

type ChangeFileRow = RowDataPacket & {
  id: string;
  file_path: string;
  old_path: string | null;
  change_type: ChangedFile['changeType'];
  additions: number;
  deletions: number;
};

type AnalysisLogRow = RowDataPacket & {
  id: string;
  analysis_id: string;
  project_id: string;
  project_name: string;
  type: AnalysisExecutionLog['type'];
  status: AnalysisExecutionLog['status'];
  base_commit: string;
  target_commit: string;
  model: string | null;
  error_message: string | null;
  token_usage: string | AnalysisExecutionLog['tokenUsage'] | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  progress_stage: AnalysisTask['progressStage'] | null;
  attempt: number | null;
};

type CountRow = RowDataPacket & { total: number };

@Injectable()
export class MysqlAnalysisRepository implements AnalysisRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(workspaceId: string): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.listSelect()} WHERE p.workspace_id = ?
       ORDER BY a.created_at DESC, a.id DESC`,
      [workspaceId],
    );
    return rows.map((row) => this.map(row));
  }

  async findById(id: string, workspaceId: string): Promise<AnalysisTask | null> {
    return this.findByIdInternal(id, workspaceId);
  }

  async findByIdForWorkerTask(id: string): Promise<AnalysisTask | null> {
    return this.findByIdInternal(id);
  }

  async claimNextForWorker(workerId: string, leaseMs: number) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
        `SELECT a.id
         FROM analysis_task a
         JOIN project p ON p.id = a.project_id
         JOIN workspace w ON w.id = p.workspace_id
         WHERE w.status = 'ACTIVE'
           AND (
             (a.status = 'READY' AND (a.next_attempt_at IS NULL OR a.next_attempt_at <= CURRENT_TIMESTAMP(3)))
             OR (a.status = 'RUNNING' AND a.lock_expires_at < CURRENT_TIMESTAMP(3))
           )
           AND a.attempt_count < a.max_attempts
         ORDER BY COALESCE(a.next_attempt_at, a.created_at), a.created_at
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const id = rows[0]?.id;
      if (!id) {
        await connection.commit();
        return null;
      }
      await connection.execute(
        `UPDATE analysis_task
         SET status = 'RUNNING', attempt_count = attempt_count + 1,
             worker_id = ?, locked_at = CURRENT_TIMESTAMP(3),
             lock_expires_at = ?,
             error_message = NULL, finished_at = NULL,
             progress_stage = 'SYNCING_REPOSITORY', progress_percent = 15,
             progress_message = '正在同步远程代码仓库',
             progress_updated_at = CURRENT_TIMESTAMP(3),
             started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3))
         WHERE id = ?`,
        [workerId, new Date(Date.now() + leaseMs), id],
      );
      await connection.commit();
      return this.findByIdInternal(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async claimNextAiForWorker(workerId: string, leaseMs: number) {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
        `SELECT a.id FROM analysis_task a
         JOIN project p ON p.id = a.project_id
         JOIN workspace w ON w.id = p.workspace_id
         WHERE w.status = 'ACTIVE' AND a.status = 'SUCCESS'
           AND a.ai_attempt_count < a.ai_max_attempts
           AND (
             (JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.status')) = 'RUNNING'
               AND (a.ai_next_attempt_at IS NULL OR a.ai_next_attempt_at <= CURRENT_TIMESTAMP(3))
               AND (a.ai_worker_id IS NULL OR a.ai_lock_expires_at < CURRENT_TIMESTAMP(3)))
             OR (a.ai_analysis_requested = 1 AND a.ai_analysis IS NULL)
           )
         ORDER BY COALESCE(a.ai_next_attempt_at, a.created_at), a.created_at
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const id = rows[0]?.id;
      if (!id) {
        await connection.commit();
        return null;
      }
      await connection.execute(
        `UPDATE analysis_task
         SET ai_attempt_count = ai_attempt_count + 1,
             ai_worker_id = ?, ai_locked_at = CURRENT_TIMESTAMP(3),
             ai_lock_expires_at = ?, ai_next_attempt_at = NULL,
             ai_analysis = JSON_OBJECT(
               'status', 'RUNNING', 'summary', NULL, 'riskLevel', NULL,
               'keyFindings', JSON_ARRAY(), 'regressionSuggestions', JSON_ARRAY(),
               'model', NULL, 'analyzedAt', NULL, 'errorMessage', NULL
             )
         WHERE id = ?`,
        [workerId, new Date(Date.now() + leaseMs), id],
      );
      await connection.execute(
        `UPDATE ai_analysis_log
         SET status = 'FAILED', error_message = '服务升级或重启后已由持久化 Worker 重新排队',
             finished_at = CURRENT_TIMESTAMP(3)
         WHERE analysis_task_id = ? AND status = 'RUNNING' AND worker_id IS NULL`,
        [id],
      );
      await connection.execute(
        `INSERT INTO ai_analysis_log
         (id, analysis_task_id, project_id, status, attempt, worker_id)
         SELECT ?, id, project_id, 'RUNNING', ai_attempt_count, ?
         FROM analysis_task WHERE id = ?`,
        [randomUUID(), workerId, id],
      );
      await connection.commit();
      return this.findByIdInternal(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async retryOrFail(
    id: string,
    workerId: string,
    errorMessage: string,
    nextAttemptAt: Date,
  ): Promise<'RETRY' | 'FAILED'> {
    const db = await this.database.connection();
    const [rows] = await db.query<(RowDataPacket & { attempt_count: number; max_attempts: number })[]>(
      `SELECT attempt_count, max_attempts FROM analysis_task
       WHERE id = ? AND worker_id = ? LIMIT 1`,
      [id, workerId],
    );
    const row = rows[0];
    if (!row) return 'FAILED';
    const retry = row.attempt_count < row.max_attempts;
    await db.execute(
      `UPDATE analysis_task
       SET status = ?, error_message = ?, next_attempt_at = ?,
           worker_id = NULL, locked_at = NULL, lock_expires_at = NULL,
           finished_at = ?,
           progress_stage = IF(?, 'QUEUED', progress_stage),
           progress_percent = IF(?, 5, progress_percent),
           progress_message = ?, progress_updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND worker_id = ?`,
      [
        retry ? 'READY' : 'FAILED',
        errorMessage.slice(0, 2000),
        retry ? nextAttemptAt : null,
        retry ? null : new Date(),
        retry,
        retry,
        retry ? '上次执行失败，等待自动重试' : '已达最大重试次数',
        id,
        workerId,
      ],
    );
    return retry ? 'RETRY' : 'FAILED';
  }

  async retryOrFailAi(
    id: string,
    workerId: string,
    errorMessage: string,
    nextAttemptAt: Date,
  ): Promise<'RETRY' | 'FAILED'> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<
        (RowDataPacket & { ai_attempt_count: number; ai_max_attempts: number })[]
      >(
        `SELECT ai_attempt_count, ai_max_attempts FROM analysis_task
         WHERE id = ? AND ai_worker_id = ? LIMIT 1 FOR UPDATE`,
        [id, workerId],
      );
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        return 'FAILED';
      }
      const retry = row.ai_attempt_count < row.ai_max_attempts;
      const result: AiAnalysisResult = {
        status: retry ? 'RUNNING' : 'FAILED',
        summary: null,
        riskLevel: null,
        keyFindings: [],
        regressionSuggestions: [],
        model: null,
        analyzedAt: retry ? null : new Date().toISOString(),
        errorMessage: errorMessage.slice(0, 1000),
      };
      await connection.execute(
        `UPDATE analysis_task
         SET ai_analysis = ?, ai_next_attempt_at = ?, ai_worker_id = NULL,
             ai_locked_at = NULL, ai_lock_expires_at = NULL
         WHERE id = ? AND ai_worker_id = ?`,
        [JSON.stringify(result), retry ? nextAttemptAt : null, id, workerId],
      );
      await connection.execute(
        `UPDATE ai_analysis_log
         SET status = 'FAILED', error_message = ?, finished_at = CURRENT_TIMESTAMP(3)
         WHERE analysis_task_id = ? AND worker_id = ? AND status = 'RUNNING'`,
        [errorMessage.slice(0, 2000), id, workerId],
      );
      await connection.commit();
      return retry ? 'RETRY' : 'FAILED';
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProgress(
    id: string,
    progress: {
      stage: NonNullable<AnalysisTask['progressStage']>;
      percent: number;
      message: string;
    },
    workerId?: string,
  ): Promise<void> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE analysis_task
       SET progress_stage = ?, progress_percent = ?, progress_message = ?,
           progress_updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? ${workerId ? 'AND worker_id = ?' : ''}`,
      [
        progress.stage,
        Math.max(0, Math.min(100, progress.percent)),
        progress.message.slice(0, 500),
        id,
        ...(workerId ? [workerId] : []),
      ],
    );
  }

  private async findByIdInternal(
    id: string,
    workspaceId?: string,
  ): Promise<AnalysisTask | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()} WHERE a.id = ?
       ${workspaceId ? 'AND p.workspace_id = ?' : ''}`,
      workspaceId ? [id, workspaceId] : [id],
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

  async findPendingForWorker(): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()} WHERE a.status IN ('READY', 'RUNNING') ORDER BY a.created_at`,
    );
    return rows.map((row) => this.map(row));
  }

  async findPendingAiForWorker(): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()}
       WHERE JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.status')) = 'RUNNING'
       ORDER BY a.created_at`,
    );
    return rows.map((row) => this.map(row));
  }

  async findRequestedAiForWorker(): Promise<AnalysisTask[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()}
       WHERE a.status = 'SUCCESS'
         AND a.ai_analysis_requested = 1
         AND a.ai_analysis IS NULL
       ORDER BY a.created_at`,
    );
    return rows.map((row) => this.map(row));
  }

  async findActiveByProject(
    projectId: string,
    workspaceId: string,
  ): Promise<AnalysisTask | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<AnalysisRow[]>(
      `${this.baseSelect()}
       WHERE a.project_id = ? AND p.workspace_id = ?
         AND a.status IN ('READY', 'RUNNING')
       ORDER BY a.created_at DESC LIMIT 1`,
      [projectId, workspaceId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async listLogs(
    query: AnalysisLogQuery,
    workspaceId: string,
  ): Promise<AnalysisLogPage> {
    const db = await this.database.connection();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const offset = (page - 1) * pageSize;
    const changeAnalysis = query.type === 'CHANGE_ANALYSIS';

    // projectId 可省略，工作空间条件必须始终存在
    const conditions: string[] = ['p.workspace_id = ?'];
    const filterValues: Array<string | number> = [workspaceId];
    if (query.projectId) {
      conditions.push(changeAnalysis ? 'a.project_id = ?' : 'l.project_id = ?');
      filterValues.push(query.projectId);
    }
    if (query.status) {
      conditions.push(changeAnalysis ? 'a.status = ?' : 'l.status = ?');
      filterValues.push(query.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from = changeAnalysis
      ? `FROM analysis_task a
         JOIN project p ON p.id = a.project_id`
      : `FROM ai_analysis_log l
         JOIN analysis_task a ON a.id = l.analysis_task_id
         JOIN project p ON p.id = l.project_id`;

    const [counts] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS total ${from} ${where}`,
      filterValues,
    );
    const total = Number(counts[0]?.total ?? 0);

    const sql = changeAnalysis
      ? `SELECT a.id, a.id AS analysis_id, a.project_id, p.name AS project_name,
                'CHANGE_ANALYSIS' AS type, a.status, a.base_commit, a.target_commit,
                NULL AS model, a.error_message, NULL AS token_usage,
                a.attempt_count, a.max_attempts, a.progress_stage, NULL AS attempt,
                COALESCE(a.started_at, a.created_at) AS started_at, a.finished_at,
                TIMESTAMPDIFF(MICROSECOND, COALESCE(a.started_at, a.created_at), a.finished_at) / 1000 AS duration_ms
         ${from} ${where}
         ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
      : `SELECT l.id, l.analysis_task_id AS analysis_id, l.project_id,
                p.name AS project_name, 'AI_ANALYSIS' AS type, l.status,
                a.base_commit, a.target_commit, l.model, l.error_message,
                NULL AS attempt_count, NULL AS max_attempts, NULL AS progress_stage,
                l.attempt,
                l.token_usage, l.started_at, l.finished_at,
                TIMESTAMPDIFF(MICROSECOND, l.started_at, l.finished_at) / 1000 AS duration_ms
         ${from} ${where}
         ORDER BY l.started_at DESC LIMIT ? OFFSET ?`;
    const [rows] = await db.query<AnalysisLogRow[]>(sql, [
      ...filterValues,
      pageSize,
      offset,
    ]);
    return {
      items: rows.map((row) => this.mapLog(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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
          ai_analysis_requested, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          input.aiAnalysisRequested ? 1 : 0,
          input.finishedAt ? new Date(input.finishedAt) : null,
        ],
      );
      await connection.commit();
      return (await this.findByIdInternal(analysisId))!;
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
      `UPDATE analysis_task SET status = 'RUNNING', error_message = NULL,
         progress_stage = 'SYNCING_REPOSITORY', progress_percent = 15,
         progress_message = '正在同步远程代码仓库',
         progress_updated_at = CURRENT_TIMESTAMP(3),
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3))
       WHERE id = ?`,
      [id],
    );
    return (await this.findByIdInternal(id))!;
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
      symbolSummary: string;
      symbolChanges: NonNullable<AnalysisTask['symbolChanges']>;
      symbolImpacts: NonNullable<AnalysisTask['symbolImpacts']>;
      changeEvidence: ChangeEvidence[];
    },
    workerId?: string,
  ): Promise<AnalysisTask> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [updated] = await connection.execute(
        `UPDATE analysis_task
         SET status = 'SUCCESS', commit_count = ?, changed_file_count = ?,
             additions = ?, deletions = ?, commit_summary = ?, risk_level = ?,
             risk_summary = ?, impacted_modules = ?, regression_suggestions = ?,
             symbol_summary = ?, symbol_changes = ?, symbol_impacts = ?, change_evidence = ?,
             finished_at = CURRENT_TIMESTAMP(3), next_attempt_at = NULL,
             worker_id = NULL, locked_at = NULL, lock_expires_at = NULL,
             progress_stage = 'COMPLETED', progress_percent = 100,
             progress_message = '分析结果已保存', progress_updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? ${workerId ? 'AND worker_id = ?' : ''}`,
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
          result.symbolSummary,
          JSON.stringify(result.symbolChanges),
          JSON.stringify(result.symbolImpacts),
          JSON.stringify(result.changeEvidence),
          id,
          ...(workerId ? [workerId] : []),
        ],
      );
      if (!('affectedRows' in updated) || updated.affectedRows === 0) {
        await connection.rollback();
        return (await this.findByIdInternal(id))!;
      }
      await this.insertFiles(connection, id, result.files);
      await connection.execute(
        `UPDATE \`release\` r
         JOIN analysis_task a ON a.release_id = r.id
         SET r.status = 'ANALYZED'
         WHERE a.id = ?`,
        [id],
      );
      await connection.commit();
      return (await this.findByIdInternal(id))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async startAiAnalysis(id: string, result: AiAnalysisResult): Promise<AnalysisTask> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE analysis_task
         SET ai_analysis = ?, ai_analysis_requested = 1,
             ai_attempt_count = 0, ai_next_attempt_at = NULL,
             ai_worker_id = NULL, ai_locked_at = NULL, ai_lock_expires_at = NULL
         WHERE id = ?`,
        [JSON.stringify(result), id],
      );
      await connection.commit();
      return (await this.findByIdInternal(id))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async finishAiAnalysis(
    id: string,
    result: AiAnalysisResult,
    workerId?: string,
  ): Promise<AnalysisTask> {
    const db = await this.database.connection();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [updated] = await connection.execute(
        `UPDATE analysis_task SET ai_analysis = ?, ai_next_attempt_at = NULL,
           ai_worker_id = NULL, ai_locked_at = NULL, ai_lock_expires_at = NULL
         WHERE id = ? ${workerId ? 'AND ai_worker_id = ?' : ''}`,
        [JSON.stringify(result), id, ...(workerId ? [workerId] : [])],
      );
      if (!('affectedRows' in updated) || updated.affectedRows === 0) {
        await connection.rollback();
        return (await this.findByIdInternal(id))!;
      }
      await connection.execute(
        `UPDATE ai_analysis_log
         SET status = ?, model = ?, error_message = ?, token_usage = ?,
             finished_at = CURRENT_TIMESTAMP(3)
         WHERE analysis_task_id = ? AND status = 'RUNNING'
           ${workerId ? 'AND worker_id = ?' : ''}
         ORDER BY started_at DESC LIMIT 1`,
        [
          result.status,
          result.model,
          result.errorMessage,
          result.tokenUsage ? JSON.stringify(result.tokenUsage) : null,
          id,
          ...(workerId ? [workerId] : []),
        ],
      );
      await connection.commit();
      return (await this.findByIdInternal(id))!;
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
    return (await this.findByIdInternal(id))!;
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

  /**
   * 列表轮询只读取状态和进度字段。
   *
   * change_evidence、symbol_impacts、regression_suggestions 等 JSON 可能达到数 MB；
   * 若使用 SELECT a.* 再按 created_at 排序，MySQL 会把这些大字段带入排序临时表，
   * 最终触发 Out of sort memory。完整结果由详情接口按任务 ID 单独读取。
   */
  private listSelect() {
    return `SELECT
              a.id, a.project_id, p.name AS project_name,
              a.base_commit, a.target_commit, a.status,
              a.commit_count, a.changed_file_count, a.additions, a.deletions,
              a.error_message, a.risk_level, a.risk_summary,
              a.ai_analysis_requested, a.created_at, a.finished_at,
              a.attempt_count, a.max_attempts, a.next_attempt_at,
              a.progress_stage, a.progress_percent, a.progress_message,
              a.progress_updated_at, a.started_at,
              a.ai_attempt_count, a.ai_max_attempts, a.ai_next_attempt_at,
              CASE WHEN a.ai_analysis IS NULL THEN NULL ELSE JSON_OBJECT(
                'status', JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.status')),
                'summary', NULL,
                'riskLevel', JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.riskLevel')),
                'keyFindings', JSON_ARRAY(),
                'regressionSuggestions', JSON_ARRAY(),
                'model', JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.model')),
                'analyzedAt', JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.analyzedAt')),
                'errorMessage', JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.errorMessage')),
                'tokenUsage', JSON_EXTRACT(a.ai_analysis, '$.tokenUsage')
              ) END AS ai_analysis
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
    const symbolChanges = this.parseJson(row.symbol_changes) ?? [];
    const symbolImpacts = this.parseJson(row.symbol_impacts) ?? [];
    const changeEvidence = this.parseJson<ChangeEvidence[]>(row.change_evidence) ?? [];
    const aiAnalysis = this.parseJson(row.ai_analysis) ?? null;
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
      symbolSummary: row.symbol_summary,
      symbolChanges,
      symbolImpacts,
      changeEvidence,
      aiAnalysis,
      aiAnalysisRequested: Boolean(row.ai_analysis_requested),
      commits,
      createdAt: mysqlDateTimeToIso(row.created_at),
      finishedAt: row.finished_at
        ? mysqlDateTimeToIso(row.finished_at)
        : null,
      attemptCount: Number(row.attempt_count ?? 0),
      maxAttempts: Number(row.max_attempts ?? 3),
      nextAttemptAt: row.next_attempt_at
        ? mysqlDateTimeToIso(row.next_attempt_at)
        : null,
      progressStage: row.progress_stage ?? 'QUEUED',
      progressPercent: Number(row.progress_percent ?? 5),
      progressMessage: row.progress_message,
      progressUpdatedAt: row.progress_updated_at
        ? mysqlDateTimeToIso(row.progress_updated_at)
        : null,
      startedAt: row.started_at ? mysqlDateTimeToIso(row.started_at) : null,
      aiAttemptCount: Number(row.ai_attempt_count ?? 0),
      aiMaxAttempts: Number(row.ai_max_attempts ?? 3),
      aiNextAttemptAt: row.ai_next_attempt_at
        ? mysqlDateTimeToIso(row.ai_next_attempt_at)
        : null,
    };
  }

  private mapLog(row: AnalysisLogRow): AnalysisExecutionLog {
    return {
      id: row.id,
      analysisId: row.analysis_id,
      projectId: row.project_id,
      projectName: row.project_name,
      type: row.type,
      status: row.status,
      baseCommit: row.base_commit,
      targetCommit: row.target_commit,
      model: row.model,
      errorMessage: row.error_message,
      tokenUsage: this.parseJson(row.token_usage) ?? null,
      startedAt: mysqlDateTimeToIso(row.started_at),
      finishedAt: row.finished_at ? mysqlDateTimeToIso(row.finished_at) : null,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      attemptCount: row.attempt_count === null ? undefined : Number(row.attempt_count),
      maxAttempts: row.max_attempts === null ? undefined : Number(row.max_attempts),
      progressStage: row.progress_stage ?? undefined,
      attempt: row.attempt === null ? undefined : Number(row.attempt),
    };
  }

  private parseJson<T>(value: string | T | null): T | undefined {
    if (!value) return undefined;
    return typeof value === 'string' ? (JSON.parse(value) as T) : value;
  }
}
