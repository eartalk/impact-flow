import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateProjectInput } from '@impact-flow/contracts';
import type { UpdateProjectInput } from '@impact-flow/contracts';
import type { Project } from '@impact-flow/contracts';
import type { InspectionTrigger } from '@impact-flow/contracts';
import type { InspectionLogQuery } from '@impact-flow/contracts';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../core/ports/project.repository';
import { GIT_GATEWAY, type GitGateway } from '../../core/ports/git.gateway';

@Injectable()
export class ProjectsService {
  private readonly inspections = new Map<string, Promise<Project>>();

  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(GIT_GATEWAY)
    private readonly git: GitGateway,
  ) {}

  list() {
    return this.projects.findAll();
  }

  listInspectionLogs(query: InspectionLogQuery) {
    return this.projects.findInspectionLogs(query);
  }

  cleanupInspectionLogs(retentionDays: number) {
    const safeDays = Math.min(Math.max(Math.trunc(retentionDays), 1), 3650);
    const olderThan = new Date(Date.now() - safeDays * 86_400_000);
    return this.projects.cleanupInspectionLogs(olderThan);
  }

  async testConnection(id: string) {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException('项目不存在');

    try {
      const result = await this.git.testConnection({
        repositoryUrl: project.repositoryUrl,
        productionBranch: project.productionBranch,
      });
      return {
        success: true,
        message: '仓库与生产分支连接正常',
        branch: project.productionBranch,
        remoteCommit: result.remoteCommit,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message,
        branch: project.productionBranch,
        remoteCommit: null,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async create(input: CreateProjectInput) {
    if (await this.projects.findByCode(input.code)) {
      throw new BadRequestException(`项目编码 ${input.code} 已存在`);
    }
    return this.projects.create(input);
  }

  async update(id: string, input: UpdateProjectInput) {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException('服务不存在');

    if (input.code && input.code !== project.code) {
      const duplicate = await this.projects.findByCode(input.code);
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(`服务编码 ${input.code} 已存在`);
      }
    }
    return this.projects.update(id, input);
  }

  async remove(id: string) {
    if (!(await this.projects.findById(id))) {
      throw new NotFoundException('服务不存在');
    }
    try {
      await this.projects.remove(id);
      return { deleted: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException('该服务已有分析记录，不能直接删除');
      }
      throw error;
    }
  }

  async detectVersion(id: string) {
    const project = await this.projects.findById(id);
    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    const version = await this.git.detectVersion({
      projectId: project.id,
      repositoryUrl: project.repositoryUrl,
      productionBranch: project.productionBranch,
      lastAnalyzedCommit: project.lastAnalyzedCommit,
    });

    return {
      projectId: project.id,
      branch: project.productionBranch,
      ...version,
      hasChanges: version.baseCommit !== version.targetCommit,
      detectedAt: new Date().toISOString(),
    };
  }

  async inspectVersion(
    id: string,
    triggerType: InspectionTrigger = 'MANUAL',
  ): Promise<Project> {
    const running = this.inspections.get(id);
    if (running) return running;

    const inspection = this.runInspection(id, triggerType).finally(() => {
      this.inspections.delete(id);
    });
    this.inspections.set(id, inspection);
    return inspection;
  }

  async inspectAll(triggerType: InspectionTrigger = 'MANUAL') {
    const projects = await this.projects.findAll();
    return Promise.all(
      projects.map((project) => this.inspectVersion(project.id, triggerType)),
    );
  }

  private async runInspection(
    id: string,
    triggerType: InspectionTrigger,
  ): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException('项目不存在');

    const logId = await this.projects.createInspectionLog(id, triggerType);
    await this.projects.markInspectionRunning(id);
    try {
      const version = await this.git.detectVersion({
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        productionBranch: project.productionBranch,
        lastAnalyzedCommit: project.lastAnalyzedCommit,
      });
      const pendingCommits = await this.git.listCommits({
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        productionBranch: project.productionBranch,
        baseCommit: version.baseCommit,
        targetCommit: version.targetCommit,
      });
      const previousDetectedCommit =
        version.targetCommit === project.detectedCommit
          ? project.previousDetectedCommit ?? version.baseCommit
          : project.detectedCommit ?? version.baseCommit;

      const result = await this.projects.completeInspection(id, {
        detectedCommit: version.targetCommit,
        previousDetectedCommit,
        pendingCommits,
      });
      await this.projects.completeInspectionLog(logId, {
        detectedCommit: version.targetCommit,
        pendingCommitCount: pendingCommits.length,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = await this.projects.failInspection(id, message);
      await this.projects.failInspectionLog(logId, message);
      return result;
    }
  }
}
