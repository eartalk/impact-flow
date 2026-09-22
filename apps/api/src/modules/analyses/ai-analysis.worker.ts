import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  ANALYSIS_REPOSITORY,
  type AnalysisRepository,
} from '../../core/ports/analysis.repository';
import { AnalysesService } from './analyses.service';

@Injectable()
export class AiAnalysisWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AiAnalysisWorker.name);
  private readonly workerId = `ai:${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private readonly active = new Set<Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private stopping = false;

  constructor(
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    private readonly service: AnalysesService,
  ) {}

  async onApplicationBootstrap() {
    this.timer = setInterval(() => void this.drain(), this.pollIntervalMs);
    this.timer.unref?.();
    await this.drain();
    this.logger.log(`AI 分析 Worker 已启动：${this.workerId}`);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.active]);
  }

  private async drain() {
    if (this.stopping) return;
    while (this.active.size < this.concurrency) {
      const task = await this.analyses.claimNextAiForWorker(
        this.workerId,
        this.taskTimeoutMs + this.leaseGraceMs,
      );
      if (!task) return;
      const execution = this.execute(task.id, task.aiAttemptCount ?? 1).finally(() => {
        this.active.delete(execution);
        queueMicrotask(() => void this.drain());
      });
      this.active.add(execution);
    }
  }

  private async execute(taskId: string, attempt: number) {
    try {
      await this.withTimeout(
        this.service.processClaimedAi(taskId, this.workerId),
        this.taskTimeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoff = this.retryBaseMs * 2 ** Math.max(0, attempt - 1);
      const outcome = await this.analyses.retryOrFailAi(
        taskId,
        this.workerId,
        message,
        new Date(Date.now() + backoff),
      );
      const log = `AI 分析任务 ${taskId} 第 ${attempt} 次执行失败：${message}`;
      outcome === 'RETRY'
        ? this.logger.warn(`${log}，将在 ${backoff}ms 后重试`)
        : this.logger.error(`${log}，已达最大重试次数`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`AI 分析执行超过 ${timeoutMs}ms`)),
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

  private get concurrency() { return 2; }
  private get pollIntervalMs() { return 1000; }
  private get taskTimeoutMs() { return 180_000; }
  private get retryBaseMs() { return 5000; }
  private get leaseGraceMs() { return 30_000; }
}
