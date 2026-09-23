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
import type {
  AuthUser,
  RegressionFeedback,
  UpdateRegressionFeedbackInput,
} from '@impact-flow/contracts';
import { ChangeInterpreter } from '../../core/services/change-interpreter';
import { RegressionPlanner } from '../../core/services/regression-planner';

@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);
  private readonly impactAnalyzer = new ChangeImpactAnalyzer();
  private readonly changeInterpreter = new ChangeInterpreter();
  private readonly regressionPlanner = new RegressionPlanner();

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

  async updateRegressionFeedback(
    id: string,
    targetId: string,
    input: UpdateRegressionFeedbackInput,
    workspaceId: string,
    user: AuthUser,
  ) {
    const task = await this.get(id, workspaceId);
    if (task.status !== 'SUCCESS' || !task.regressionPlan) {
      throw new BadRequestException('分析尚未生成可确认的回归计划');
    }
    if (!task.regressionPlan.targets.some((target) => target.id === targetId)) {
      throw new NotFoundException('回归目标不存在');
    }
    const feedback = (task.regressionFeedback ?? []).filter(
      (item) => item.targetId !== targetId,
    );
    if (input.decision !== 'PENDING') {
      feedback.push({
        targetId,
        decision: input.decision,
        updatedBy: user.id,
        updatedByName: user.displayName,
        updatedAt: new Date().toISOString(),
      } satisfies RegressionFeedback);
    }
    await this.analyses.updateRegressionFeedback(id, feedback);
    return { ...task, regressionFeedback: feedback };
  }

  async create(
    projectId: string,
    workspaceId: string,
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
      finishedAt: null,
    });

    this.enqueue(task.id);
    return task;
  }

  private enqueue(taskId: string) {
    // 基础分析由持久化 Worker 轮询并原子抢占；保留入口便于旧调用方兼容。
    void taskId;
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
      await this.updateProgress(task.id, 'SYNCING_REPOSITORY', 15, '正在同步远程代码仓库', workerId);
      const result = await this.git.analyzeRange({
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        productionBranch: project.productionBranch,
        baseCommit: task.baseCommit,
        targetCommit: task.targetCommit,
        onRepositoryReady: () =>
          this.updateProgress(
            task.id,
            'CALCULATING_DIFF',
            35,
            '代码仓库已就绪，正在计算版本差异',
            workerId,
          ),
      });
      const relatedProjects = (await this.projects.findAll(project.workspaceId))
        .filter((item) => item.id !== project.id && item.detectedCommit);
      const relatedRepositories = relatedProjects.map((item) => ({
        projectId: item.id,
        projectName: item.name,
        targetCommit: item.detectedCommit!,
      }));
      let symbolAnalysis;
      try {
        await this.updateProgress(task.id, 'ANALYZING_SYMBOLS', 55, '正在分析 Symbol 变更与调用链', workerId);
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
      await this.updateProgress(task.id, 'INTERPRETING_CHANGES', 66, '正在理解每项代码变更的语义', workerId);
      const changeUnits = this.changeInterpreter.interpret(
        symbolAnalysis.symbolChanges,
        result.files,
      );
      const analysisContext = {
        baseCommit: task.baseCommit,
        targetCommit: task.targetCommit,
        repositories: [
          {
            projectId: project.id,
            projectName: project.name,
            commit: task.targetCommit,
            role: 'CHANGED' as const,
          },
          ...relatedProjects.map((item) => ({
            projectId: item.id,
            projectName: item.name,
            commit: item.detectedCommit!,
            role: 'RELATED' as const,
          })),
        ],
        analyzerVersion: 'regression-intelligence-v2',
        capturedAt: new Date().toISOString(),
      };
      await this.updateProgress(task.id, 'EXPLORING_DEPENDENCIES', 74, '正在沿调用链查找业务入口与关联测试', workerId);
      const impact = this.impactAnalyzer.analyze({
        ...result,
        ...symbolAnalysis,
      });
      await this.updateProgress(task.id, 'RESOLVING_SCENARIOS', 82, '正在把技术影响翻译为可回归的业务场景', workerId);
      let aiAnalysis = null;
      try {
        aiAnalysis = await this.aiAnalyzer.analyze({
          workspaceId: project.workspaceId,
          projectName: project.name,
          baseCommit: task.baseCommit,
          targetCommit: task.targetCommit,
          commits: result.commits,
          files: result.files,
          additions: result.additions,
          deletions: result.deletions,
          changeEvidence: result.changeEvidence,
          analysisContext,
          changeUnits,
          ruleAnalysis: {
            riskLevel: impact.riskLevel,
            riskSummary: impact.riskSummary,
            impactedModules: impact.impactedModules,
            regressionSuggestions: impact.regressionSuggestions,
          },
          symbolAnalysis,
        });
      } catch (error) {
        this.logger.warn(
          `AI regression enrichment skipped for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await this.updateProgress(task.id, 'PLANNING_REGRESSION', 88, '正在生成按优先级排序的回归清单', workerId);
      const regressionPlan = this.regressionPlanner.plan({
        summary: impact.riskSummary,
        riskLevel: impact.riskLevel,
        changeUnits,
        ruleSuggestions: impact.regressionSuggestions,
        aiAnalysis,
      });
      await this.updateProgress(task.id, 'SAVING_RESULT', 90, '分析已完成，正在保存结果', workerId);
      const completed = await this.analyses.complete(task.id, {
        ...result,
        ...impact,
        regressionSuggestions: regressionPlan.targets,
        ...symbolAnalysis,
        analysisContext,
        changeUnits,
        regressionPlan,
      }, workerId);
      // 租约已超时或被其他 Worker 接管时，迟到结果不得推进项目基线。
      if (completed.status !== 'SUCCESS') return;
      await this.projects.updateLastAnalyzedCommit(
        project.id,
        task.targetCommit,
      );
      this.logger.log(`分析任务 ${task.id} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (workerId) throw error;
      await this.analyses.fail(task.id, message);
      this.logger.error(`分析任务 ${task.id} 执行失败：${message}`);
    }
  }

  private async updateProgress(
    taskId: string,
    stage: NonNullable<import('@impact-flow/contracts').AnalysisTask['progressStage']>,
    percent: number,
    message: string,
    workerId?: string,
  ) {
    await this.analyses.updateProgress?.(
      taskId,
      { stage, percent, message },
      workerId,
    );
  }
}
