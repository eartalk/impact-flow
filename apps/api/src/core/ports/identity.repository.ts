import type {
  AuthSession,
  CreateWorkspaceMemberInput,
  RegisterInput,
  WorkspaceMember,
  WorkspaceRole,
} from '@impact-flow/contracts';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
}

export interface RegisterOwnerInput
  extends Omit<RegisterInput, 'password' | 'workspaceDescription'> {
  passwordHash: string;
  workspaceDescription: string | null;
}

export interface IdentityRepository {
  hasUsers(): Promise<boolean>;
  createInitialOwner(input: {
    username: string;
    passwordHash: string;
    displayName: string;
    workspaceName: string;
  }): Promise<StoredUser>;
  createRegisteredOwner(
    input: RegisterOwnerInput,
  ): Promise<{ user: StoredUser; workspaceId: string }>;
  findUserByUsername(username: string): Promise<StoredUser | null>;
  createSession(input: {
    userId: string;
    workspaceId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSession(tokenHash: string): Promise<AuthSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
  /**
   * 就地把会话切换到另一个工作空间，不轮换 token。
   * 调用方必须已校验目标空间为 ACTIVE 且用户是其成员。
   * 由于 Cookie 在浏览器内由所有标签页共享，切换后其他标签页会在下次请求时
   * 静默跟随到新工作空间，因此前端需要 generation 标记防止旧请求回写状态。
   */
  switchSessionWorkspace(tokenHash: string, workspaceId: string): Promise<void>;
  /** 记录用户最后使用的工作空间，登录时优先进入该空间 */
  updateLastWorkspace(userId: string, workspaceId: string): Promise<void>;
  /** 查询单个成员关系，用于切换前的成员资格校验 */
  findMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  /** 移除成员关系；返回是否确实移除了记录 */
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  /** 撤销某成员在该工作空间下的全部有效会话；移除成员后必须调用 */
  revokeMemberSessions(workspaceId: string, userId: string): Promise<number>;
  findUserById(userId: string): Promise<StoredUser | null>;
  /**
   * 停用/恢复账号（账号级，跨工作空间生效）。
   * 停用必须同时撤销该账号在所有工作空间下的全部会话，否则停用不生效。
   */
  setUserStatus(userId: string, status: StoredUser['status']): Promise<boolean>;
  /** 撤销某账号在所有工作空间下的全部有效会话 */
  revokeAllSessions(userId: string): Promise<number>;
  /** 更新账号密码哈希 */
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  createMember(
    workspaceId: string,
    input: Omit<CreateWorkspaceMemberInput, 'password'> & { passwordHash: string },
  ): Promise<WorkspaceMember>;
  updateMemberRole(
    workspaceId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMember | null>;
}
