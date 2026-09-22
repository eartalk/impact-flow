export const GIT_GATEWAY = Symbol('GIT_GATEWAY');

export interface GitGateway {
  testConnection(input: {
    repositoryUrl: string;
    productionBranch: string;
  }): Promise<{ remoteCommit: string }>;

  detectVersion(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    lastAnalyzedCommit: string | null;
  }): Promise<{
    baseCommit: string;
    targetCommit: string;
    baseSource: 'LAST_ANALYSIS' | 'FIRST_PARENT';
  }>;

  /**
   * 返回生产分支区间内第一父链上的合并提交，用于展示“待检测合并”和间隔合并次数。
   * 变更分析本身仍由 analyzeRange 返回完整提交范围。
   */
  listCommits(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    baseCommit: string;
    targetCommit: string;
  }): Promise<import('@impact-flow/contracts').CommitSummary[]>;

  analyzeRange(input: {
    projectId: string;
    repositoryUrl: string;
    productionBranch: string;
    baseCommit: string;
    targetCommit: string;
    onRepositoryReady?: () => Promise<void>;
  }): Promise<{
    commits: import('@impact-flow/contracts').CommitSummary[];
    files: import('@impact-flow/contracts').ChangedFile[];
    changeEvidence: import('@impact-flow/contracts').ChangeEvidence[];
    additions: number;
    deletions: number;
  }>;
}
