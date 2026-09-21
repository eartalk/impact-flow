import type {
  AnalysisTask,
  AnalysisExecutionLog,
  AnalysisLogPage,
  AnalysisLogQuery,
  AiAnalysisResult,
  ChangeEvidence,
  ChangedFile,
  CommitSummary,
} from '@impact-flow/contracts';

export const ANALYSIS_REPOSITORY = Symbol('ANALYSIS_REPOSITORY');

/**
 * 工作空间作用域约定：
 * - 不加后缀的方法一律**必须**显式传入 workspaceId，用于所有面向用户会话的业务读取。
 *   禁止以可选参数形式提供，避免调用方漏传后静默跨工作空间读取。
 * - 以 `ForWorker` 结尾的方法是无作用域的系统级查询，仅允许应用启动恢复与后台任务执行器调用。
 */
export interface AnalysisRepository {
  findAll(workspaceId: string): Promise<AnalysisTask[]>;
  findById(id: string, workspaceId: string): Promise<AnalysisTask | null>;
  /** 系统级：应用启动时恢复全部工作空间中未完成的基础分析任务 */
  findPendingForWorker(): Promise<AnalysisTask[]>;
  /** 系统级：应用启动时恢复全部工作空间中未完成的 AI 分析任务 */
  findPendingAiForWorker(): Promise<AnalysisTask[]>;
  /** 系统级：应用启动时恢复全部工作空间中已请求但未执行的 AI 分析任务 */
  findRequestedAiForWorker(): Promise<AnalysisTask[]>;
  /** 系统级：任务执行器加载任务，任务自身是作用域的权威来源 */
  findByIdForWorkerTask(id: string): Promise<AnalysisTask | null>;
  /** 原子抢占一条到期任务；支持多实例 SKIP LOCKED 与过期租约恢复。 */
  claimNextForWorker(workerId: string, leaseMs: number): Promise<AnalysisTask | null>;
  /** 失败后重新排队；达到最大次数时转为最终 FAILED。 */
  retryOrFail(
    id: string,
    workerId: string,
    errorMessage: string,
    nextAttemptAt: Date,
  ): Promise<'RETRY' | 'FAILED'>;
  findActiveByProject(
    projectId: string,
    workspaceId: string,
  ): Promise<AnalysisTask | null>;
  listLogs(query: AnalysisLogQuery, workspaceId: string): Promise<AnalysisLogPage>;
  create(input: Omit<AnalysisTask, 'id' | 'createdAt'>): Promise<AnalysisTask>;
  markRunning(id: string): Promise<AnalysisTask>;
  complete(
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
  ): Promise<AnalysisTask>;
  startAiAnalysis(id: string, result: AiAnalysisResult): Promise<AnalysisTask>;
  finishAiAnalysis(id: string, result: AiAnalysisResult): Promise<AnalysisTask>;
  fail(id: string, errorMessage: string): Promise<AnalysisTask>;
}
