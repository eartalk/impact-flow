export type AnalysisStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'NO_CHANGES';

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
  name: string;
  code: string;
  repositoryUrl: string;
  productionBranch: string;
  lastAnalyzedCommit: string | null;
  detectedCommit: string | null;
  previousDetectedCommit: string | null;
  pendingCommitCount: number;
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
  commits?: CommitSummary[];
  files?: ChangedFile[];
  createdAt: string;
  finishedAt: string | null;
}

export type AnalysisLogType = 'CHANGE_ANALYSIS' | 'AI_ANALYSIS';

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
}

export interface AnalysisLogQuery {
  projectId: string;
  type: AnalysisLogType;
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
