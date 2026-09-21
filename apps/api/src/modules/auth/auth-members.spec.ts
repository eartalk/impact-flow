import type { WorkspaceMember } from '@impact-flow/contracts';
import { AuthService } from './auth.service';

function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    userId: 'user-1',
    username: 'owner',
    displayName: '所有者',
    status: 'ACTIVE',
    role: 'OWNER',
    joinedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AuthService 成员治理', () => {
  function setup() {
    const identities = {
      findMember: jest.fn(),
      removeMember: jest.fn().mockResolvedValue(true),
      revokeMemberSessions: jest.fn().mockResolvedValue(3),
      findUserById: jest.fn(),
    };
    const workspaces = {};
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const passwords = { verify: jest.fn().mockResolvedValue(true) };
    return {
      identities,
      workspaces,
      audit,
      passwords,
      service: new AuthService(
        identities as never,
        workspaces as never,
        audit as never,
        passwords as never,
      ),
    };
  }

  describe('移除成员', () => {
    it('refuses to remove the operator themselves', async () => {
      const { identities, service } = setup();

      await expect(
        service.removeMember('workspace-1', 'user-1', 'user-1'),
      ).rejects.toThrow('不能移除自己');
      expect(identities.removeMember).not.toHaveBeenCalled();
    });

    it('refuses to remove the workspace owner', async () => {
      const { identities, service } = setup();
      identities.findMember.mockResolvedValue(member());

      await expect(
        service.removeMember('workspace-1', 'user-2', 'user-1'),
      ).rejects.toThrow('工作空间所有者不能被移除');
      expect(identities.removeMember).not.toHaveBeenCalled();
    });

    it('revokes the removed member sessions so access stops immediately', async () => {
      const { identities, audit, service } = setup();
      identities.findMember.mockResolvedValue(
        member({ userId: 'user-2', role: 'MEMBER' }),
      );

      const result = await service.removeMember('workspace-1', 'user-1', 'user-2');

      expect(identities.removeMember).toHaveBeenCalledWith('workspace-1', 'user-2');
      expect(identities.revokeMemberSessions).toHaveBeenCalledWith(
        'workspace-1',
        'user-2',
      );
      expect(result).toEqual({ removed: true, revokedSessions: 3 });
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MEMBER_REMOVED',
          resourceId: 'user-2',
        }),
      );
    });
  });

});
