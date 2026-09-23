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
    const service = createService({ analyses, projects });
    const enqueue = jest
      .spyOn(service as unknown as { enqueue(id: string): void }, 'enqueue')
      .mockImplementation(() => undefined);

    await expect(service.rerun(source.id, 'workspace-1')).resolves.toBe(created);
    expect(analyses.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: source.projectId,
      baseCommit: source.baseCommit,
      targetCommit: source.targetCommit,
      status: 'READY',
    }));
    expect(enqueue).toHaveBeenCalledWith(created.id);
  });

  it('produces the regression plan in the same analysis run', async () => {
    const source = analysisTask({ status: 'READY', finishedAt: null });
    const completed = analysisTask({ status: 'SUCCESS' });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(),
      updateProgress: jest.fn(),
      complete: jest.fn().mockResolvedValue(completed),
      fail: jest.fn(),
    };
    const projects = workerProjects(source);
    const git = gitResult();
    const symbols = symbolResult();
    const ai = {
      analyze: jest.fn().mockResolvedValue({
        status: 'DISABLED', summary: null, riskLevel: null, keyFindings: [],
        regressionSuggestions: [], model: null, analyzedAt: null, errorMessage: null,
      }),
    };
    const service = createService({ analyses, projects, git, symbols, ai });

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(ai.analyze).toHaveBeenCalledWith(expect.objectContaining({
      analysisContext: expect.objectContaining({ targetCommit: source.targetCommit }),
      changeUnits: expect.any(Array),
    }));
    expect(analyses.complete).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({
        analysisContext: expect.any(Object),
        changeUnits: expect.any(Array),
        regressionPlan: expect.objectContaining({ version: 4, generatedBy: 'STATIC' }),
      }),
      undefined,
    );
    expect(analyses.updateProgress.mock.calls.map((call) => call[1].stage)).toEqual([
      'SYNCING_REPOSITORY',
      'ANALYZING_SYMBOLS',
      'INTERPRETING_CHANGES',
      'EXPLORING_DEPENDENCIES',
      'RESOLVING_SCENARIOS',
      'PLANNING_REGRESSION',
      'SAVING_RESULT',
    ]);
  });

  it('captures only repositories returned for the task workspace', async () => {
    const source = analysisTask({ status: 'READY' });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(),
      complete: jest.fn().mockResolvedValue(analysisTask()),
      fail: jest.fn(),
    };
    const projects = workerProjects(source);
    projects.findAll.mockResolvedValue([
      { id: source.projectId, name: source.projectName, detectedCommit: 'self-commit' },
      { id: 'related', name: '关联前端', detectedCommit: 'related-commit' },
    ]);
    const symbols = symbolResult();
    const service = createService({ analyses, projects, git: gitResult(), symbols });

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(projects.findAll).toHaveBeenCalledWith('workspace-1');
    expect(symbols.analyzeRange).toHaveBeenCalledWith(expect.objectContaining({
      relatedRepositories: [{
        projectId: 'related', projectName: '关联前端', targetCommit: 'related-commit',
      }],
    }));
  });

  it('skips Symbol and AI analysis when a change contains only ordinary documentation', async () => {
    const source = analysisTask({ status: 'READY', finishedAt: null });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(), updateProgress: jest.fn(),
      complete: jest.fn().mockImplementation(async (_id, result) => ({ ...source, ...result, status: 'SUCCESS' })),
      fail: jest.fn(),
    };
    const projects = workerProjects(source);
    const git = {
      analyzeRange: jest.fn().mockResolvedValue({
        commits: [], additions: 8, deletions: 1, changeEvidence: [],
        files: [
          { path: 'README.md', oldPath: null, changeType: 'M', additions: 5, deletions: 1 },
          { path: 'docs/design.md', oldPath: null, changeType: 'M', additions: 3, deletions: 0 },
        ],
      }),
    };
    const symbols = symbolResult();
    const ai = { analyze: jest.fn() };
    const service = createService({ analyses, projects, git, symbols, ai });

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(symbols.analyzeRange).not.toHaveBeenCalled();
    expect(ai.analyze).not.toHaveBeenCalled();
    expect(analyses.complete).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({
        riskLevel: 'LOW',
        riskSummary: expect.stringContaining('无需业务回归'),
        changeUnits: [],
        regressionPlan: expect.objectContaining({ targets: [] }),
        analysisContext: expect.objectContaining({
          relevance: expect.objectContaining({ ignored: 2, businessRelevant: 0 }),
        }),
      }),
      undefined,
    );
  });

  it('sends only business-relevant files to Symbol and AI analysis for mixed changes', async () => {
    const source = analysisTask({ status: 'READY', finishedAt: null });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(), updateProgress: jest.fn(),
      complete: jest.fn().mockResolvedValue(analysisTask({ status: 'SUCCESS' })),
      fail: jest.fn(),
    };
    const projects = workerProjects(source);
    const files = [
      { path: 'README.md', oldPath: null, changeType: 'M', additions: 2, deletions: 0 },
      { path: 'src/order.service.ts', oldPath: null, changeType: 'M', additions: 3, deletions: 1 },
      { path: 'Dockerfile', oldPath: null, changeType: 'M', additions: 1, deletions: 1 },
    ];
    const git = { analyzeRange: jest.fn().mockResolvedValue({
      commits: [], files, additions: 6, deletions: 2,
      changeEvidence: files.map((file) => ({ filePath: file.path, oldPath: null, hunks: [] })),
    }) };
    const symbols = symbolResult();
    const ai = { analyze: jest.fn().mockResolvedValue({ status: 'DISABLED' }) };
    const service = createService({ analyses, projects, git, symbols, ai });

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(symbols.analyzeRange).toHaveBeenCalledWith(expect.objectContaining({
      includePaths: ['src/order.service.ts'],
    }));
    expect(ai.analyze).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({ path: 'src/order.service.ts' })],
      additions: 3,
      deletions: 1,
      changeEvidence: [expect.objectContaining({ filePath: 'src/order.service.ts' })],
    }));
    expect(analyses.complete).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({
        files,
        analysisContext: expect.objectContaining({
          relevance: expect.objectContaining({
            businessRelevant: 1, technicalValidation: 1, ignored: 1,
          }),
        }),
      }),
      undefined,
    );
  });

  it('lists workspace logs without requiring a project filter', async () => {
    const analyses = { listLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const projects = { findById: jest.fn() };
    const service = createService({ analyses, projects });

    await service.listLogs({ type: 'CHANGE_ANALYSIS', status: 'FAILED' }, 'workspace-1');

    expect(projects.findById).not.toHaveBeenCalled();
    expect(analyses.listLogs).toHaveBeenCalled();
  });

  it('persists a user decision for a regression target and allows resetting it', async () => {
    const source = analysisTask({
      regressionPlan: {
        version: 2, summary: '订单提交变化', riskLevel: 'HIGH', unknowns: [],
        generatedBy: 'STATIC', model: null, generatedAt: new Date().toISOString(),
        targets: [{
          title: '订单提交', scope: '提交链路变化', priority: 'P1', id: 'target:order-submit',
          reason: '订单提交可能受影响', verificationPoints: [], relatedTests: [],
        }],
      },
    });
    const analyses = {
      findById: jest.fn().mockResolvedValue(source),
      updateRegressionFeedback: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ analyses });
    const user = { id: 'user-1', username: 'tester', displayName: '测试同学', status: 'ACTIVE' as const };

    const confirmed = await service.updateRegressionFeedback(
      source.id, 'target:order-submit', { decision: 'CONFIRMED' }, 'workspace-1', user,
    );
    expect(confirmed.regressionFeedback).toEqual([
      expect.objectContaining({
        targetId: 'target:order-submit', decision: 'CONFIRMED', updatedBy: 'user-1',
      }),
    ]);
    expect(analyses.updateRegressionFeedback).toHaveBeenCalledWith(
      source.id,
      expect.arrayContaining([expect.objectContaining({ decision: 'CONFIRMED' })]),
    );

    analyses.findById.mockResolvedValue({ ...source, regressionFeedback: confirmed.regressionFeedback });
    const reset = await service.updateRegressionFeedback(
      source.id, 'target:order-submit', { decision: 'PENDING' }, 'workspace-1', user,
    );
    expect(reset.regressionFeedback).toEqual([]);
  });
});

