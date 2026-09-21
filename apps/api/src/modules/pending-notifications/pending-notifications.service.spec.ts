import type {
  NotificationDeliveryLogPage,
  NotificationDeliveryLogQuery,
} from '@impact-flow/contracts';
import type {
  NotificationGateway,
} from '../../core/ports/notification.gateway';
import { NotificationDeliveryError } from '../../core/ports/notification.gateway';
import type {
  PendingNotificationRepository,
  RecordDeliveryInput,
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
  deliveries: RecordDeliveryInput[] = [];

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
    return this.deliveries.some(
      (item) =>
        item.projectId === projectId &&
        item.targetCommit === targetCommit &&
        item.status === 'SUCCESS',
    );
  }

  async recordDelivery(input: RecordDeliveryInput) {
    if (
      input.status === 'SUCCESS' &&
      (await this.wasDelivered(input.projectId, input.targetCommit))
    ) {
      return;
    }
    this.deliveries.push(input);
  }

  lastQuery: { workspaceId: string; query: NotificationDeliveryLogQuery } | null =
    null;

  async listDeliveries(
    workspaceId: string,
    query: NotificationDeliveryLogQuery,
  ): Promise<NotificationDeliveryLogPage> {
    this.lastQuery = { workspaceId, query };
    return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
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

  function notificationInput() {
    return {
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
  }

  async function enableNotifications(service: PendingNotificationsService) {
    await service.updateConfig('workspace-1', {
      enabled: true,
      dingTalkWebhook: webhook,
    });
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
    const { service, gateway, repository } = setup();
    await enableNotifications(service);
    const input = notificationInput();

    await expect(service.notifyIfNeeded(input)).resolves.toBe(true);
    await expect(service.notifyIfNeeded(input)).resolves.toBe(false);
    expect(gateway.sendPendingChange).toHaveBeenCalledTimes(1);
    expect(repository.deliveries).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        targetCommit: 'def456',
        channel: 'DINGTALK',
        status: 'SUCCESS',
      }),
    ]);
  });

  it('records a failed attempt with error code and keeps retrying later', async () => {
    const { service, gateway, repository } = setup();
    await enableNotifications(service);
    (gateway.sendPendingChange as jest.Mock).mockRejectedValueOnce(
      new NotificationDeliveryError('钉钉 Webhook 返回失败：invalid token', '300001'),
    );

    await expect(service.notifyIfNeeded(notificationInput())).rejects.toThrow(
      'invalid token',
    );
    expect(repository.deliveries).toEqual([
      expect.objectContaining({
        status: 'FAILED',
        errorCode: '300001',
        errorMessage: '钉钉 Webhook 返回失败：invalid token',
      }),
    ]);

    // 失败不占用去重标记，下一次巡检应重新投递
    await expect(service.notifyIfNeeded(notificationInput())).resolves.toBe(true);
    expect(repository.deliveries).toHaveLength(2);
    expect(repository.deliveries[1]).toEqual(
      expect.objectContaining({ status: 'SUCCESS' }),
    );
  });

  it('maps unknown delivery failures to an UNKNOWN error code', async () => {
    const { service, gateway, repository } = setup();
    await enableNotifications(service);
    (gateway.sendPendingChange as jest.Mock).mockRejectedValueOnce(
      new Error('socket hang up'),
    );

    await expect(service.notifyIfNeeded(notificationInput())).rejects.toThrow(
      'socket hang up',
    );
    expect(repository.deliveries[0]).toEqual(
      expect.objectContaining({ status: 'FAILED', errorCode: 'UNKNOWN' }),
    );
  });

  it('forwards delivery log filters and workspace scope to the repository', async () => {
    const { service, repository } = setup();
    const query: NotificationDeliveryLogQuery = {
      page: 2,
      pageSize: 20,
      projectId: 'project-1',
      status: 'FAILED',
    };

    await service.listDeliveries('workspace-1', query);

    expect(repository.lastQuery).toEqual({ workspaceId: 'workspace-1', query });
  });
});
