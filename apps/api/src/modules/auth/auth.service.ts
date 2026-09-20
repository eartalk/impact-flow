import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  BootstrapInput,
  CreateWorkspaceMemberInput,
  LoginInput,
  WorkspaceRole,
} from '@impact-flow/contracts';
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from '../../core/ports/identity.repository';
import { PasswordHasher } from '../../infrastructure/security/password-hasher';
import { SESSION_MAX_AGE_MS } from './auth.constants';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identities: IdentityRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async bootstrapStatus() {
    return { required: !(await this.identities.hasUsers()) };
  }

  async bootstrap(input: BootstrapInput, ipAddress?: string) {
    if (await this.identities.hasUsers()) {
      throw new ConflictException('系统已经完成初始化');
    }
    const user = await this.identities.createInitialOwner({
      username: input.username.trim().toLowerCase(),
      passwordHash: await this.passwords.hash(input.password),
      displayName: input.displayName.trim(),
      workspaceName: input.workspaceName.trim(),
    });
    await this.identities.writeAudit({
      workspaceId: DEFAULT_WORKSPACE_ID,
      operatorId: user.id,
      action: 'SYSTEM_BOOTSTRAPPED',
      resourceType: 'WORKSPACE',
      resourceId: DEFAULT_WORKSPACE_ID,
      ipAddress,
    });
    return this.issueSession(user.id, DEFAULT_WORKSPACE_ID);
  }

  async login(input: LoginInput, ipAddress?: string) {
    const username = input.username.trim().toLowerCase();
    const user = await this.identities.findUserByUsername(username);
    if (!user || !(await this.passwords.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号已停用');
    }
    const issued = await this.issueSession(user.id, DEFAULT_WORKSPACE_ID);
    await this.identities.writeAudit({
      workspaceId: issued.session.workspace.id,
      operatorId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
    });
    return issued;
  }

  getSession(token: string) {
    return this.identities.findSession(this.hashToken(token));
  }

  async logout(token: string | null, ipAddress?: string) {
    if (!token) return;
    const tokenHash = this.hashToken(token);
    const session = await this.identities.findSession(tokenHash);
    await this.identities.revokeSession(tokenHash);
    if (session) {
      await this.identities.writeAudit({
        workspaceId: session.workspace.id,
        operatorId: session.user.id,
        action: 'USER_LOGOUT',
        resourceType: 'USER',
        resourceId: session.user.id,
        ipAddress,
      });
    }
  }

  listMembers(workspaceId: string) {
    return this.identities.listMembers(workspaceId);
  }

  async createMember(
    workspaceId: string,
    operatorId: string,
    input: CreateWorkspaceMemberInput,
  ) {
    const member = await this.identities.createMember(workspaceId, {
      username: input.username.trim().toLowerCase(),
      passwordHash: await this.passwords.hash(input.password),
      displayName: input.displayName.trim(),
      role: input.role,
    });
    await this.identities.writeAudit({
      workspaceId,
      operatorId,
      action: 'MEMBER_CREATED',
      resourceType: 'USER',
      resourceId: member.userId,
      detail: { role: member.role, username: member.username },
    });
    return member;
  }

  async updateMemberRole(
    workspaceId: string,
    operatorId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ) {
    const member = await this.identities.updateMemberRole(workspaceId, userId, role);
    if (!member) throw new NotFoundException('成员不存在，或所有者角色不可修改');
    await this.identities.writeAudit({
      workspaceId,
      operatorId,
      action: 'MEMBER_ROLE_UPDATED',
      resourceType: 'USER',
      resourceId: userId,
      detail: { role },
    });
    return member;
  }

  private async issueSession(userId: string, workspaceId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.identities.createSession({
      userId,
      workspaceId,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
    });
    const session = await this.identities.findSession(this.hashToken(token));
    if (!session) throw new UnauthorizedException('无法创建登录会话');
    return { token, session };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
