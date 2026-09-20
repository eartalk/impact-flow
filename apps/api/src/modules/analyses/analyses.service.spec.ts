import type { AnalysisTask, Project } from '@impact-flow/contracts';
import { AnalysesService } from './analyses.service';

describe('AnalysesService', () => {
  it('creates a new ready task from an existing version range when rerunning', async () => {
    const source = analysisTask({ status: 'SUCCESS' });
    const created = analysisTask({ id: 'rerun-task', status: 'READY' });
    const analyses = {
      findById: jest.fn().mockResolvedValue(source),
      findActiveByProject: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
    };
    const projects = {
      findById: jest.fn().mockResolvedValue({
        id: source.projectId,
        name: source.projectName,
      } satisfies Partial<Project>),
    };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const enqueue = jest
      .spyOn(service as unknown as { enqueue(id: string): void }, 'enqueue')
      .mockImplementation(() => undefined);

    await expect(service.rerun(source.id)).resolves.toBe(created);
    expect(analyses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: source.projectId,
        baseCommit: source.baseCommit,
        targetCommit: source.targetCommit,
        status: 'READY',
        aiAnalysis: null,
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(created.id);
  });

  it('returns the active project task instead of creating a duplicate rerun', async () => {
    const source = analysisTask({ status: 'SUCCESS' });
    const active = analysisTask({ id: 'active-task', status: 'RUNNING' });
    const analyses = {
      findById: jest.fn().mockResolvedValue(source),
      findActiveByProject: jest.fn().mockResolvedValue(active),
      create: jest.fn(),
    };
    const projects = {
      findById: jest.fn().mockResolvedValue({
        id: source.projectId,
        name: source.projectName,
      } satisfies Partial<Project>),
    };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.rerun(source.id)).resolves.toBe(active);
    expect(analyses.create).not.toHaveBeenCalled();
  });

  it('queues AI analysis separately for a completed smart detection', async () => {
    const source = analysisTask({ status: 'SUCCESS', aiAnalysis: null });
    const pending = analysisTask({
      status: 'SUCCESS',
      aiAnalysis: {
        status: 'RUNNING',
        summary: null,
        riskLevel: null,
        keyFindings: [],
        regressionSuggestions: [],
        model: null,
        analyzedAt: null,
        errorMessage: null,
      },
    });
    const analyses = {
      findById: jest.fn().mockResolvedValue(source),
      startAiAnalysis: jest.fn().mockResolvedValue(pending),
    };
    const service = new AnalysesService(
      analyses as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const enqueueAi = jest
      .spyOn(service as unknown as { enqueueAi(id: string): void }, 'enqueueAi')
      .mockImplementation(() => undefined);

    await expect(service.analyzeWithAi(source.id)).resolves.toBe(pending);
    expect(analyses.startAiAnalysis).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ status: 'RUNNING' }),
    );
    expect(enqueueAi).toHaveBeenCalledWith(source.id);
  });

  it('does not invoke AI while processing a smart detection', async () => {
    const source = analysisTask({ status: 'READY' });
    const analyses = {
      findById: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(),
      complete: jest.fn().mockResolvedValue(analysisTask()),
      fail: jest.fn(),
    };
    const projects = {
      findById: jest.fn().mockResolvedValue({
        id: source.projectId,
        name: source.projectName,
        repositoryUrl: 'https://example.test/repository.git',
        productionBranch: 'production',
      }),
      findAll: jest.fn().mockResolvedValue([]),
      updateLastAnalyzedCommit: jest.fn(),
    };
    const git = {
      analyzeRange: jest.fn().mockResolvedValue({
        commits: [],
        files: [{
          path: 'src/order.service.ts',
          oldPath: null,
          changeType: 'M',
          additions: 3,
          deletions: 1,
        }],
        additions: 3,
        deletions: 1,
      }),
    };
    const symbols = {
      analyzeRange: jest.fn().mockResolvedValue({
        symbolSummary: '识别到 1 个变更 Symbol',
        symbolChanges: [],
        symbolImpacts: [],
      }),
    };
    const aiAnalyzer = { analyze: jest.fn() };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      git as never,
      symbols as never,
      aiAnalyzer as never,
    );

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(analyses.complete).toHaveBeenCalled();
    expect(aiAnalyzer.analyze).not.toHaveBeenCalled();
  });
});

function analysisTask(overrides: Partial<AnalysisTask> = {}): AnalysisTask {
  return {
    id: 'source-task',
    projectId: 'project-1',
    projectName: '订单服务',
    baseCommit: 'base-commit',
    targetCommit: 'target-commit',
    status: 'SUCCESS',
    commitCount: 1,
    changedFileCount: 1,
    additions: 10,
    deletions: 2,
    errorMessage: null,
    riskLevel: 'LOW',
    riskSummary: '低风险',
    impactedModules: [],
    regressionSuggestions: [],
    symbolSummary: null,
    symbolChanges: [],
    symbolImpacts: [],
    aiAnalysis: null,
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...overrides,
  };
}
