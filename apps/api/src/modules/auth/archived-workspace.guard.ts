import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.decorators';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 归档工作空间下仍应放行的写入：
 *   - 撤销归档（否则归档就成了只能改数据库才能撤销的单向门）
 *   - 切换到其他工作空间、退出登录、新建工作空间（都是「离开」的路径）
 */
const ALLOWED_WRITES = [
  /^\/api\/workspaces\/[^/]+\/restore$/,
  /^\/api\/workspaces\/[^/]+\/switch$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/workspaces$/,
];

/**
 * 归档工作空间统一只读。
 *
 * 放在这里而不是逐个接口判断，是因为「归档」是一条横切规则：
 * 逐个接口加判断迟早会漏，而漏掉的那次就是归档空间被继续写入。
 * 必须在 AuthGuard 之后执行，依赖它写入的 request.auth。
 */
@Injectable()
export class ArchivedWorkspaceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & { method: string; url?: string; originalUrl?: string }
    >();
    const session = request.auth;
    if (!session || session.workspace.status !== 'ARCHIVED') return true;
    if (READ_METHODS.has(request.method)) return true;

    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (ALLOWED_WRITES.some((pattern) => pattern.test(path))) return true;

    throw new ForbiddenException(
      '工作空间已归档，当前为只读状态。请先恢复工作空间，或切换到其他工作空间。',
    );
  }
}
