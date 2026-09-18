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

class FakeProjectRepository implements ProjectRepository {
  private projects: Project[] = [];
  private inspectionLogs: InspectionLog[] = [];

  async findAll() { return this.projects; }
  async findById(id: string) {
    return this.projects.find((project) => project.id === id) ?? null;
  }
  async findByCode(code: string) {
    return this.projects.find((project) => project.code === code) ?? null;
  }
  async create(input: CreateProjectInput) {
    const project: Project = {
      id: 'project-1',
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
    const project = await this.findById(id);
    if (!project) throw new Error('not found');
    Object.assign(project, input);
    return project;
  }
  async remove(id: string) {
    this.projects = this.projects.filter((project) => project.id !== id);
  }
  async updateLastAnalyzedCommit(id: string, commit: string) {
    const project = await this.findById(id);
    if (project) project.lastAnalyzedCommit = commit;
  }
  async markInspectionRunning(id: string) {
    const project = await this.findById(id);
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
    const project = await this.findById(id);
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
    const project = await this.findById(id);
    if (!project) throw new Error('not found');
    project.checkStatus = 'FAILED';
    project.checkError = errorMessage;
    return project;
  }
  async createInspectionLog(
    projectId: string,
    triggerType: InspectionTrigger,
  ) {
    const project = await this.findById(projectId);
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
  async findInspectionLogs() {
    return {
      items: this.inspectionLogs,
      total: this.inspectionLogs.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      summary: {
        success: this.inspectionLogs.filter((log) => log.status === 'SUCCESS').length,
        failed: this.inspectionLogs.filter((log) => log.status === 'FAILED').length,
        running: this.inspectionLogs.filter((log) => log.status === 'RUNNING').length,
      },
    };
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
    const service = new ProjectsService(repository, git);
    const project = await service.create({
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.testConnection(project.id);

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
    const service = new ProjectsService(repository, git);
    const project = await service.create({
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.detectVersion(project.id);

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
    const service = new ProjectsService(repository, git);
    const project = await service.create({
      name: '工地服务',
      code: 'worksite-service',
      repositoryUrl: 'git@example.com:delivery/worksite.git',
      productionBranch: 'production',
    });

    const result = await service.inspectVersion(project.id);

    expect(result.checkStatus).toBe('SUCCESS');
    expect(result.detectedCommit).toBe('def456');
    expect(result.previousDetectedCommit).toBe('abc123');
    expect(result.pendingCommitCount).toBe(1);
    expect((await repository.findInspectionLogs()).items[0]).toEqual(
      expect.objectContaining({ status: 'SUCCESS', triggerType: 'MANUAL' }),
    );
  });
});
