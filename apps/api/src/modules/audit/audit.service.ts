import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogPage, AuditLogQuery } from '@impact-flow/contracts';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
} from '../../core/ports/audit.repository';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY)
    private readonly audit: AuditRepository,
  ) {}

  /** 审计日志按工作空间隔离，workspaceId 只能来自服务端会话 */
  list(query: AuditLogQuery, workspaceId: string): Promise<AuditLogPage> {
    return this.audit.list(query, workspaceId);
  }
}
