import type { WorkspaceMember } from '@impact-flow/contracts';
import { AuthService } from './auth.service';

function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    userId: 'user-2',
    username: 'tester',
    displayName: '测试员',
    status: 'ACTIVE',
    role: 'MEMBER',
    joinedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AuthService 账号治理', () => {
  function setup() {
    const identities = {
      findMember: jest.fn(),
      setUserStatus: jest.fn().mockResolvedValue(true),
      revokeAllSessions: jest.fn().mockResolvedValue(5),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const passwords = { hash: jest.fn().mockResolvedValue('hashed') };
    return {
      identities,
      audit,
      passwords,
      service: new AuthService(
        identities as never,
        {} as never,
        audit as never,
        passwords as never,
      ),
    };
  }

  describe('停用账号', () => {
    it('refuses to disable yourself', async () => {
      const { identities, service } = setup();

      await expect(
        service.disableAccount('workspace-1', 'user-1', 'user-1'),
      ).rejects.toThrow('不能停用自己的账号');
      expect(identities.setUserStatus).not.toHaveBeenCalled();
    });

    it('refuses to disable the owner', async () => {
      const { identities, service } = setup();
      identities.findMember.mockResolvedValue(member({ role: 'OWNER' }));

      await expect(
        service.disableAccount('workspace-1', 'user-1', 'user-2'),
      ).rejects.toThrow('工作空间所有者不能被停用');
      expect(identities.setUserStatus).not.toHaveBeenCalled();
    });

    it('disables the account and revokes all sessions across workspaces', async () => {
      const { identities, audit, service } = setup();
      identities.findMember.mockResolvedValue(member());

      const result = await service.disableAccount('workspace-1', 'user-1', 'user-2');

      expect(identities.setUserStatus).toHaveBeenCalledWith('user-2', 'DISABLED');
      expect(identities.revokeAllSessions).toHaveBeenCalledWith('user-2');
      expect(result).toEqual({ disabled: true, revokedSessions: 5 });
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_DISABLED', resourceId: 'user-2' }),
      );
    });
  });

  describe('恢复账号', () => {
    it('rejects restoring an account that is not disabled', async () => {
      const { identities, service } = setup();
      identities.findMember.mockResolvedValue(member({ status: 'ACTIVE' }));

      await expect(
        service.restoreAccount('workspace-1', 'user-1', 'user-2'),
      ).rejects.toThrow('账号未被停用');
      expect(identities.setUserStatus).not.toHaveBeenCalled();
    });

    it('restores a disabled account', async () => {
      const { identities, audit, service } = setup();
      identities.findMember.mockResolvedValue(member({ status: 'DISABLED' }));

      const result = await service.restoreAccount('workspace-1', 'user-1', 'user-2');

      expect(identities.setUserStatus).toHaveBeenCalledWith('user-2', 'ACTIVE');
      expect(result).toEqual({ restored: true });
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_RESTORED' }),
      );
    });
  });

  describe('重置密码', () => {
    it('resets the password, revokes sessions, and never writes the password into audit', async () => {
      const { identities, audit, passwords, service } = setup();
      identities.findMember.mockResolvedValue(member());

      const result = await service.resetPassword(
        'workspace-1',
        'user-1',
        'user-2',
        'brand-new-secret-123',
      );

      expect(passwords.hash).toHaveBeenCalledWith('brand-new-secret-123');
      expect(identities.updatePassword).toHaveBeenCalledWith('user-2', 'hashed');
      expect(identities.revokeAllSessions).toHaveBeenCalledWith('user-2');
      expect(result).toEqual({ reset: true, revokedSessions: 5 });

      const auditPayload = audit.write.mock.calls[0][0];
      expect(auditPayload.action).toBe('PASSWORD_RESET');
      expect(JSON.stringify(auditPayload)).not.toContain('brand-new-secret-123');
    });
  });
});
