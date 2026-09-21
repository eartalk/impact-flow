import type { Project } from '@impact-flow/contracts';
import { AutomationScheduler } from './automation.scheduler';

describe('AutomationScheduler', () => {
  it('starts change and AI analysis after a scheduled inspection when enabled', async () => {
    const project = inspectedProject();
    const projects = {
      cleanupInspectionLogs: jest.fn().mockResolvedValue(undefined),
      listForScheduler: jest.fn().mockResolvedValue([project]),
      inspectVersion: jest.fn().mockResolvedValue(project),
    };
    const analyses = { create: jest.fn().mockResolvedValue(undefined) };
    const policies = {
      getConfig: jest.fn().mockResolvedValue({
        autoInspectionEnabled: true,
        autoChangeAnalysisEnabled: true,
        autoAiAnalysisEnabled: true,
        updatedAt: null,
      }),
    };
    const scheduler = new AutomationScheduler(
      projects as never,
      analyses as never,
      policies as never,
    );

    await (scheduler as unknown as { inspect(): Promise<void> }).inspect();

    // 调度器必须走显式的跨工作空间入口，而不是业务查询方法
    expect(projects.listForScheduler).toHaveBeenCalled();
    expect(projects.inspectVersion).toHaveBeenCalledWith(
      project.id,
      project.workspaceId,
      'SCHEDULED',
    );
    expect(analyses.create).toHaveBeenCalledWith(
      project.id,
      project.workspaceId,
      { aiAnalysisRequested: true },
    );
  });

  it('does not inspect or analyze projects when automatic inspection is disabled', async () => {
    const projects = {
      cleanupInspectionLogs: jest.fn().mockResolvedValue(undefined),
      listForScheduler: jest.fn().mockResolvedValue([inspectedProject()]),
      inspectVersion: jest.fn(),
    };
    const analyses = { create: jest.fn() };
    const policies = {
      getConfig: jest.fn().mockResolvedValue({
        autoInspectionEnabled: false,
        autoChangeAnalysisEnabled: false,
        autoAiAnalysisEnabled: false,
        updatedAt: null,
      }),
    };
    const scheduler = new AutomationScheduler(
      projects as never,
      analyses as never,
      policies as never,
    );

    await (scheduler as unknown as { inspect(): Promise<void> }).inspect();

    expect(projects.inspectVersion).not.toHaveBeenCalled();
    expect(analyses.create).not.toHaveBeenCalled();
  });
});

function inspectedProject(): Project {
  return {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: '订单服务',
    code: 'order-service',
    repositoryUrl: 'https://example.test/order.git',
    productionBranch: 'production',
    lastAnalyzedCommit: 'base',
    detectedCommit: 'target',
    previousDetectedCommit: 'base',
    pendingCommitCount: 1,
    pendingCommits: [],
    lastCheckedAt: new Date().toISOString(),
    checkStatus: 'SUCCESS',
    checkError: null,
    createdAt: new Date().toISOString(),
  };
}
