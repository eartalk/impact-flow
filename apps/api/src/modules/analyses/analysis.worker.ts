import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from '../../core/ports/analysis.repository';
import { AnalysesService } from './analyses.service';

@Injectable()
export class AnalysisWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AnalysisWorker.name);
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private readonly active = new Set<Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private stopping = false;

  constructor(
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    private readonly service: AnalysesService,
  ) {}

  async onApplicationBootstrap() {
    await this.service.recoverPendingAiTasks();
    this.timer = setInterval(() => void this.drain(), this.pollIntervalMs);
    this.timer.unref?.();
    await this.drain();
    this.logger.log(`分析 Worker 已启动：${this.workerId}`);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.active]);
  }

  private async drain() {
    if (this.stopping) return;
    while (this.active.size < this.concurrency) {
      const task = await this.analyses.claimNextForWorker(
        this.workerId,
        this.taskTimeoutMs + this.leaseGraceMs,
      );
      if (!task) return;
      const execution = this.execute(task.id, task.attemptCount ?? 1).finally(() => {
        this.active.delete(execution);
        queueMicrotask(() => void this.drain());
      });
      this.active.add(execution);
    }
  }

  private async execute(taskId: string, attempt: number) {
    try {
      await this.withTimeout(
        this.service.processClaimed(taskId, this.workerId),
        this.taskTimeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoff = this.retryBaseMs * 2 ** Math.max(0, attempt - 1);
      const outcome = await this.analyses.retryOrFail(
        taskId,
        this.workerId,
        message,
        new Date(Date.now() + backoff),
      );
      const log = `分析任务 ${taskId} 第 ${attempt} 次执行失败：${message}`;
      outcome === 'RETRY'
        ? this.logger.warn(`${log}，将在 ${backoff}ms 后重试`)
        : this.logger.error(`${log}，已达到最大重试次数`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`任务执行超过 ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private get concurrency() {
    return 2;
  }
  private get pollIntervalMs() {
    return 1000;
  }
  private get taskTimeoutMs() {
    return 600_000;
  }
  private get retryBaseMs() {
    return 5000;
  }
  private get leaseGraceMs() {
    return 30_000;
  }
}
