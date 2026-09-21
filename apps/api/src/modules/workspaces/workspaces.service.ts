import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceCreationMode,
  WorkspaceCreationPolicy,
  WorkspaceOverview,
} from '@impact-flow/contracts';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../core/ports/workspace.repository';
import {
  IDENTITY_REPOSITORY,
  type IdentityRepository,
} from '../../core/ports/identity.repository';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
} from '../../core/ports/audit.repository';

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    @Inject(IDENTITY_REPOSITORY)
    private readonly identities: IdentityRepository,
    @Inject(AUDIT_REPOSITORY)
    private readonly audit: AuditRepository,
    private readonly config: ConfigService,
  ) {}

  list(userId: string): Promise<WorkspaceOverview[]> {
    return this.workspaces.listForUser(userId);
  }

  async getCurrent(userId: string, workspaceId: string): Promise<WorkspaceOverview> {
    const workspace = await this.workspaces.findForUser(workspaceId, userId);
    if (!workspace) throw new NotFoundException('工作空间不存在');
    return workspace;
  }

  /**
   * 工作空间创建权限是用户级策略，不复用工作空间内的角色。
   * ADMIN_ONLY 以「至少是一个 ACTIVE 工作空间的 OWNER」作为系统管理员的判定依据，
   * 这样无需新增系统级角色即可限制自助创建。
   */
  async creationPolicy(userId: string): Promise<WorkspaceCreationPolicy> {
    const mode = this.creationMode();
    if (mode === 'DISABLED') return { mode, allowed: false };
    if (mode === 'ANY_USER') return { mode, allowed: true };
    const owned = (await this.workspaces.listForUser(userId)).some(
      (workspace) => workspace.status === 'ACTIVE' && workspace.role === 'OWNER',
    );
    return { mode, allowed: owned };
  }

  async create(
    userId: string,
    input: CreateWorkspaceInput,
    ipAddress?: string,
  ): Promise<WorkspaceOverview> {
    const policy = await this.creationPolicy(userId);
    if (!policy.allowed) {
      throw new ForbiddenException('当前系统不允许自助创建工作空间');
    }

    const name = input.name.trim();
    const code = input.code.trim().toLowerCase();
    if (await this.workspaces.findByCode(code)) {
      throw new ConflictException(`工作空间编码 ${code} 已被占用`);
    }

    const created = await this.workspaces.createWithOwner({
      name,
      code,
      description: input.description?.trim() || null,
      ownerUserId: userId,
    });
    await this.audit.write({
      workspaceId: created.id,
      operatorId: userId,
      action: 'WORKSPACE_CREATED',
      resourceType: 'WORKSPACE',
      resourceId: created.id,
      detail: { name: created.name, code: created.code },
      ipAddress,
    });
    return created;
  }

  async update(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput,
    ipAddress?: string,
  ): Promise<WorkspaceOverview> {
    const fields: UpdateWorkspaceInput = {};
    if (input.name !== undefined) fields.name = input.name.trim();
    // 空字符串与 null 都视为清空描述
    if (input.description !== undefined) {
      fields.description = input.description?.trim() || null;
    }

    await this.workspaces.update(workspaceId, fields, userId);
    await this.audit.write({
      workspaceId,
      operatorId: userId,
      action: 'WORKSPACE_UPDATED',
      resourceType: 'WORKSPACE',
      resourceId: workspaceId,
      detail: fields as object,
      ipAddress,
    });
    return this.getCurrent(userId, workspaceId);
  }

  /**
   * 归档工作空间：状态改为 ARCHIVED，同事务内取消未运行的 READY 任务。
   * 归档后会话仍可指向该空间（进入只读管理态），但所有写入被全局守卫拦截。
   */
  async archive(workspaceId: string, userId: string, ipAddress?: string) {
    const archived = await this.workspaces.archive(workspaceId, userId);
    if (!archived) {
      throw new BadRequestException('工作空间不存在或已归档');
    }
    await this.audit.write({
      workspaceId,
      operatorId: userId,
      action: 'WORKSPACE_ARCHIVED',
      resourceType: 'WORKSPACE',
      resourceId: workspaceId,
      ipAddress,
    });
    return { archived: true };
  }

  /** 恢复归档工作空间。不补跑历史巡检，自动化配置原样保留。 */
  async restore(workspaceId: string, userId: string, ipAddress?: string) {
    const workspace = await this.workspaces.findForUser(workspaceId, userId);
    if (!workspace || workspace.role !== 'OWNER') {
      throw new NotFoundException('工作空间不存在或你不是其所有者');
    }
    if (workspace.status !== 'ARCHIVED') {
      throw new BadRequestException('工作空间不存在或未归档');
    }
    const restored = await this.workspaces.restore(workspaceId, userId);
    if (!restored) {
      throw new BadRequestException('工作空间不存在或未归档');
    }
    await this.audit.write({
      workspaceId,
      operatorId: userId,
      action: 'WORKSPACE_RESTORED',
      resourceType: 'WORKSPACE',
      resourceId: workspaceId,
      ipAddress,
    });
    return { restored: true };
  }

  private creationMode(): WorkspaceCreationMode {
    const raw = (this.config.get('WORKSPACE_CREATION_MODE') ?? 'ANY_USER')
      .toString()
      .trim()
      .toUpperCase();
    if (raw === 'DISABLED' || raw === 'ADMIN_ONLY' || raw === 'ANY_USER') {
      return raw;
    }
    return 'ANY_USER';
  }
}
