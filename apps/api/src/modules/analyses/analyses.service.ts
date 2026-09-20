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
import {
  AI_ANALYZER_GATEWAY,
  type AiAnalyzerGateway,
} from '../../core/ports/ai-analyzer.gateway';

@Injectable()
export class AnalysesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysesService.name);
  private readonly running = new Set<string>();
  private readonly aiRunning = new Set<string>();
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
    @Inject(AI_ANALYZER_GATEWAY)
    private readonly aiAnalyzer: AiAnalyzerGateway,
  ) {}

  async onApplicationBootstrap() {
    const pending = await this.analyses.findPending();
    for (const task of pending) this.enqueue(task.id);
    if (pending.length) {
      this.logger.log(`已恢复 ${pending.length} 个未完成分析任务`);
    }
    const pendingAi = await this.analyses.findPendingAi();
    for (const task of pendingAi) this.enqueueAi(task.id);
    if (pendingAi.length) {
      this.logger.log(`已恢复 ${pendingAi.length} 个未完成 AI 分析任务`);
    }
  }

  list(workspaceId?: string) {
    return this.analyses.findAll(workspaceId);
  }

  async listLogs(query: import('@impact-flow/contracts').AnalysisLogQuery, workspaceId?: string) {
    if (workspaceId && !(await this.projects.findById(query.projectId, workspaceId))) {
      throw new NotFoundException('项目不存在');
    }
    return this.analyses.listLogs(query);
  }

  async get(id: string, workspaceId?: string) {
    const task = await this.analyses.findById(id, workspaceId);
    if (!task) throw new NotFoundException('分析任务不存在');
    return task;
  }

  async create(projectId: string, workspaceId?: string) {
    const project = await this.projects.findById(projectId, workspaceId);
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
      aiAnalysis: null,
      finishedAt: hasChanges ? null : new Date().toISOString(),
    });

    if (hasChanges) this.enqueue(task.id);
    return task;
  }

  async rerun(id: string, workspaceId?: string) {
    const source = await this.analyses.findById(id, workspaceId);
    if (!source) throw new NotFoundException('分析任务不存在');

    const project = await this.projects.findById(source.projectId, workspaceId);
    if (!project) throw new NotFoundException('项目不存在');

    const activeTask = await this.analyses.findActiveByProject(source.projectId);
    if (activeTask) return activeTask;

    const task = await this.analyses.create({
      projectId: source.projectId,
      projectName: project.name,
      baseCommit: source.baseCommit,
      targetCommit: source.targetCommit,
      status: 'READY',
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
      aiAnalysis: null,
      finishedAt: null,
    });

    this.enqueue(task.id);
    return task;
  }

  async analyzeWithAi(id: string, workspaceId?: string) {
    const task = await this.analyses.findById(id, workspaceId);
    if (!task) throw new NotFoundException('分析任务不存在');
    if (task.status !== 'SUCCESS') {
      throw new BadRequestException('请先完成变更分析，再执行 AI 分析');
    }
    if (task.aiAnalysis?.status === 'RUNNING' || this.aiRunning.has(id)) {
      return task;
    }

    const pending = await this.analyses.startAiAnalysis(id, {
      status: 'RUNNING',
      summary: null,
      riskLevel: null,
      keyFindings: [],
      regressionSuggestions: [],
      model: null,
      analyzedAt: null,
      errorMessage: null,
    });
    this.enqueueAi(id);
    return pending;
  }

  private enqueue(taskId: string) {
    if (this.running.has(taskId)) return;
    this.running.add(taskId);
    setImmediate(() => {
      void this.process(taskId).finally(() => this.running.delete(taskId));
    });
  }

  private enqueueAi(taskId: string) {
    if (this.aiRunning.has(taskId)) return;
    this.aiRunning.add(taskId);
    setImmediate(() => {
      void this.processAi(taskId).finally(() => this.aiRunning.delete(taskId));
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
        const relatedRepositories = (await this.projects.findAll())
          .filter((item) => item.id !== project.id && item.detectedCommit)
          .map((item) => ({
            projectId: item.id,
            projectName: item.name,
            targetCommit: item.detectedCommit!,
          }));
        symbolAnalysis = await this.symbols.analyzeRange({
          projectId: project.id,
          projectName: project.name,
          baseCommit: task.baseCommit,
          targetCommit: task.targetCommit,
          relatedRepositories,
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

  private async processAi(taskId: string) {
    const task = await this.analyses.findById(taskId);
    if (!task || task.status !== 'SUCCESS' || task.aiAnalysis?.status !== 'RUNNING') {
      return;
    }
    const project = await this.projects.findById(task.projectId);
    if (!project) {
      await this.failAi(taskId, '项目不存在或已被删除');
      return;
    }
    if (!task.riskLevel || !task.riskSummary) {
      await this.failAi(taskId, '变更分析结果不完整，无法执行 AI 分析');
      return;
    }

    try {
      const result = await this.aiAnalyzer.analyze({
        workspaceId: project.workspaceId,
        projectName: project.name,
        baseCommit: task.baseCommit,
        targetCommit: task.targetCommit,
        commits: task.commits ?? [],
        files: task.files ?? [],
        additions: task.additions,
        deletions: task.deletions,
        changeEvidence: task.changeEvidence ?? [],
        ruleAnalysis: {
          riskLevel: task.riskLevel,
          riskSummary: task.riskSummary,
          impactedModules: task.impactedModules ?? [],
          regressionSuggestions: task.regressionSuggestions ?? [],
        },
        symbolAnalysis: {
          symbolSummary: task.symbolSummary ?? '未生成 TypeScript Symbol 分析摘要',
          symbolChanges: task.symbolChanges ?? [],
          symbolImpacts: task.symbolImpacts ?? [],
        },
      });
      await this.analyses.finishAiAnalysis(taskId, result);
      this.logger.log(`AI 分析任务 ${taskId} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failAi(taskId, message);
      this.logger.warn(`AI 分析任务 ${taskId} 执行失败：${message}`);
    }
  }

  private async failAi(taskId: string, message: string) {
    await this.analyses.finishAiAnalysis(taskId, {
      status: 'FAILED',
      summary: null,
      riskLevel: null,
      keyFindings: [],
      regressionSuggestions: [],
      model: null,
      analyzedAt: new Date().toISOString(),
      errorMessage: message.slice(0, 1000),
    });
  }
}
