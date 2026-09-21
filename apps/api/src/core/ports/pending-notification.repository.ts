import type {
  NotificationChannel,
  NotificationDeliveryLogPage,
  NotificationDeliveryLogQuery,
  NotificationDeliveryStatus,
} from '@impact-flow/contracts';

export const PENDING_NOTIFICATION_REPOSITORY = Symbol(
  'PENDING_NOTIFICATION_REPOSITORY',
);

export interface StoredPendingNotificationConfig {
  enabled: boolean;
  webhookEncrypted: string | null;
  webhookHint: string | null;
  updatedAt: string | null;
}

export interface RecordDeliveryInput {
  workspaceId: string;
  projectId: string;
  targetCommit: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface PendingNotificationRepository {
  findConfig(workspaceId: string): Promise<StoredPendingNotificationConfig>;
  saveConfig(workspaceId: string, input: {
    enabled: boolean;
    webhookEncrypted?: string;
    webhookHint?: string;
  }): Promise<StoredPendingNotificationConfig>;
  /** 是否已存在成功投递记录（同一服务同一提交只成功通知一次） */
  wasDelivered(projectId: string, targetCommit: string): Promise<boolean>;
  /** 记录一次投递尝试；成功记录重复时静默忽略 */
  recordDelivery(input: RecordDeliveryInput): Promise<void>;
  /** 分页查询投递记录，按尝试时间倒序 */
  listDeliveries(
    workspaceId: string,
    query: NotificationDeliveryLogQuery,
  ): Promise<NotificationDeliveryLogPage>;
}
