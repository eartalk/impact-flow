import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import type {
  CommitSummary,
  CreateProjectInput,
  InspectionLog,
  InspectionLogPage,
  InspectionLogQuery,
  InspectionTrigger,
  Project,
  UpdateProjectInput,
} from '@impact-flow/contracts';
import type { ProjectRepository } from '../../core/ports/project.repository';
import { DatabaseService } from './database.service';

type ProjectRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  name: string;
  code: string;
  repository_url: string;
  production_branch: string;
  last_analyzed_commit: string | null;
  detected_commit: string | null;
  previous_detected_commit: string | null;
  pending_commit_count: number;
  pending_commits: string | CommitSummary[] | null;
  last_checked_at: string | null;
  check_status: Project['checkStatus'];
  check_error: string | null;
  created_at: string;
};

type InspectionLogRow = RowDataPacket & {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  trigger_type: InspectionTrigger;
  status: InspectionLog['status'];
  detected_commit: string | null;
  pending_commit_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

type InspectionLogSummaryRow = RowDataPacket & {
  total: number;
  success: number;
  failed: number;
  running: number;
};

@Injectable()
export class MysqlProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAll(workspaceId: string): Promise<Project[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      `SELECT * FROM project WHERE workspace_id = ?
       ORDER BY created_at DESC`,
      [workspaceId],
    );
    return rows.map(this.map);
  }

  async findAllForScheduler(): Promise<Project[]> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      `SELECT p.* FROM project p
       JOIN workspace w ON w.id = p.workspace_id
       WHERE w.status = 'ACTIVE'
       ORDER BY p.created_at DESC`,
    );
    return rows.map(this.map);
  }

  async findById(id: string, workspaceId: string): Promise<Project | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      `SELECT * FROM project WHERE id = ? AND workspace_id = ? LIMIT 1`,
      [id, workspaceId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByIdForWorkerTask(id: string): Promise<Project | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      'SELECT * FROM project WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByCode(code: string, workspaceId: string): Promise<Project | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      `SELECT * FROM project WHERE code = ? AND workspace_id = ? LIMIT 1`,
      [code, workspaceId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  /**
   * 写操作后按主键回读。调用方已通过作用域查询确认过该行归属，
   * 此处只是把更新结果读回来，因此不再重复过滤工作空间。
   */
  private async readById(id: string): Promise<Project | null> {
    const db = await this.database.connection();
    const [rows] = await db.query<ProjectRow[]>(
      'SELECT * FROM project WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(workspaceId: string, input: CreateProjectInput): Promise<Project> {
    const db = await this.database.connection();
    const id = randomUUID();
    await db.execute(
      `INSERT INTO project
       (id, workspace_id, name, code, repository_url, production_branch)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        workspaceId,
        input.name,
        input.code,
        input.repositoryUrl,
        input.productionBranch,
      ],
    );
    return (await this.readById(id))!;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const current = await this.readById(id);
    if (!current) throw new Error(`Project ${id} not found`);
    const next = { ...current, ...input };
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project
       SET name = ?, code = ?, repository_url = ?, production_branch = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        next.name,
        next.code,
        next.repositoryUrl,
        next.productionBranch,
        id,
      ],
    );
    if (
      next.repositoryUrl !== current.repositoryUrl ||
      next.productionBranch !== current.productionBranch
    ) {
      await db.execute(
        `UPDATE project
         SET detected_commit = NULL, previous_detected_commit = NULL,
             pending_commit_count = 0, pending_commits = NULL,
             last_checked_at = NULL, check_status = 'IDLE', check_error = NULL
         WHERE id = ?`,
        [id],
      );
    }
    return (await this.readById(id))!;
  }

  async remove(id: string): Promise<void> {
    const db = await this.database.connection();
    await db.execute('DELETE FROM project WHERE id = ?', [id]);
  }

  async updateLastAnalyzedCommit(id: string, commit: string): Promise<void> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project
       SET last_analyzed_commit = ?, detected_commit = ?,
           previous_detected_commit = ?, pending_commit_count = 0,
           pending_commits = JSON_ARRAY(), check_status = 'SUCCESS',
           check_error = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [commit, commit, commit, id],
    );
  }

  async markInspectionRunning(id: string): Promise<void> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project
       SET check_status = 'RUNNING', check_error = NULL,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [id],
    );
  }

  async completeInspection(
    id: string,
    input: {
      detectedCommit: string;
      previousDetectedCommit: string;
      pendingCommits: CommitSummary[];
    },
  ): Promise<Project> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project
       SET detected_commit = ?, previous_detected_commit = ?,
           pending_commit_count = ?, pending_commits = ?,
           last_checked_at = CURRENT_TIMESTAMP(3), check_status = 'SUCCESS',
           check_error = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        input.detectedCommit,
        input.previousDetectedCommit,
        input.pendingCommits.length,
        JSON.stringify(input.pendingCommits),
        id,
      ],
    );
    return (await this.readById(id))!;
  }

  async failInspection(id: string, errorMessage: string): Promise<Project> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project
       SET last_checked_at = CURRENT_TIMESTAMP(3), check_status = 'FAILED',
           check_error = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [errorMessage.slice(0, 2000), id],
    );
    return (await this.readById(id))!;
  }

  async createInspectionLog(
    projectId: string,
    triggerType: InspectionTrigger,
  ): Promise<string> {
    const db = await this.database.connection();
    const id = randomUUID();
    await db.execute(
      `INSERT INTO project_inspection_log
       (id, project_id, trigger_type, status)
       VALUES (?, ?, ?, 'RUNNING')`,
      [id, projectId, triggerType],
    );
    return id;
  }

  async completeInspectionLog(
    id: string,
    input: { detectedCommit: string; pendingCommitCount: number },
  ): Promise<void> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project_inspection_log
       SET status = 'SUCCESS', detected_commit = ?, pending_commit_count = ?,
           finished_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [input.detectedCommit, input.pendingCommitCount, id],
    );
  }

  async failInspectionLog(id: string, errorMessage: string): Promise<void> {
    const db = await this.database.connection();
    await db.execute(
      `UPDATE project_inspection_log
       SET status = 'FAILED', error_message = ?,
           finished_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [errorMessage.slice(0, 2000), id],
    );
  }

  async findInspectionLogs(
    query: InspectionLogQuery,
    workspaceId: string,
  ): Promise<InspectionLogPage> {
    const db = await this.database.connection();
    const page = Math.max(Math.trunc(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 10), 5), 50);
    const conditions: string[] = ['project.workspace_id = ?'];
    const params: unknown[] = [workspaceId];
    if (query.projectId) {
      conditions.push('log.project_id = ?');
      params.push(query.projectId);
    }
    if (query.status) {
      conditions.push('log.status = ?');
      params.push(query.status);
    }
    if (query.triggerType) {
      conditions.push('log.trigger_type = ?');
      params.push(query.triggerType);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [summaryRows] = await db.query<InspectionLogSummaryRow[]>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(log.status = 'SUCCESS'), 0) AS success,
              COALESCE(SUM(log.status = 'FAILED'), 0) AS failed,
              COALESCE(SUM(log.status = 'RUNNING'), 0) AS running
       FROM project_inspection_log log
       INNER JOIN project ON project.id = log.project_id
       ${where}`,
      params,
    );
    const summary = summaryRows[0] ?? { total: 0, success: 0, failed: 0, running: 0 };
    const total = Number(summary.total);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const [rows] = await db.query<InspectionLogRow[]>(
      `SELECT log.*, project.name AS project_name, project.code AS project_code
       FROM project_inspection_log log
       INNER JOIN project ON project.id = log.project_id
       ${where}
       ORDER BY log.started_at DESC, log.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        projectCode: row.project_code,
        triggerType: row.trigger_type,
        status: row.status,
        detectedCommit: row.detected_commit,
        pendingCommitCount: row.pending_commit_count,
        errorMessage: row.error_message,
        startedAt: new Date(row.started_at).toISOString(),
        finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      })),
      total,
      page: currentPage,
      pageSize,
      totalPages,
      summary: {
        success: Number(summary.success),
        failed: Number(summary.failed),
        running: Number(summary.running),
      },
    };
  }

  async cleanupInspectionLogs(olderThan: Date): Promise<number> {
    const db = await this.database.connection();
    const [result] = await db.execute(
      `DELETE FROM project_inspection_log
       WHERE started_at < ? AND status <> 'RUNNING'`,
      [olderThan],
    );
    return (result as { affectedRows: number }).affectedRows;
  }

  private map(row: ProjectRow): Project {
    const pendingCommits = row.pending_commits
      ? typeof row.pending_commits === 'string'
        ? (JSON.parse(row.pending_commits) as CommitSummary[])
        : row.pending_commits
      : [];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      code: row.code,
      repositoryUrl: row.repository_url,
      productionBranch: row.production_branch,
      lastAnalyzedCommit: row.last_analyzed_commit,
      detectedCommit: row.detected_commit,
      previousDetectedCommit: row.previous_detected_commit,
      pendingCommitCount: row.pending_commit_count,
      pendingCommits,
      lastCheckedAt: row.last_checked_at
        ? new Date(row.last_checked_at).toISOString()
        : null,
      checkStatus: row.check_status,
      checkError: row.check_error,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
