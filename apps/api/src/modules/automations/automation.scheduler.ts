import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysesService } from '../analyses/analyses.service';
import { ProjectsService } from '../projects/projects.service';
import { AutomationPoliciesService } from './automation-policies.service';

@Injectable()
export class AutomationScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AutomationScheduler.name);
  private interval?: NodeJS.Timeout;
  private initialRun?: NodeJS.Timeout;

  constructor(
    private readonly projects: ProjectsService,
    private readonly analyses: AnalysesService,
    private readonly policies: AutomationPoliciesService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const enabled = this.config.get('VERSION_CHECK_ENABLED', 'true') !== 'false';
    if (!enabled) {
      this.logger.log('生产版本定时巡检已关闭');
      return;
    }

    const configuredInterval = Number(
      this.config.get('VERSION_CHECK_INTERVAL_MS', 300_000),
    );
    const intervalMs = Number.isFinite(configuredInterval)
      ? Math.max(configuredInterval, 30_000)
      : 300_000;

    this.initialRun = setTimeout(() => void this.inspect(), 10_000);
    this.initialRun.unref();
    this.interval = setInterval(() => void this.inspect(), intervalMs);
    this.interval.unref();
    this.logger.log(`生产版本巡检已启动，间隔 ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.initialRun) clearTimeout(this.initialRun);
    if (this.interval) clearInterval(this.interval);
  }

  private async inspect() {
    try {
      const configuredRetention = Number(
        this.config.get('INSPECTION_LOG_RETENTION_DAYS', 30),
      );
      const retentionDays = Number.isFinite(configuredRetention)
        ? configuredRetention
        : 30;
      await this.projects.cleanupInspectionLogs(retentionDays);
      // 系统级：定时调度器需要跨工作空间遍历，再按每个项目所属空间套用各自的自动化策略
      const configuredProjects = await this.projects.listForScheduler();
      const configurations = new Map<
        string,
        Promise<Awaited<ReturnType<AutomationPoliciesService['getConfig']>>>
      >();
      const configurationFor = (workspaceId: string) => {
        let pending = configurations.get(workspaceId);
        if (!pending) {
          pending = this.policies.getConfig(workspaceId);
          configurations.set(workspaceId, pending);
        }
        return pending;
      };
      const inspectionResults = await Promise.allSettled(
        configuredProjects.map(async (project) => {
          const automation = await configurationFor(project.workspaceId);
          if (!automation.autoInspectionEnabled) return null;
          return {
            project: await this.projects.inspectVersion(
              project.id,
              project.workspaceId,
              'SCHEDULED',
            ),
            automation,
          };
        }),
      );
      const inspected = inspectionResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      );
      const failed = inspected.filter(
        ({ project }) => project.checkStatus === 'FAILED',
      );
      const analysisResults = await Promise.allSettled(
        inspected.map(async ({ project, automation }) => {
          if (
            project.checkStatus !== 'SUCCESS' ||
            project.pendingCommitCount < 1 ||
            !automation.autoChangeAnalysisEnabled
          ) {
            return;
          }
          await this.analyses.create(project.id, project.workspaceId, {
            aiAnalysisRequested: automation.autoAiAnalysisEnabled,
          });
        }),
      );
      const automationFailures = analysisResults.filter(
        (result) => result.status === 'rejected',
      ).length;
      const inspectionFailures = inspectionResults.filter(
        (result) => result.status === 'rejected',
      ).length;
      const skipped = configuredProjects.length - inspected.length - inspectionFailures;
      this.logger.log(
        `生产版本巡检完成：${inspected.length} 个已执行，${skipped} 个已关闭，${failed.length + inspectionFailures} 个失败，${automationFailures} 个自动分析触发失败`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`生产版本巡检执行失败：${message}`);
    }
  }
}
