import { createHash } from 'node:crypto';
import type { AuthSession } from '@impact-flow/contracts';
import { AuthService } from './auth.service';

const TOKEN = 'session-token-value';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: {
      id: 'user-1',
      username: 'tester',
      displayName: '测试员',
      status: 'ACTIVE',
    },
    workspace: {
      id: 'workspace-1',
      name: '默认空间',
      code: 'default',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

describe('AuthService.switchWorkspace', () => {
  function setup() {
    const identities = {
      hasUsers: jest.fn().mockResolvedValue(true),
      findSession: jest.fn(),
      createSession: jest.fn(),
      createRegisteredOwner: jest.fn(),
      switchSessionWorkspace: jest.fn().mockResolvedValue(undefined),
      updateLastWorkspace: jest.fn().mockResolvedValue(undefined),
      writeAudit: jest.fn().mockResolvedValue(undefined),
    };
    const workspaces = { findForUser: jest.fn() };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const passwords = { verify: jest.fn(), hash: jest.fn() };
    const service = new AuthService(
      identities as never,
      workspaces as never,
      audit as never,
      passwords as never,
    );
    return { identities, workspaces, audit, passwords, service };
  }

  it('rejects switching to a workspace the user is not a member of', async () => {
    const { identities, workspaces, audit, service } = setup();
    identities.findSession.mockResolvedValue(session());
    // 非成员与不存在统一返回 null，调用方回 404
    workspaces.findForUser.mockResolvedValue(null);

    await expect(
      service.switchWorkspace(TOKEN, 'workspace-2'),
    ).rejects.toThrow('工作空间不存在或你不是其成员');
    expect(identities.switchSessionWorkspace).not.toHaveBeenCalled();
  });

  it('refuses to switch a non-owner into an archived workspace', async () => {
    const { identities, workspaces, service } = setup();
    identities.findSession.mockResolvedValue(session());
    workspaces.findForUser.mockResolvedValue({
      id: 'workspace-2',
      status: 'ARCHIVED',
      role: 'MEMBER',
    });

    await expect(
      service.switchWorkspace(TOKEN, 'workspace-2'),
    ).rejects.toThrow('工作空间已归档，仅所有者可以进入');
    expect(identities.switchSessionWorkspace).not.toHaveBeenCalled();
  });

  it('allows the owner to switch into an archived workspace to restore it', async () => {
    const { identities, workspaces, service } = setup();
    identities.findSession
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(
        session({
          workspace: {
            id: 'workspace-2',
            name: '测试团队',
            code: 'qa-team',
            role: 'OWNER',
            status: 'ARCHIVED',
          },
        }),
      );
    workspaces.findForUser.mockResolvedValue({
      id: 'workspace-2',
      status: 'ARCHIVED',
      role: 'OWNER',
    });

    const result = await service.switchWorkspace(TOKEN, 'workspace-2');

    expect(identities.switchSessionWorkspace).toHaveBeenCalledWith(
      TOKEN_HASH,
      'workspace-2',
    );
    expect(result.workspace.id).toBe('workspace-2');
    expect(result.workspace.status).toBe('ARCHIVED');
  });

  it('switches in place without rotating the session token', async () => {
    const { identities, workspaces, audit, service } = setup();
    identities.findSession
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(
        session({
          workspace: {
            id: 'workspace-2',
            name: '测试团队',
            code: 'qa-team',
            role: 'OWNER',
            status: 'ACTIVE',
          },
        }),
      );
    workspaces.findForUser.mockResolvedValue({ id: 'workspace-2', status: 'ACTIVE' });

    const result = await service.switchWorkspace(TOKEN, 'workspace-2', '10.0.0.1');

    // 关键：沿用同一个会话哈希，不签发新会话
    expect(identities.switchSessionWorkspace).toHaveBeenCalledWith(
      TOKEN_HASH,
      'workspace-2',
    );
    expect(identities.createSession).not.toHaveBeenCalled();
    expect(identities.updateLastWorkspace).toHaveBeenCalledWith('user-1', 'workspace-2');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-2',
        action: 'WORKSPACE_SWITCHED',
        detail: { from: 'workspace-1', to: 'workspace-2' },
      }),
    );
    expect(result.workspace.id).toBe('workspace-2');
  });

  it('is a no-op when switching to the current workspace', async () => {
    const { identities, workspaces, audit, service } = setup();
    identities.findSession.mockResolvedValue(session());
    workspaces.findForUser.mockResolvedValue({ id: 'workspace-1', status: 'ACTIVE' });

    const result = await service.switchWorkspace(TOKEN, 'workspace-1');

    expect(result.workspace.id).toBe('workspace-1');
    expect(identities.switchSessionWorkspace).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('rejects switching when the session is no longer valid', async () => {
    const { identities, service } = setup();
    identities.findSession.mockResolvedValue(null);

    await expect(service.switchWorkspace(TOKEN, 'workspace-2')).rejects.toThrow(
      '登录状态已失效，请重新登录',
    );
  });

  it('registers an owner and issues a session for the new workspace', async () => {
    const { identities, audit, passwords, service } = setup();
    const registeredSession = session({
      user: {
        id: 'user-new',
        username: 'new-owner',
        displayName: 'New Owner',
        status: 'ACTIVE',
      },
      workspace: {
        id: 'workspace-new',
        name: 'Product Team',
        code: 'product-team',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    passwords.hash.mockResolvedValue('hashed-password');
    identities.createRegisteredOwner.mockResolvedValue({
      user: {
        id: 'user-new',
        username: 'new-owner',
        passwordHash: 'hashed-password',
        displayName: 'New Owner',
        status: 'ACTIVE',
      },
      workspaceId: 'workspace-new',
    });
    identities.findSession.mockResolvedValue(registeredSession);

    const result = await service.register(
      {
        username: ' New-Owner ',
        password: 'password-123',
        displayName: ' New Owner ',
        workspaceName: ' Product Team ',
        workspaceCode: ' Product-Team ',
        workspaceDescription: ' Delivery workspace ',
      },
      '10.0.0.2',
    );

    expect(identities.createRegisteredOwner).toHaveBeenCalledWith({
      username: 'new-owner',
      passwordHash: 'hashed-password',
      displayName: 'New Owner',
      workspaceName: 'Product Team',
      workspaceCode: 'product-team',
      workspaceDescription: 'Delivery workspace',
    });
    expect(identities.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-new',
        workspaceId: 'workspace-new',
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-new',
        operatorId: 'user-new',
        action: 'USER_REGISTERED',
      }),
    );
    expect(result.session).toEqual(registeredSession);
  });

  it('does not allow registration before the first system bootstrap', async () => {
    const { identities, service } = setup();
    identities.hasUsers.mockResolvedValue(false);

    await expect(
      service.register({
        username: 'new-owner',
        password: 'password-123',
        displayName: 'New Owner',
        workspaceName: 'Product Team',
        workspaceCode: 'product-team',
      }),
    ).rejects.toThrow('请先完成系统首次初始化');
    expect(identities.createRegisteredOwner).not.toHaveBeenCalled();
  });
});
