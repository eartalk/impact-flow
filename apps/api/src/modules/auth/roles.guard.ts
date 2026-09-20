import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspaceRole } from '@impact-flow/contracts';
import { ROLES_KEY, type AuthenticatedRequest } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<WorkspaceRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !roles.includes(request.auth.workspace.role)) {
      throw new ForbiddenException('当前账号没有执行此操作的权限');
    }
    return true;
  }
}
