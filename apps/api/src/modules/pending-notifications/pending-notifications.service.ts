import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type {
  CommitSummary,
  PendingNotificationConfig,
  Project,
  UpdatePendingNotificationConfigInput,
} from '@impact-flow/contracts';
import {
  NOTIFICATION_GATEWAY,
  type NotificationGateway,
} from '../../core/ports/notification.gateway';
import {
  PENDING_NOTIFICATION_REPOSITORY,
  type PendingNotificationRepository,
  type StoredPendingNotificationConfig,
} from '../../core/ports/pending-notification.repository';
import { SecretCipher } from '../../infrastructure/security/secret-cipher';

@Injectable()
export class PendingNotificationsService {
  constructor(
    @Inject(PENDING_NOTIFICATION_REPOSITORY)
    private readonly repository: PendingNotificationRepository,
    @Inject(NOTIFICATION_GATEWAY)
    private readonly gateway: NotificationGateway,
    private readonly cipher: SecretCipher,
  ) {}

  async getConfig(workspaceId: string) {
    return this.publicConfig(await this.repository.findConfig(workspaceId));
  }

  async updateConfig(workspaceId: string, input: UpdatePendingNotificationConfigInput) {
    const existing = await this.repository.findConfig(workspaceId);
    const webhook = input.dingTalkWebhook?.trim();
    if (webhook) this.validateWebhook(webhook);
    if (input.enabled && !webhook && !existing.webhookEncrypted) {
      throw new BadRequestException('开启待检测通知前请先填写钉钉 Webhook');
    }
    const saved = await this.repository.saveConfig(workspaceId, {
      enabled: input.enabled,
      webhookEncrypted: webhook ? this.cipher.encrypt(webhook) : undefined,
      webhookHint: webhook ? this.webhookHint(webhook) : undefined,
    });
    return this.publicConfig(saved);
  }

  async test(workspaceId: string) {
    const config = await this.repository.findConfig(workspaceId);
    if (!config.webhookEncrypted) {
      throw new BadRequestException('请先保存钉钉 Webhook');
    }
    await this.gateway.test(this.cipher.decrypt(config.webhookEncrypted));
    return {
      success: true,
      message: '钉钉测试通知发送成功',
      checkedAt: new Date().toISOString(),
    };
  }

  async notifyIfNeeded(input: {
    project: Project;
    baseCommit: string;
    targetCommit: string;
    commits: CommitSummary[];
  }) {
    if (!input.commits.length) return false;
    const config = await this.repository.findConfig(input.project.workspaceId);
    if (!config.enabled || !config.webhookEncrypted) return false;
    if (
      await this.repository.wasDelivered(
        input.project.id,
        input.targetCommit,
      )
    ) {
      return false;
    }
    await this.gateway.sendPendingChange({
      webhook: this.cipher.decrypt(config.webhookEncrypted),
      projectName: input.project.name,
      projectCode: input.project.code,
      branch: input.project.productionBranch,
      baseCommit: input.baseCommit,
      targetCommit: input.targetCommit,
      commits: input.commits,
    });
    await this.repository.markDelivered(input.project.id, input.targetCommit);
    return true;
  }

  private publicConfig(
    config: StoredPendingNotificationConfig,
  ): PendingNotificationConfig {
    return {
      enabled: config.enabled,
      webhookConfigured: Boolean(config.webhookEncrypted),
      webhookMasked: config.webhookHint
        ? '钉钉 Webhook ••••' + config.webhookHint
        : null,
      updatedAt: config.updatedAt,
    };
  }

  private validateWebhook(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('钉钉 Webhook 地址格式不正确');
    }
    const allowedHosts = new Set(['oapi.dingtalk.com', 'api.dingtalk.com']);
    if (
      url.protocol !== 'https:' ||
      !allowedHosts.has(url.hostname.toLowerCase()) ||
      !url.pathname.includes('/robot/send')
    ) {
      throw new BadRequestException('仅支持钉钉机器人 HTTPS Webhook');
    }
  }

  private webhookHint(value: string) {
    try {
      const token = new URL(value).searchParams.get('access_token');
      return (token || value).slice(-4);
    } catch {
      return value.slice(-4);
    }
  }
}
