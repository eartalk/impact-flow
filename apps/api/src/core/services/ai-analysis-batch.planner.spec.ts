import type { AiAnalysisInput } from '../ports/ai-analyzer.gateway';
import { AiAnalysisBatchPlanner } from './ai-analysis-batch.planner';

describe('AiAnalysisBatchPlanner', () => {
  it('covers every file across batches instead of truncating the tail', () => {
    const input = analysisInput(['src/a.ts', 'src/b.ts', 'database/003.sql']);
    const batches = new AiAnalysisBatchPlanner().plan(input, 2, 50);

    expect(batches).toHaveLength(2);
    expect(batches.flatMap((batch) => batch.files.map((file) => file.path)).sort()).toEqual([
      'database/003.sql', 'src/a.ts', 'src/b.ts',
    ]);
    expect(batches[0]?.files[0]?.path).toBe('database/003.sql');
  });

  it('creates additional batches when one file exceeds the per-batch Symbol limit', () => {
    const input = analysisInput(['src/a.ts']);
    input.symbolAnalysis.symbolChanges = ['one', 'two', 'three'].map((key) => ({
      key, name: key, qualifiedName: key, kind: 'METHOD' as const, filePath: 'src/a.ts',
      startLine: 1, endLine: 2, changeType: 'MODIFIED' as const,
      riskLevel: 'MEDIUM' as const, reason: '方法实现发生变化',
    }));

    const batches = new AiAnalysisBatchPlanner().plan(input, 10, 1);

    expect(batches).toHaveLength(3);
    expect(batches.flatMap((batch) => batch.symbolChanges.map((symbol) => symbol.key)))
      .toEqual(['one', 'two', 'three']);
    expect(batches.every((batch) => batch.files[0]?.path === 'src/a.ts')).toBe(true);
  });
});

function analysisInput(paths: string[]): AiAnalysisInput {
  return {
    workspaceId: 'workspace', projectName: 'demo', baseCommit: 'base', targetCommit: 'target',
    commits: [], additions: 3, deletions: 0,
    files: paths.map((path) => ({ path, oldPath: null, changeType: 'M', additions: 1, deletions: 0 })),
    changeEvidence: [], changeUnits: [],
    ruleAnalysis: { riskLevel: 'LOW', riskSummary: '低风险', impactedModules: [], regressionSuggestions: [] },
    symbolAnalysis: { symbolSummary: 'none', symbolChanges: [], symbolImpacts: [] },
  };
}
