import type {
  CreateProjectInput,
  InspectionLogPage,
  InspectionLogQuery,
  InspectionTrigger,
  Project,
  UpdateProjectInput,
} from '@impact-flow/contracts';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

/**
 * 工作空间作用域约定：
 * - 不加后缀的方法一律**必须**显式传入 workspaceId，用于所有面向用户会话的业务读取。
 *   禁止以可选参数形式提供，避免调用方漏传后静默跨工作空间读取。
 * - 以 `ForScheduler` / `ForWorkerTask` 结尾的方法是无作用域的系统级查询，
 *   仅允许定时调度器与后台任务执行器调用，调用处必须有明确注释说明为何可以跨工作空间。
 */
export interface ProjectRepository {
  findAll(workspaceId: string): Promise<Project[]>;
  findById(id: string, workspaceId: string): Promise<Project | null>;
  findByCode(code: string, workspaceId: string): Promise<Project | null>;
  /**
   * 系统级：定时调度器遍历**全部 ACTIVE 工作空间**的项目，再按 workspaceId 分别套用策略。
   * 归档工作空间的项目不会返回——归档语义是停止巡检与自动分析。
   */
  findAllForScheduler(): Promise<Project[]>;
  /**
   * 系统级：分析任务执行器加载项目。执行器没有用户会话，
   * projectId 来自受信的 analysis_task 记录，加载后必须以返回值中的 workspaceId 约束后续查询。
   */
  findByIdForWorkerTask(id: string): Promise<Project | null>;
  create(workspaceId: string, input: CreateProjectInput): Promise<Project>;
  update(id: string, input: UpdateProjectInput): Promise<Project>;
  remove(id: string): Promise<void>;
  updateLastAnalyzedCommit(id: string, commit: string): Promise<void>;
  markInspectionRunning(id: string): Promise<void>;
  completeInspection(
    id: string,
    input: {
      detectedCommit: string;
      previousDetectedCommit: string;
      pendingCommits: import('@impact-flow/contracts').CommitSummary[];
    },
  ): Promise<Project>;
  failInspection(id: string, errorMessage: string): Promise<Project>;
  createInspectionLog(
    projectId: string,
    triggerType: InspectionTrigger,
  ): Promise<string>;
  completeInspectionLog(
    id: string,
    input: { detectedCommit: string; pendingCommitCount: number },
  ): Promise<void>;
  failInspectionLog(id: string, errorMessage: string): Promise<void>;
  findInspectionLogs(
    query: InspectionLogQuery,
    workspaceId: string,
  ): Promise<InspectionLogPage>;
  cleanupInspectionLogs(olderThan: Date): Promise<number>;
}
