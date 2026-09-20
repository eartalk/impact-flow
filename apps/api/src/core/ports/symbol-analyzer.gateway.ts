import type {
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';

export const SYMBOL_ANALYZER_GATEWAY = Symbol('SYMBOL_ANALYZER_GATEWAY');

export interface SymbolAnalysisResult {
  symbolSummary: string;
  symbolChanges: SymbolChange[];
  symbolImpacts: SymbolImpact[];
}

export interface SymbolAnalyzerGateway {
  analyzeRange(input: {
    projectId: string;
    baseCommit: string;
    targetCommit: string;
  }): Promise<SymbolAnalysisResult>;
}
