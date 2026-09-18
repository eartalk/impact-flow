import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from './projects.service';

@Injectable()
export class VersionInspectionScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(VersionInspectionScheduler.name);
  private interval?: NodeJS.Timeout;
  private initialRun?: NodeJS.Timeout;

  constructor(
    private readonly projects: ProjectsService,
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
      const projects = await this.projects.inspectAll('SCHEDULED');
      const failed = projects.filter((project) => project.checkStatus === 'FAILED');
      this.logger.log(
        `生产版本巡检完成：${projects.length} 个服务，${failed.length} 个失败`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`生产版本巡检执行失败：${message}`);
    }
  }
}
