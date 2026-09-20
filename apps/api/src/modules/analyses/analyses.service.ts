import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from '../../core/ports/analysis.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../core/ports/project.repository';
import { GIT_GATEWAY, type GitGateway } from '../../core/ports/git.gateway';
import { ChangeImpactAnalyzer } from '../../core/services/change-impact.analyzer';
import {
  SYMBOL_ANALYZER_GATEWAY,
  type SymbolAnalyzerGateway,
} from '../../core/ports/symbol-analyzer.gateway';

@Injectable()
export class AnalysesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysesService.name);
  private readonly running = new Set<string>();
  private readonly impactAnalyzer = new ChangeImpactAnalyzer();

  constructor(
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(GIT_GATEWAY)
    private readonly git: GitGateway,
    @Inject(SYMBOL_ANALYZER_GATEWAY)
    private readonly symbols: SymbolAnalyzerGateway,
  ) {}

  async onApplicationBootstrap() {
    const pending = await this.analyses.findPending();
    for (const task of pending) this.enqueue(task.id);
    if (pending.length) {
      this.logger.log(`已恢复 ${pending.length} 个未完成分析任务`);
    }
  }

  list() {
    return this.analyses.findAll();
  }

  async get(id: string) {
    const task = await this.analyses.findById(id);
    if (!task) throw new NotFoundException('分析任务不存在');
    return task;
  }

  async create(projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('项目不存在');

    const activeTask = await this.analyses.findActiveByProject(projectId);
    if (activeTask) return activeTask;

    const targetCommit = project.detectedCommit;
    const baseCommit =
      project.lastAnalyzedCommit ?? project.previousDetectedCommit;
    if (!targetCommit || !baseCommit) {
      throw new BadRequestException('请先完成生产分支巡检，再开始检测');
    }

    const hasChanges = targetCommit !== baseCommit;
    const task = await this.analyses.create({
      projectId,
      projectName: project.name,
      baseCommit,
      targetCommit,
      status: hasChanges ? 'READY' : 'NO_CHANGES',
      commitCount: 0,
      changedFileCount: 0,
      additions: 0,
      deletions: 0,
      errorMessage: null,
      riskLevel: null,
      riskSummary: null,
      impactedModules: [],
      regressionSuggestions: [],
      symbolSummary: null,
      symbolChanges: [],
      symbolImpacts: [],
      finishedAt: hasChanges ? null : new Date().toISOString(),
    });

    if (hasChanges) this.enqueue(task.id);
    return task;
  }

  private enqueue(taskId: string) {
    if (this.running.has(taskId)) return;
    this.running.add(taskId);
    setImmediate(() => {
      void this.process(taskId).finally(() => this.running.delete(taskId));
    });
  }

  private async process(taskId: string) {
    const task = await this.analyses.findById(taskId);
    if (!task || !['READY', 'RUNNING'].includes(task.status)) return;
    const project = await this.projects.findById(task.projectId);
    if (!project) {
      await this.analyses.fail(taskId, '项目不存在或已被删除');
      return;
    }

    await this.analyses.markRunning(taskId);
    try {
      const result = await this.git.analyzeRange({
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        productionBranch: project.productionBranch,
        baseCommit: task.baseCommit,
        targetCommit: task.targetCommit,
      });
      const impact = this.impactAnalyzer.analyze(result);
      let symbolAnalysis;
      try {
        symbolAnalysis = await this.symbols.analyzeRange({
          projectId: project.id,
          baseCommit: task.baseCommit,
          targetCommit: task.targetCommit,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Symbol analysis skipped for task ${task.id}: ${message}`);
        symbolAnalysis = {
          symbolSummary: `TypeScript Symbol 分析未完成：${message}`.slice(0, 1000),
          symbolChanges: [],
          symbolImpacts: [],
        };
      }
      await this.analyses.complete(task.id, {
        ...result,
        ...impact,
        ...symbolAnalysis,
      });
      await this.projects.updateLastAnalyzedCommit(
        project.id,
        task.targetCommit,
      );
      this.logger.log(`分析任务 ${task.id} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.analyses.fail(task.id, message);
      this.logger.error(`分析任务 ${task.id} 执行失败：${message}`);
    }
  }
}
