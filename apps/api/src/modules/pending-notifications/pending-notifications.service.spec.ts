import type {
  NotificationGateway,
} from '../../core/ports/notification.gateway';
import type {
  PendingNotificationRepository,
  StoredPendingNotificationConfig,
} from '../../core/ports/pending-notification.repository';
import type { SecretCipher } from '../../infrastructure/security/secret-cipher';
import { PendingNotificationsService } from './pending-notifications.service';

class FakeRepository implements PendingNotificationRepository {
  config: StoredPendingNotificationConfig = {
    enabled: false,
    webhookEncrypted: null,
    webhookHint: null,
    updatedAt: null,
  };
  delivered = new Set<string>();

  async findConfig() {
    return this.config;
  }

  async saveConfig(_workspaceId: string, input: {
    enabled: boolean;
    webhookEncrypted?: string;
    webhookHint?: string;
  }) {
    this.config = {
      enabled: input.enabled,
      webhookEncrypted:
        input.webhookEncrypted ?? this.config.webhookEncrypted,
      webhookHint: input.webhookHint ?? this.config.webhookHint,
      updatedAt: new Date().toISOString(),
    };
    return this.config;
  }

  async wasDelivered(projectId: string, targetCommit: string) {
    return this.delivered.has(projectId + ':' + targetCommit);
  }

  async markDelivered(projectId: string, targetCommit: string) {
    this.delivered.add(projectId + ':' + targetCommit);
  }
}

describe('PendingNotificationsService', () => {
  const webhook =
    'https://oapi.dingtalk.com/robot/send?access_token=token-1234';

  function setup() {
    const repository = new FakeRepository();
    const gateway: NotificationGateway = {
      sendPendingChange: jest.fn().mockResolvedValue(undefined),
      test: jest.fn().mockResolvedValue(undefined),
    };
    const cipher = {
      encrypt: jest.fn((value: string) => 'encrypted:' + value),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    } as unknown as SecretCipher;
    return {
      repository,
      gateway,
      service: new PendingNotificationsService(repository, gateway, cipher),
    };
  }

  it('requires a webhook before enabling notifications', async () => {
    const { service } = setup();
    await expect(service.updateConfig('workspace-1', { enabled: true })).rejects.toThrow(
      '开启待检测通知前请先填写钉钉 Webhook',
    );
  });

  it('stores a masked encrypted webhook', async () => {
    const { service, repository } = setup();
    const result = await service.updateConfig('workspace-1', {
      enabled: true,
      dingTalkWebhook: webhook,
    });

    expect(repository.config.webhookEncrypted).toBe('encrypted:' + webhook);
    expect(result).toEqual(
      expect.objectContaining({
        enabled: true,
        webhookConfigured: true,
        webhookMasked: '钉钉 Webhook ••••1234',
      }),
    );
  });

  it('delivers each project commit only once', async () => {
    const { service, gateway } = setup();
    await service.updateConfig('workspace-1', {
      enabled: true,
      dingTalkWebhook: webhook,
    });
    const input = {
      project: {
        id: 'project-1',
        workspaceId: 'workspace-1',
        name: '工地服务',
        code: 'worksite',
        repositoryUrl: 'git@example.com:worksite.git',
        productionBranch: 'production',
        lastAnalyzedCommit: 'abc123',
        detectedCommit: 'def456',
        previousDetectedCommit: 'abc123',
        pendingCommitCount: 1,
        pendingCommits: [],
        lastCheckedAt: new Date().toISOString(),
        checkStatus: 'SUCCESS' as const,
        checkError: null,
        createdAt: new Date().toISOString(),
      },
      baseCommit: 'abc123',
      targetCommit: 'def456',
      commits: [
        {
          sha: 'def456',
          shortSha: 'def456',
          author: 'tester',
          subject: '新增接口',
          committedAt: new Date().toISOString(),
        },
      ],
    };

    await expect(service.notifyIfNeeded(input)).resolves.toBe(true);
    await expect(service.notifyIfNeeded(input)).resolves.toBe(false);
    expect(gateway.sendPendingChange).toHaveBeenCalledTimes(1);
  });
});
