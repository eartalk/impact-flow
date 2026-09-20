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
}

export type CodeSymbolKind =
  | 'CLASS'
  | 'METHOD'
  | 'FUNCTION'
  | 'INTERFACE'
  | 'TYPE'
  | 'PROPERTY';

export interface CodeSymbolReference {
  key: string;
  name: string;
  qualifiedName: string;
  kind: CodeSymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
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
  commits?: CommitSummary[];
  files?: ChangedFile[];
  createdAt: string;
  finishedAt: string | null;
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
