export type AnalysisStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'NO_CHANGES'
  /** 工作空间归档时，尚未运行的 READY 任务会被置为已取消 */
  | 'CANCELLED';

export type AnalysisProgressStage =
  | 'QUEUED'
  | 'SYNCING_REPOSITORY'
  | 'CALCULATING_DIFF'
  | 'ANALYZING_IMPACT'
  | 'ANALYZING_SYMBOLS'
  | 'SAVING_RESULT'
  | 'COMPLETED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ImpactModule {
  name: string;
  reason: string;
  fileCount: number;
  riskLevel: RiskLevel;
}

export interface RegressionSuggestion {
  title: string;
  scope: string;
  priority: 'P0' | 'P1' | 'P2';
  /** 回归对象类型；用于回答“具体要回归哪里”。 */
  targetType?: 'PAGE' | 'API' | 'JOB' | 'MODULE' | 'DATA' | 'CONFIG' | 'SYMBOL' | 'FILE';
  /** 该对象与本次代码变更之间的关系。 */
  impactRelation?: 'DIRECT' | 'UPSTREAM' | 'CROSS_REPOSITORY' | 'RELATED' | 'UNKNOWN';
  /** 静态分析对该范围的确认程度，而不是测试执行状态。 */
  coverageStatus?: 'CONFIRMED' | 'RECOMMENDED' | 'NEEDS_REVIEW';
  /** 面向产品和测试人员的业务域，例如“工地问题”“工期管理”。 */
  businessDomain?: string;
  /** 面向产品和测试人员的具体业务动作或场景。 */
  businessScenario?: string;
  /** 静态分析最终追踪到的业务边界类型。 */
  boundaryType?: 'HTTP' | 'PAGE' | 'JOB' | 'MESSAGE' | 'DATA' | 'TECHNICAL' | 'UNKNOWN';
  /** 调用关系本身的可信程度。 */
  technicalConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 业务命名和归属的可信程度。 */
  businessConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 被该业务范围覆盖的原始变更 Symbol，用于计算覆盖率。 */
  sourceSymbolKeys?: string[];
  entryPoints?: string[];
  scenarios?: string[];
  steps?: string[];
  expectedResults?: string[];
  evidence?: string[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ChangeEvidence {
  filePath: string;
  oldPath: string | null;
  changeType: FileChangeType;
  patch: string;
  truncated: boolean;
}

export type AiAnalysisStatus = 'DISABLED' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface AiAnalysisResult {
  status: AiAnalysisStatus;
  summary: string | null;
  riskLevel: RiskLevel | null;
  keyFindings: string[];
  regressionSuggestions: RegressionSuggestion[];
  model: string | null;
  analyzedAt: string | null;
  errorMessage: string | null;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface AiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiFormat: 'OPENAI' | 'ANTHROPIC';
  enabled: boolean;
  isDefault: boolean;
  apiKeyMasked: string;
  timeoutMs: number;
  maxFiles: number;
  maxSymbols: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiProviderConfigInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat: 'OPENAI' | 'ANTHROPIC';
  enabled: boolean;
  isDefault: boolean;
  timeoutMs: number;
  maxFiles: number;
  maxSymbols: number;
}

export type UpdateAiProviderConfigInput = Partial<CreateAiProviderConfigInput>;

export interface AiProviderConnectionTest {
  success: boolean;
  message: string;
  model: string;
  latencyMs: number;
  checkedAt: string;
}

export interface PendingNotificationConfig {
  enabled: boolean;
  webhookConfigured: boolean;
  webhookMasked: string | null;
  updatedAt: string | null;
}

export interface UpdatePendingNotificationConfigInput {
  enabled: boolean;
  dingTalkWebhook?: string;
}

export interface PendingNotificationConnectionTest {
  success: boolean;
  message: string;
  checkedAt: string;
}

export type AutomationCode =
  | 'AUTO_VERSION_INSPECTION'
  | 'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION'
  | 'AUTO_AI_ANALYSIS_AFTER_CHANGE_ANALYSIS';

export interface AutomationConfig {
  autoInspectionEnabled: boolean;
  autoChangeAnalysisEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
  updatedAt: string | null;
}

export interface UpdateAutomationConfigInput {
  autoInspectionEnabled: boolean;
  autoChangeAnalysisEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
}

export type NotificationDeliveryStatus = 'SUCCESS' | 'FAILED';

export type NotificationChannel = 'DINGTALK';

export interface NotificationDeliveryLog {
  id: string;
  projectId: string;
  projectName: string | null;
  projectCode: string | null;
  targetCommit: string;
  shortCommit: string;
  channel: NotificationChannel;
  attempt: number;
  status: NotificationDeliveryStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface NotificationDeliveryLogQuery {
  projectId?: string;
  status?: NotificationDeliveryStatus;
  page?: number;
  pageSize?: number;
}

export interface NotificationDeliveryLogPage {
  items: NotificationDeliveryLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type CodeSymbolKind =
  | 'CLASS'
  | 'METHOD'
  | 'FUNCTION'
  | 'INTERFACE'
  | 'TYPE'
  | 'PROPERTY';

export interface HttpRouteReference {
  method: string;
  path: string;
  role: 'SERVER' | 'CLIENT';
}

export interface CodeSymbolReference {
  key: string;
  name: string;
  qualifiedName: string;
  kind: CodeSymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  projectId?: string;
  projectName?: string;
  httpRoutes?: HttpRouteReference[];
}

export interface SymbolChange extends CodeSymbolReference {
  changeType: 'ADDED' | 'MODIFIED' | 'DELETED';
  riskLevel: RiskLevel;
  reason: string;
}

export interface SymbolImpact {
  changedSymbolKey: string;
  impactedSymbol: CodeSymbolReference;
  depth: number;
  callChain: CodeSymbolReference[];
  reason: string;
}

export type FileChangeType = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface ChangedFile {
  id?: string;
  path: string;
  oldPath: string | null;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  author: string;
  subject: string;
  committedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  code: string;
  repositoryUrl: string;
  productionBranch: string;
  lastAnalyzedCommit: string | null;
  detectedCommit: string | null;
  previousDetectedCommit: string | null;
  /** 待检测合并数量；属性名为历史API兼容保留。 */
  pendingCommitCount: number;
  /** 待检测合并提交摘要；属性名为历史API兼容保留。 */
  pendingCommits?: CommitSummary[];
  lastCheckedAt: string | null;
  checkStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  checkError: string | null;
  createdAt: string;
}

export type InspectionTrigger = 'SCHEDULED' | 'MANUAL';

export interface InspectionLog {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  triggerType: InspectionTrigger;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  detectedCommit: string | null;
  /** 本次巡检发现的待检测合并数量；属性名为历史API兼容保留。 */
  pendingCommitCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface InspectionLogQuery {
  page?: number;
  pageSize?: number;
  projectId?: string;
  status?: InspectionLog['status'];
  triggerType?: InspectionTrigger;
}

export interface InspectionLogPage {
  items: InspectionLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    success: number;
    failed: number;
    running: number;
  };
}

export interface VersionDetection {
  projectId: string;
  branch: string;
  baseCommit: string;
  targetCommit: string;
  baseSource: 'LAST_ANALYSIS' | 'FIRST_PARENT';
  hasChanges: boolean;
  detectedAt: string;
}

export interface AnalysisTask {
  id: string;
  projectId: string;
  projectName: string;
  baseCommit: string;
  targetCommit: string;
  status: AnalysisStatus;
  commitCount: number;
  changedFileCount: number;
  additions: number;
  deletions: number;
  errorMessage: string | null;
  riskLevel: RiskLevel | null;
  riskSummary: string | null;
  impactedModules?: ImpactModule[];
  regressionSuggestions?: RegressionSuggestion[];
  symbolSummary?: string | null;
  symbolChanges?: SymbolChange[];
  symbolImpacts?: SymbolImpact[];
  changeEvidence?: ChangeEvidence[];
  aiAnalysis?: AiAnalysisResult | null;
  aiAnalysisRequested: boolean;
  commits?: CommitSummary[];
  files?: ChangedFile[];
  createdAt: string;
  finishedAt: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  progressStage?: AnalysisProgressStage;
  progressPercent?: number;
  progressMessage?: string | null;
  progressUpdatedAt?: string | null;
  startedAt?: string | null;
  aiAttemptCount?: number;
  aiMaxAttempts?: number;
  aiNextAttemptAt?: string | null;
}

export type AnalysisLogType = 'CHANGE_ANALYSIS' | 'AI_ANALYSIS';

export type AnalysisLogStatus = AnalysisStatus | AiAnalysisStatus;

export interface AnalysisExecutionLog {
  id: string;
  analysisId: string;
  projectId: string;
  projectName: string;
  type: AnalysisLogType;
  status: AnalysisStatus | AiAnalysisStatus;
  baseCommit: string;
  targetCommit: string;
  model: string | null;
  errorMessage: string | null;
  tokenUsage: AiAnalysisResult['tokenUsage'] | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  attemptCount?: number;
  maxAttempts?: number;
  progressStage?: AnalysisProgressStage;
  attempt?: number;
}

export interface AnalysisLogQuery {
  type: AnalysisLogType;
  projectId?: string;
  status?: AnalysisLogStatus;
  page?: number;
  pageSize?: number;
}

export interface AnalysisLogPage {
  items: AnalysisExecutionLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RepositoryConnectionTest {
  success: boolean;
  message: string;
  branch: string;
  remoteCommit: string | null;
  checkedAt: string;
}

export interface CreateProjectInput {
  name: string;
  code: string;
  repositoryUrl: string;
  productionBranch: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type WorkspaceStatus = 'ACTIVE' | 'ARCHIVED';

/** 建设工作空间的用户级策略，不复用工作空间内的角色 */
export type WorkspaceCreationMode = 'ANY_USER' | 'ADMIN_ONLY' | 'DISABLED';

export interface WorkspaceOverview {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  ownerUserId: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateWorkspaceInput {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string | null;
}

export interface WorkspaceCreationPolicy {
  mode: WorkspaceCreationMode;
  allowed: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  code: string;
  role: WorkspaceRole;
  /** 会话所在工作空间的状态；ARCHIVED 表示当前处于只读管理态 */
  status: WorkspaceStatus;
}

export interface AuthSession {
  user: AuthUser;
  workspace: WorkspaceSummary;
}

export interface BootstrapStatus {
  required: boolean;
}

export interface BootstrapInput {
  username: string;
  password: string;
  displayName: string;
  workspaceName: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  password: string;
  displayName: string;
  workspaceName: string;
  workspaceCode: string;
  workspaceDescription?: string;
}

export interface WorkspaceMember {
  userId: string;
  username: string;
  displayName: string;
  status: AuthUser['status'];
  role: WorkspaceRole;
  joinedAt: string;
}

export interface CreateWorkspaceMemberInput {
  username: string;
  password: string;
  displayName: string;
  role: Exclude<WorkspaceRole, 'OWNER'>;
}

export interface AuditLog {
  id: string;
  workspaceId: string | null;
  operatorId: string | null;
  operatorName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  /** 脱敏后的变更摘要，不包含密码、令牌或完整密钥 */
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  action?: string;
  operatorId?: string;
  resourceType?: string;
  /** ISO 时间，含起始与结束 */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
