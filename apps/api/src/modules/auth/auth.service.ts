import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthSession,
  BootstrapInput,
  CreateWorkspaceMemberInput,
  LoginInput,
  RegisterInput,
  WorkspaceRole,
} from '@impact-flow/contracts';
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from '../../core/ports/identity.repository';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../core/ports/workspace.repository';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
} from '../../core/ports/audit.repository';
import { PasswordHasher } from '../../infrastructure/security/password-hasher';
import { SESSION_MAX_AGE_MS } from './auth.constants';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identities: IdentityRepository,
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(AUDIT_REPOSITORY)
    private readonly audit: AuditRepository,
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
    await this.audit.write({
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
    // 优先进入上次使用的工作空间；账号不属于任何有效空间时无法建立会话
    const workspace = await this.workspaces.resolveLoginWorkspace(user.id);
    if (!workspace) {
      throw new ForbiddenException('账号尚未加入任何工作空间');
    }
    const issued = await this.issueSession(user.id, workspace.id);
    await this.audit.write({
      workspaceId: issued.session.workspace.id,
      operatorId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
    });
    return issued;
  }

  async register(input: RegisterInput, ipAddress?: string) {
    if (!(await this.identities.hasUsers())) {
      throw new BadRequestException('请先完成系统首次初始化');
    }
    const created = await this.identities.createRegisteredOwner({
      username: input.username.trim().toLowerCase(),
      passwordHash: await this.passwords.hash(input.password),
      displayName: input.displayName.trim(),
      workspaceName: input.workspaceName.trim(),
      workspaceCode: input.workspaceCode.trim().toLowerCase(),
      workspaceDescription: input.workspaceDescription?.trim() || null,
    });
    await this.audit.write({
      workspaceId: created.workspaceId,
      operatorId: created.user.id,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: created.user.id,
      detail: { username: created.user.username },
      ipAddress,
    });
    return this.issueSession(created.user.id, created.workspaceId);
  }

  getSession(token: string) {
    return this.identities.findSession(this.hashToken(token));
  }

  /**
   * 切换会话所属工作空间，就地更新而不轮换 token。
   *
   * 由于 HttpOnly Cookie 在浏览器内由所有标签页共享，切换后其他标签页会在
   * 下一次请求时静默跟随到新工作空间。前端必须用 workspace generation 标记
   * 丢弃旧空间的在途响应，避免旧数据覆盖新空间状态。
   */
  async switchWorkspace(
    token: string,
    targetWorkspaceId: string,
    ipAddress?: string,
  ): Promise<AuthSession> {
    const tokenHash = this.hashToken(token);
    const current = await this.identities.findSession(tokenHash);
    if (!current) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const target = await this.workspaces.findForUser(
      targetWorkspaceId,
      current.user.id,
    );
    // 非成员与不存在的空间统一返回 404，避免暴露其他空间是否存在
    if (!target) {
      throw new NotFoundException('工作空间不存在或你不是其成员');
    }
    // 归档空间仅所有者可进入（只读管理态，用于恢复）；其他成员只能在 ACTIVE 空间间切换
    if (target.status === 'ARCHIVED' && target.role !== 'OWNER') {
      throw new ForbiddenException('工作空间已归档，仅所有者可以进入');
    }
    if (target.id === current.workspace.id) return current;

    await this.identities.switchSessionWorkspace(tokenHash, target.id);
    await this.identities.updateLastWorkspace(current.user.id, target.id);
    await this.audit.write({
      workspaceId: target.id,
      operatorId: current.user.id,
      action: 'WORKSPACE_SWITCHED',
      resourceType: 'WORKSPACE',
      resourceId: target.id,
      detail: { from: current.workspace.id, to: target.id },
      ipAddress,
    });

    const session = await this.identities.findSession(tokenHash);
    if (!session) {
      throw new UnauthorizedException('切换工作空间失败，请重新登录');
    }
    return session;
  }

  async logout(token: string | null, ipAddress?: string) {
    if (!token) return;
    const tokenHash = this.hashToken(token);
    const session = await this.identities.findSession(tokenHash);
    await this.identities.revokeSession(tokenHash);
    if (session) {
      await this.audit.write({
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

  /**
   * 移除成员。
   * 所有者不能被移除；移除普通成员后立即撤销该成员在此空间下的会话，
   * 否则对方手上的登录态仍可继续读取该空间数据。
   */
  async removeMember(workspaceId: string, operatorId: string, userId: string) {
    if (userId === operatorId) {
      throw new BadRequestException('不能移除自己，请先在成员管理中调整自己的角色');
    }
    const member = await this.identities.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('成员不存在');
    if (member.role === 'OWNER') {
      throw new BadRequestException('工作空间所有者不能被移除');
    }

    const removed = await this.identities.removeMember(workspaceId, userId);
    if (!removed) throw new NotFoundException('成员不存在');
    const revokedSessions = await this.identities.revokeMemberSessions(
      workspaceId,
      userId,
    );

    await this.audit.write({
      workspaceId,
      operatorId,
      action: 'MEMBER_REMOVED',
      resourceType: 'USER',
      resourceId: userId,
      detail: { username: member.username, role: member.role, revokedSessions },
    });
    return { removed: true, revokedSessions };
  }

  /**
   * 停用账号（账号级，跨工作空间生效）。
   * 必须同时撤销该账号在所有工作空间下的全部会话，否则停用不生效。
   */
  async disableAccount(
    workspaceId: string,
    operatorId: string,
    userId: string,
    ipAddress?: string,
  ) {
    if (userId === operatorId) {
      throw new BadRequestException('不能停用自己的账号');
    }
    const member = await this.identities.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('成员不存在');
    if (member.role === 'OWNER') {
      throw new BadRequestException('工作空间所有者不能被停用');
    }

    await this.identities.setUserStatus(userId, 'DISABLED');
    const revokedSessions = await this.identities.revokeAllSessions(userId);
    await this.audit.write({
      workspaceId,
      operatorId,
      action: 'ACCOUNT_DISABLED',
      resourceType: 'USER',
      resourceId: userId,
      detail: { username: member.username, revokedSessions },
      ipAddress,
    });
    return { disabled: true, revokedSessions };
  }

  /** 恢复账号登录能力 */
  async restoreAccount(
    workspaceId: string,
    operatorId: string,
    userId: string,
    ipAddress?: string,
  ) {
    const member = await this.identities.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('成员不存在');
    if (member.status !== 'DISABLED') {
      throw new BadRequestException('账号未被停用');
    }
    await this.identities.setUserStatus(userId, 'ACTIVE');
    await this.audit.write({
      workspaceId,
      operatorId,
      action: 'ACCOUNT_RESTORED',
      resourceType: 'USER',
      resourceId: userId,
      detail: { username: member.username },
      ipAddress,
    });
    return { restored: true };
  }

  /**
   * 管理员直接重置成员密码，并撤销其所有会话（旧会话里的密码不再有效）。
   * 审计只记用户名与会话数，不写新密码。
   */
  async resetPassword(
    workspaceId: string,
    operatorId: string,
    userId: string,
    newPassword: string,
    ipAddress?: string,
  ) {
    const member = await this.identities.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('成员不存在');

    await this.identities.updatePassword(
      userId,
      await this.passwords.hash(newPassword),
    );
    const revokedSessions = await this.identities.revokeAllSessions(userId);
    await this.audit.write({
      workspaceId,
      operatorId,
      action: 'PASSWORD_RESET',
      resourceType: 'USER',
      resourceId: userId,
      detail: { username: member.username, revokedSessions },
      ipAddress,
    });
    return { reset: true, revokedSessions };
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
    await this.audit.write({
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
    await this.audit.write({
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
