import type { CommitSummary } from '@impact-flow/contracts';

export const NOTIFICATION_GATEWAY = Symbol('NOTIFICATION_GATEWAY');

export interface PendingChangeNotification {
  webhook: string;
  projectName: string;
  projectCode: string;
  branch: string;
  baseCommit: string;
  targetCommit: string;
  commits: CommitSummary[];
}

export interface NotificationGateway {
  sendPendingChange(input: PendingChangeNotification): Promise<void>;
  test(webhook: string): Promise<void>;
}

/**
 * 通知投递失败，携带可用于投递日志归类的错误码。
 * code 取值：钉钉返回的 errcode、`HTTP_<status>` 或 `NETWORK` / `UNKNOWN`。
 */
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

export function isNotificationDeliveryError(
  error: unknown,
): error is NotificationDeliveryError {
  return error instanceof NotificationDeliveryError;
}
