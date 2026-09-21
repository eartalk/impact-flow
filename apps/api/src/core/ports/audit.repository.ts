import type { AuditLogPage, AuditLogQuery } from '@impact-flow/contracts';

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditWriteInput {
  workspaceId?: string | null;
  operatorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /**
   * 脱敏后的变更摘要。
   * 禁止写入密码、Session Token、完整 API Key 或完整 Webhook，
   * 只记录资源 ID、操作类型与脱敏后的字段变化。
   */
  detail?: object | null;
  ipAddress?: string | null;
}

/**
 * 审计日志读写。
 * 与身份、工作空间仓储分开，因为审计是横跨所有资源的独立关注点。
 */
export interface AuditRepository {
  write(input: AuditWriteInput): Promise<void>;
  list(query: AuditLogQuery, workspaceId: string): Promise<AuditLogPage>;
}
