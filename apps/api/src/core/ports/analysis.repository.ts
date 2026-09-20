import type {
  AnalysisTask,
  ChangedFile,
  CommitSummary,
} from '@impact-flow/contracts';

export const ANALYSIS_REPOSITORY = Symbol('ANALYSIS_REPOSITORY');

export interface AnalysisRepository {
  findAll(): Promise<AnalysisTask[]>;
  findById(id: string): Promise<AnalysisTask | null>;
  findPending(): Promise<AnalysisTask[]>;
  findActiveByProject(projectId: string): Promise<AnalysisTask | null>;
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
    },
  ): Promise<AnalysisTask>;
  fail(id: string, errorMessage: string): Promise<AnalysisTask>;
}
