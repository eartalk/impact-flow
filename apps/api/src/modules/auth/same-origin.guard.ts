import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie 认证下对状态变更请求做同源校验。
 * 浏览器 fetch 会携带 Origin；非浏览器客户端没有 Origin/Referer 时仍可使用 API。
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: { origin?: string; referer?: string };
    }>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const candidate = request.headers.origin ?? this.refererOrigin(request.headers.referer);
    if (!candidate) return true;

    const allowed = this.allowedOrigins();
    if (allowed.has(candidate)) return true;
    throw new ForbiddenException('请求来源不受信任');
  }

  private allowedOrigins() {
    return new Set(
      this.config
        .get<string>('WEB_ORIGIN', 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  private refererOrigin(referer?: string) {
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return '__invalid_referer__';
    }
  }
}
