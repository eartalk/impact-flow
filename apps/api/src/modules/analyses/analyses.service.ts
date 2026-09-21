import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../core/ports/workspace.repository';

@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);
  private readonly aiRunning = new Set<string>();
  private readonly impactAnalyzer = new ChangeImpactAnalyzer();

  constructor(
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projects: ProjectRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(GIT_GATEWAY)
    private readonly git: GitGateway,
    @Inject(SYMBOL_ANALYZER_GATEWAY)
    private readonly symbols: SymbolAnalyzerGateway,
    @Inject(AI_ANALYZER_GATEWAY)
    private readonly aiAnalyzer: AiAnalyzerGateway,
  ) {}

  async recoverPendingAiTasks() {
    const pendingAi = await this.analyses.findPendingAiForWorker();
    for (const task of pendingAi) this.enqueueAi(task.id);
    if (pendingAi.length) {
      this.logger.log(`已恢复 ${pendingAi.length} 个未完成 AI 分析任务`);
    }
    const requestedAi = await this.analyses.findRequestedAiForWorker();
    for (const task of requestedAi) await this.queueAiAnalysis(task.id);
    if (requestedAi.length) {
      this.logger.log(`已恢复 ${requestedAi.length} 个待启动 AI 分析任务`);
    }
  }

  list(workspaceId: string) {
    return this.analyses.findAll(workspaceId);
  }

  async listLogs(
    query: import('@impact-flow/contracts').AnalysisLogQuery,
    workspaceId: string,
  ) {
    if (
      query.projectId &&
      !(await this.projects.findById(query.projectId, workspaceId))
    ) {
      throw new NotFoundException('项目不存在');
    }
    return this.analyses.listLogs(query, workspaceId);
  }

  async get(id: string, workspaceId: string) {
    const task = await this.analyses.findById(id, workspaceId);
    if (!task) throw new NotFoundException('分析任务不存在');
    return task;
  }

  async create(
    projectId: string,
    workspaceId: string,
    options: { aiAnalysisRequested?: boolean } = {},
  ) {
    const project = await this.projects.findById(projectId, workspaceId);
    if (!project) throw new NotFoundException('项目不存在');

    const activeTask = await this.analyses.findActiveByProject(projectId, workspaceId);
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
      aiAnalysisRequested: options.aiAnalysisRequested ?? false,
      finishedAt: hasChanges ? null : new Date().toISOString(),
    });

    if (hasChanges) this.enqueue(task.id);
    return task;
  }

  async rerun(id: string, workspaceId: string) {
    const source = await this.analyses.findById(id, workspaceId);
    if (!source) throw new NotFoundException('分析任务不存在');

    const project = await this.projects.findById(source.projectId, workspaceId);
    if (!project) throw new NotFoundException('项目不存在');

    const activeTask = await this.analyses.findActiveByProject(
      source.projectId,
      workspaceId,
    );
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
      aiAnalysisRequested: false,
      finishedAt: null,
    });

    this.enqueue(task.id);
    return task;
  }

  async analyzeWithAi(id: string, workspaceId: string) {
    const task = await this.analyses.findById(id, workspaceId);
    if (!task) throw new NotFoundException('分析任务不存在');
    if (task.status !== 'SUCCESS') {
      throw new BadRequestException('请先完成变更分析，再执行 AI 分析');
    }
    return this.queueAiAnalysis(id);
  }

  /**
   * 系统级：启动 AI 分析。调用方必须已完成作用域校验
   * （业务接口经 findById 校验，启动恢复经 findRequestedAiForWorker 取得任务）。
   */
  private async queueAiAnalysis(id: string) {
    const task = await this.analyses.findByIdForWorkerTask(id);
    if (!task) return null;
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
    // 基础分析由持久化 Worker 轮询并原子抢占；保留入口便于旧调用方兼容。
    void taskId;
  }

  private enqueueAi(taskId: string) {
    if (this.aiRunning.has(taskId)) return;
    this.aiRunning.add(taskId);
    setImmediate(() => {
      void this.processAi(taskId).finally(() => this.aiRunning.delete(taskId));
    });
  }

  private process(taskId: string) {
    return this.processClaimed(taskId);
  }

  async processClaimed(taskId: string, workerId?: string) {
    // 任务执行器无用户会话：任务记录是作用域权威来源，
    // 加载项目后必须使用 project.workspaceId 约束后续所有查询
    const task = await this.analyses.findByIdForWorkerTask(taskId);
    if (!task || !['READY', 'RUNNING'].includes(task.status)) return;
    const project = await this.projects.findByIdForWorkerTask(task.projectId);
    if (!project) {
      const error = new Error('项目不存在或已被删除');
      if (workerId) throw error;
      await this.analyses.fail(taskId, error.message);
      return;
    }

    if (!workerId) await this.analyses.markRunning(taskId);
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
        // 关联仓库必须限定在与被分析项目相同的工作空间内，
        // 否则会把其他工作空间的服务名与提交纳入本空间的分析结果
        const relatedRepositories = (await this.projects.findAll(project.workspaceId))
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
      const completed = await this.analyses.complete(task.id, {
        ...result,
        ...impact,
        ...symbolAnalysis,
      }, workerId);
      // 租约已超时或被其他 Worker 接管时，迟到结果不得推进项目基线。
      if (completed.status !== 'SUCCESS') return;
      await this.projects.updateLastAnalyzedCommit(
        project.id,
        task.targetCommit,
      );
      // 归档后不再触发自动 AI 链路：RUNNING 任务允许跑完，但后续动作冻结
      if (
        task.aiAnalysisRequested &&
        (await this.workspaces.isActive(project.workspaceId))
      ) {
        await this.queueAiAnalysis(task.id);
      }
      this.logger.log(`分析任务 ${task.id} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (workerId) throw error;
      await this.analyses.fail(task.id, message);
      this.logger.error(`分析任务 ${task.id} 执行失败：${message}`);
    }
  }

  private async processAi(taskId: string) {
    const task = await this.analyses.findByIdForWorkerTask(taskId);
    if (!task || task.status !== 'SUCCESS' || task.aiAnalysis?.status !== 'RUNNING') {
      return;
    }
    const project = await this.projects.findByIdForWorkerTask(task.projectId);
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
