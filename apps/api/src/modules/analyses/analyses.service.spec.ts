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
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const enqueue = jest
      .spyOn(service as unknown as { enqueue(id: string): void }, 'enqueue')
      .mockImplementation(() => undefined);

    await expect(service.rerun(source.id, 'workspace-1')).resolves.toBe(created);
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
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.rerun(source.id, 'workspace-1')).resolves.toBe(active);
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
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      startAiAnalysis: jest.fn().mockResolvedValue(pending),
    };
    const service = new AnalysesService(
      analyses as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.analyzeWithAi(source.id, 'workspace-1')).resolves.toBe(pending);
    expect(analyses.startAiAnalysis).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ status: 'RUNNING' }),
    );
  });

  it('does not invoke AI while processing a smart detection', async () => {
    const source = analysisTask({ status: 'READY' });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(),
      updateProgress: jest.fn(),
      complete: jest.fn().mockResolvedValue(analysisTask()),
      fail: jest.fn(),
    };
    const projects = {
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
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      git as never,
      symbols as never,
      aiAnalyzer as never,
    );

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(analyses.complete).toHaveBeenCalled();
    expect(analyses.updateProgress.mock.calls.map((call) => call[1].stage)).toEqual([
      'SYNCING_REPOSITORY',
      'ANALYZING_SYMBOLS',
      'ANALYZING_IMPACT',
      'SAVING_RESULT',
    ]);
    expect(aiAnalyzer.analyze).not.toHaveBeenCalled();
  });

  it('queues AI after an automatically requested change analysis succeeds', async () => {
    const source = analysisTask({
      status: 'READY',
      aiAnalysisRequested: true,
      finishedAt: null,
    });
    const completed = analysisTask({
      status: 'SUCCESS',
      aiAnalysisRequested: true,
    });
    const analyses = {
      findByIdForWorkerTask: jest
        .fn()
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(completed),
      markRunning: jest.fn(),
      complete: jest.fn().mockResolvedValue(completed),
      startAiAnalysis: jest.fn().mockResolvedValue(
        analysisTask({
          aiAnalysisRequested: true,
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
        }),
      ),
      fail: jest.fn(),
    };
    const projects = {
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
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      git as never,
      symbols as never,
      {} as never,
    );
    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    expect(analyses.startAiAnalysis).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ status: 'RUNNING' }),
    );
  });

  it('only treats projects of the same workspace as related repositories', async () => {
    const source = analysisTask({ status: 'READY' });
    const analyses = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue(source),
      markRunning: jest.fn(),
      complete: jest.fn().mockResolvedValue(analysisTask()),
      fail: jest.fn(),
    };
    const projects = {
      findByIdForWorkerTask: jest.fn().mockResolvedValue({
        id: source.projectId,
        workspaceId: 'workspace-1',
        name: source.projectName,
        repositoryUrl: 'https://example.test/repository.git',
        productionBranch: 'production',
      }),
      // 仓储层已按工作空间过滤，这里只返回本空间项目
      findAll: jest.fn().mockResolvedValue([
        {
          id: source.projectId,
          workspaceId: 'workspace-1',
          name: source.projectName,
          detectedCommit: 'self-commit',
        },
        {
          id: 'same-workspace-project',
          workspaceId: 'workspace-1',
          name: '同空间服务',
          detectedCommit: 'same-commit',
        },
      ]),
      updateLastAnalyzedCommit: jest.fn(),
    };
    const git = {
      analyzeRange: jest.fn().mockResolvedValue({
        commits: [],
        files: [
          {
            path: 'src/order.service.ts',
            oldPath: null,
            changeType: 'M',
            additions: 3,
            deletions: 1,
          },
        ],
        additions: 3,
        deletions: 1,
      }),
    };
    const symbols = {
      analyzeRange: jest.fn().mockResolvedValue({
        symbolSummary: 'ok',
        symbolChanges: [],
        symbolImpacts: [],
      }),
    };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      git as never,
      symbols as never,
      {} as never,
    );

    await (service as unknown as { process(id: string): Promise<void> }).process(source.id);

    // 关键：关联仓库查询必须带上被分析项目所属的工作空间
    expect(projects.findAll).toHaveBeenCalledWith('workspace-1');
    const related = symbols.analyzeRange.mock.calls[0][0].relatedRepositories;
    expect(related).toEqual([
      {
        projectId: 'same-workspace-project',
        projectName: '同空间服务',
        targetCommit: 'same-commit',
      },
    ]);
  });

  it('lists workspace logs without requiring a project filter', async () => {
    const analyses = {
      listLogs: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      }),
    };
    const projects = { findById: jest.fn() };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listLogs({ type: 'CHANGE_ANALYSIS', status: 'FAILED' }, 'workspace-1');

    expect(projects.findById).not.toHaveBeenCalled();
    expect(analyses.listLogs).toHaveBeenCalledWith(
      { type: 'CHANGE_ANALYSIS', status: 'FAILED' },
      'workspace-1',
    );
  });

  it('rejects log queries scoped to a project outside the workspace', async () => {
    const analyses = { listLogs: jest.fn() };
    const projects = { findById: jest.fn().mockResolvedValue(null) };
    const service = new AnalysesService(
      analyses as never,
      projects as never,
      { isActive: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listLogs({ type: 'AI_ANALYSIS', projectId: 'foreign-project' }, 'workspace-1'),
    ).rejects.toThrow('项目不存在');
    expect(analyses.listLogs).not.toHaveBeenCalled();
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
    aiAnalysisRequested: overrides.aiAnalysisRequested ?? false,
  };
}
