export const PENDING_NOTIFICATION_REPOSITORY = Symbol(
  'PENDING_NOTIFICATION_REPOSITORY',
);

export interface StoredPendingNotificationConfig {
  enabled: boolean;
  webhookEncrypted: string | null;
  webhookHint: string | null;
  updatedAt: string | null;
}

export interface PendingNotificationRepository {
  findConfig(workspaceId: string): Promise<StoredPendingNotificationConfig>;
  saveConfig(workspaceId: string, input: {
    enabled: boolean;
    webhookEncrypted?: string;
    webhookHint?: string;
  }): Promise<StoredPendingNotificationConfig>;
  wasDelivered(projectId: string, targetCommit: string): Promise<boolean>;
  markDelivered(projectId: string, targetCommit: string): Promise<void>;
}
