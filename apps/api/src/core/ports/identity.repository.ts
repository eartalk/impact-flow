import type {
  AuthSession,
  CreateWorkspaceMemberInput,
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

export interface IdentityRepository {
  hasUsers(): Promise<boolean>;
  createInitialOwner(input: {
    username: string;
    passwordHash: string;
    displayName: string;
    workspaceName: string;
  }): Promise<StoredUser>;
  findUserByUsername(username: string): Promise<StoredUser | null>;
  createSession(input: {
    userId: string;
    workspaceId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSession(tokenHash: string): Promise<AuthSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  createMember(
    workspaceId: string,
    input: Omit<CreateWorkspaceMemberInput, 'password'> & { passwordHash: string },
  ): Promise<WorkspaceMember>;
  updateMemberRole(
    workspaceId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<WorkspaceMember | null>;
  writeAudit(input: {
    workspaceId?: string | null;
    operatorId?: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    detail?: object | null;
    ipAddress?: string | null;
  }): Promise<void>;
}