function createService(overrides: Record<string, any> = {}) {
  return new AnalysesService(
    (overrides.analyses ?? {}) as never,
    (overrides.projects ?? {}) as never,
    (overrides.git ?? {}) as never,
    (overrides.symbols ?? {}) as never,
    (overrides.ai ?? { analyze: jest.fn().mockResolvedValue({ status: 'DISABLED' }) }) as never,
  );
}

function workerProjects(source: AnalysisTask) {
  return {
    findByIdForWorkerTask: jest.fn().mockResolvedValue({
      id: source.projectId,
      workspaceId: 'workspace-1',
      name: source.projectName,
      repositoryUrl: 'https://example.test/repository.git',
      productionBranch: 'production',
    }),
    findAll: jest.fn().mockResolvedValue([]),
    updateLastAnalyzedCommit: jest.fn(),
  };
}

function gitResult() {
  return {
    analyzeRange: jest.fn().mockResolvedValue({
      commits: [],
      files: [{
        path: 'src/order.service.ts', oldPath: null, changeType: 'M', additions: 3, deletions: 1,
      }],
      changeEvidence: [],
      additions: 3,
      deletions: 1,
    }),
  };
}

function symbolResult() {
  return {
    analyzeRange: jest.fn().mockResolvedValue({
      symbolSummary: '识别到 1 个变更 Symbol',
      symbolChanges: [],
      symbolImpacts: [],
    }),
  };
}

function analysisTask(overrides: Partial<AnalysisTask> = {}): AnalysisTask {
  return {
    id: 'source-task', projectId: 'project-1', projectName: '订单服务',
    baseCommit: 'base-commit', targetCommit: 'target-commit', status: 'SUCCESS',
    commitCount: 1, changedFileCount: 1, additions: 10, deletions: 2,
    errorMessage: null, riskLevel: 'LOW', riskSummary: '低风险',
    impactedModules: [], regressionSuggestions: [], symbolSummary: null,
    symbolChanges: [], symbolImpacts: [], createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...overrides,
  };
}
