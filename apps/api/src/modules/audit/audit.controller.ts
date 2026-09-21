import { Controller, Get, Query } from '@nestjs/common';
import type { AuthSession } from '@impact-flow/contracts';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { CurrentSession, Roles } from '../auth/auth.decorators';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** 审计日志含成员与配置变更，限制为管理者可读 */
  @Roles('OWNER', 'ADMIN')
  @Get()
  list(
    @Query() query: ListAuditLogsDto,
    @CurrentSession() session: AuthSession,
  ) {
    return this.audit.list(query, session.workspace.id);
  }
}
