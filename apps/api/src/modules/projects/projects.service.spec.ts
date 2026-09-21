import type { GitGateway } from '../../core/ports/git.gateway';
import type {
  CommitSummary,
  CreateProjectInput,
  InspectionLog,
  InspectionTrigger,
  Project,
  UpdateProjectInput,
} from '@impact-flow/contracts';
import type { ProjectRepository } from '../../core/ports/project.repository';
import { ProjectsService } from './projects.service';
import type { PendingNotificationsService } from '../pending-notifications/pending-notifications.service';

function notificationService() {
  return {
    notifyIfNeeded: jest.fn().mockResolvedValue(false),
  } as unknown as PendingNotificationsService;
}

class FakeProjectRepository implements ProjectRepository {
  private projects: Project[] = [];
  private inspectionLogs: InspectionLog[] = [];

  async findAll(workspaceId: string) {
    return this.projects.filter((project) => project.workspaceId === workspaceId);
  }
  async findAllForScheduler() {
    return this.projects;
  }
  async findById(id: string, workspaceId: string) {
    return (
      this.projects.find(
        (project) => project.id === id && project.workspaceId === workspaceId,
      ) ?? null
    );
  }
  async findByIdForWorkerTask(id: string) {
    return this.projects.find((project) => project.id === id) ?? null;
  }
  async findByCode(code: string, workspaceId: string) {
    return (
      this.projects.find(
        (project) => project.code === code && project.workspaceId === workspaceId,
      ) ?? null
    );
  }
  async create(workspaceId: string, input: CreateProjectInput) {
    const project: Project = {
      id: 'project-1',
      workspaceId,
      ...input,
      lastAnalyzedCommit: null,
      detectedCommit: null,
      previousDetectedCommit: null,
      pendingCommitCount: 0,
      pendingCommits: [],
      lastCheckedAt: null,
      checkStatus: 'IDLE',
      checkError: null,
      createdAt: new Date().toISOString(),
    };
    this.projects.push(project);
    return project;
  }
  async update(id: string, input: UpdateProjectInput) {
    const project = await this.readById(id);
    if (!project) throw new Error('not found');
    Object.assign(project, input);
    return project;
  }
  async remove(id: string) {
    this.projects = this.projects.filter((project) => project.id !== id);
  }
  async updateLastAnalyzedCommit(id: string, commit: string) {
    const project = await this.readById(id);
    if (project) project.lastAnalyzedCommit = commit;
  }
  async markInspectionRunning(id: string) {
    const project = await this.readById(id);
    if (project) project.checkStatus = 'RUNNING';
  }
  async completeInspection(
    id: string,
    input: {
      detectedCommit: string;
      previousDetectedCommit: string;
      pendingCommits: CommitSummary[];
    },
  ) {
    const project = await this.readById(id);
    if (!project) throw new Error('not found');
    Object.assign(project, {
      ...input,
      pendingCommitCount: input.pendingCommits.length,
      checkStatus: 'SUCCESS' as const,
      checkError: null,
      lastCheckedAt: new Date().toISOString(),
    });
    return project;
  }
  async failInspection(id: string, errorMessage: string) {
    const project = await this.readById(id);
    if (!project) throw new Error('not found');
    project.checkStatus = 'FAILED';
    project.checkError = errorMessage;
    return project;
  }
  async createInspectionLog(
    projectId: string,
    triggerType: InspectionTrigger,
  ) {
    const project = await this.readById(projectId);
    if (!project) throw new Error('not found');
    const id = `log-${this.inspectionLogs.length + 1}`;
    this.inspectionLogs.push({
      id,
      projectId,
      projectName: project.name,
      projectCode: project.code,
      triggerType,
      status: 'RUNNING',
      detectedCommit: null,
      pendingCommitCount: 0,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    return id;
  }
  async completeInspectionLog(
    id: string,
    input: { detectedCommit: string; pendingCommitCount: number },
  ) {
    const log = this.inspectionLogs.find((item) => item.id === id);
    if (log) Object.assign(log, input, { status: 'SUCCESS', finishedAt: new Date().toISOString() });
  }
  async failInspectionLog(id: string, errorMessage: string) {
    const log = this.inspectionLogs.find((item) => item.id === id);
    if (log) Object.assign(log, { status: 'FAILED', errorMessage, finishedAt: new Date().toISOString() });
  }
  async findInspectionLogs(_query: unknown, workspaceId: string) {
    const scoped = this.inspectionLogs.filter((log) => {
      const project = this.projects.find((item) => item.id === log.projectId);
      return project?.workspaceId === workspaceId;
    });
    return {
      items: scoped,
      total: scoped.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      summary: {
        success: scoped.filter((log) => log.status === 'SUCCESS').length,
        failed: scoped.filter((log) => log.status === 'FAILED').length,
        running: scoped.filter((log) => log.status === 'RUNNING').length,
      },
    };
  }
  private readById(id: string) {
    return this.projects.find((project) => project.id === id) ?? null;
  }

  async cleanupInspectionLogs() {
    return 0;
  }
}

describe('ProjectsService', () => {
  it('checks the configured repository and production branch', async () => {
    const repository = new FakeProjectRepository();
    const git: GitGateway = {
      testConnection: jest.fn().mockResolvedValue({ remoteCommit: 'abc123' }),
      detectVersion: jest.fn(),
      listCommits: jest.fn(),
      analyzeRange: jest.fn(),
    };
    const service = new ProjectsService(repository, git, notificationService());
    const project = await service.create('workspace-1', {
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.testConnection(project.id, 'workspace-1');

    expect(result).toEqual(
      expect.objectContaining({ success: true, remoteCommit: 'abc123' }),
    );
    expect(git.testConnection).toHaveBeenCalledWith({
      repositoryUrl: project.repositoryUrl,
      productionBranch: 'production',
    });
  });

  it('uses the configured branch and returns the detected version', async () => {
    const repository = new FakeProjectRepository();
    const git: GitGateway = {
      testConnection: jest.fn(),
      detectVersion: jest.fn().mockResolvedValue({
        baseCommit: 'abc123',
        targetCommit: 'def456',
        baseSource: 'FIRST_PARENT',
      }),
      listCommits: jest.fn().mockResolvedValue([]),
      analyzeRange: jest.fn(),
    };
    const service = new ProjectsService(repository, git, notificationService());
    const project = await service.create('workspace-1', {
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.detectVersion(project.id, 'workspace-1');

    expect(result.targetCommit).toBe('def456');
    expect(result.hasChanges).toBe(true);
    expect(git.detectVersion).toHaveBeenCalledWith(
      expect.objectContaining({ productionBranch: 'production' }),
    );
  });

  it('persists the inspected remote version and pending commits', async () => {
    const repository = new FakeProjectRepository();
    const git: GitGateway = {
      testConnection: jest.fn(),
      detectVersion: jest.fn().mockResolvedValue({
        baseCommit: 'abc123',
        targetCommit: 'def456',
        baseSource: 'FIRST_PARENT',
      }),
      listCommits: jest.fn().mockResolvedValue([
        {
          sha: 'def456',
          shortSha: 'def456',
          author: 'tester',
          subject: '新增接口',
          committedAt: '2026-09-18T00:00:00.000Z',
        },
      ]),
      analyzeRange: jest.fn(),
    };
    const notifications = notificationService();
    const service = new ProjectsService(repository, git, notifications);
    const project = await service.create('workspace-1', {
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.inspectVersion(project.id, 'workspace-1');

    expect(result.checkStatus).toBe('SUCCESS');
    expect(result.detectedCommit).toBe('def456');
    expect(result.previousDetectedCommit).toBe('abc123');
    expect(result.pendingCommitCount).toBe(1);
    expect((await repository.findInspectionLogs({}, 'workspace-1')).items[0]).toEqual(
      expect.objectContaining({ status: 'SUCCESS', triggerType: 'MANUAL' }),
    );
    expect(notifications.notifyIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: project.id }),
        baseCommit: 'abc123',
        targetCommit: 'def456',
        commits: expect.any(Array),
      }),
    );
  });

  it('only lists projects of the requested workspace', async () => {
    const repository = new FakeProjectRepository();
    const service = new ProjectsService(
      repository,
      { testConnection: jest.fn(), detectVersion: jest.fn(), listCommits: jest.fn(), analyzeRange: jest.fn() },
      notificationService(),
    );
    await service.create('workspace-1', {
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });
    await service.create('workspace-2', {
      name: '订单服务',
      code: 'order-service',
      repositoryUrl: 'git@example.com:trade/order.git',
      productionBranch: 'production',
    });

    const first = await service.list('workspace-1');
    const second = await service.list('workspace-2');

    expect(first.map((item) => item.code)).toEqual(['worksite-service']);
    expect(second.map((item) => item.code)).toEqual(['order-service']);
  });

  it('cannot read or inspect a project belonging to another workspace', async () => {
    const repository = new FakeProjectRepository();
    const git: GitGateway = {
      testConnection: jest.fn(),
      detectVersion: jest.fn(),
      listCommits: jest.fn(),
      analyzeRange: jest.fn(),
    };
    const service = new ProjectsService(repository, git, notificationService());
    const foreign = await service.create('workspace-2', {
      name: '订单服务',
      code: 'order-service',
      repositoryUrl: 'git@example.com:trade/order.git',
      productionBranch: 'production',
    });

    // 仅凭项目 ID、冒充其他工作空间，必须拿不到数据
    await expect(service.testConnection(foreign.id, 'workspace-1')).rejects.toThrow(
      '项目不存在',
    );
    await expect(service.detectVersion(foreign.id, 'workspace-1')).rejects.toThrow(
      '项目不存在',
    );
    await expect(
      service.inspectVersion(foreign.id, 'workspace-1'),
    ).rejects.toThrow('项目不存在');
    expect(git.detectVersion).not.toHaveBeenCalled();
    expect(git.testConnection).not.toHaveBeenCalled();
  });

  it('keeps inspection logs scoped to the workspace', async () => {
    const repository = new FakeProjectRepository();
    const git: GitGateway = {
      testConnection: jest.fn().mockResolvedValue({ remoteCommit: 'abc123' }),
      detectVersion: jest.fn().mockResolvedValue({
        baseCommit: 'base-1',
        targetCommit: 'target-1',
        baseSource: 'FIRST_PARENT',
      }),
      listCommits: jest.fn().mockResolvedValue([]),
      analyzeRange: jest.fn(),
    };
    const service = new ProjectsService(repository, git, notificationService());
    const project = await service.create('workspace-1', {
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });
    await service.inspectVersion(project.id, 'workspace-1');

    const ownWorkspace = await service.listInspectionLogs({}, 'workspace-1');
    const otherWorkspace = await service.listInspectionLogs({}, 'workspace-2');

    expect(ownWorkspace.total).toBe(1);
    expect(otherWorkspace.total).toBe(0);
  });
});
