import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY, type AuthenticatedRequest } from './auth.decorators';
import { readCookie } from './auth-cookie';
import { SESSION_COOKIE } from './auth.constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('请先登录');
    const session = await this.auth.getSession(token);
    if (!session) throw new UnauthorizedException('登录状态已失效，请重新登录');
    request.auth = session;
    return true;
  }
}
