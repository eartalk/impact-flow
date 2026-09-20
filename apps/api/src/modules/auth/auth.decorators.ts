import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthSession, WorkspaceRole } from '@impact-flow/contracts';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: WorkspaceRole[]) => SetMetadata(ROLES_KEY, roles);

export type AuthenticatedRequest = {
  headers: { cookie?: string };
  auth?: AuthSession;
};

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth!,
);
