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
