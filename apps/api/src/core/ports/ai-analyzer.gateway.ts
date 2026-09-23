import type {
  AiAnalysisResult,
  AiProviderConnectionTest,
  AnalysisContextSnapshot,
  ChangeUnit,
  ChangeEvidence,
  ChangedFile,
  CommitSummary,
  ImpactModule,
  RegressionSuggestion,
  RiskLevel,
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';

export const AI_ANALYZER_GATEWAY = Symbol('AI_ANALYZER_GATEWAY');

export interface AiAnalysisInput {
  workspaceId: string;
  projectName: string;
  baseCommit: string;
  targetCommit: string;
  commits: CommitSummary[];
  files: ChangedFile[];
  additions: number;
  deletions: number;
  changeEvidence: ChangeEvidence[];
  analysisContext?: AnalysisContextSnapshot;
  changeUnits?: ChangeUnit[];
  ruleAnalysis: {
    riskLevel: RiskLevel;
    riskSummary: string;
    impactedModules: ImpactModule[];
    regressionSuggestions: RegressionSuggestion[];
  };
  symbolAnalysis: {
    symbolSummary: string;
    symbolChanges: SymbolChange[];
    symbolImpacts: SymbolImpact[];
  };
}

export interface AiAnalyzerGateway {
  analyze(input: AiAnalysisInput): Promise<AiAnalysisResult>;
  testConnection(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
    apiFormat: 'OPENAI' | 'ANTHROPIC';
    timeoutMs: number;
  }): Promise<AiProviderConnectionTest>;
}
