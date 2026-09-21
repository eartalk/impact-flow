import type { WorkspaceOverview } from '@impact-flow/contracts';
import { WorkspacesService } from './workspaces.service';

function workspaceOverview(
  overrides: Partial<WorkspaceOverview> = {},
): WorkspaceOverview {
  return {
    id: 'workspace-1',
    name: '测试团队',
    code: 'qa-team',
    description: null,
    status: 'ACTIVE',
    role: 'OWNER',
    ownerUserId: 'user-1',
    memberCount: 1,
    projectCount: 0,
    createdAt: '2026-09-21T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

describe('WorkspacesService', () => {
  function setup() {
    const workspaces = {
      listForUser: jest.fn().mockResolvedValue([]),
      findForUser: jest.fn(),
      findByCode: jest.fn().mockResolvedValue(null),
      createWithOwner: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      resolveLoginWorkspace: jest.fn(),
      isActive: jest.fn().mockResolvedValue(true),
      archive: jest.fn().mockResolvedValue(true),
      restore: jest.fn().mockResolvedValue(true),
    };
    const identities = {};
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return {
      workspaces,
      identities,
      audit,
      service: new WorkspacesService(
        workspaces as never,
        identities as never,
        audit as never,
      ),
    };
  }

  it('creates a workspace and records the creator as owner', async () => {
    const { workspaces, identities, audit, service } = setup();
    const created = workspaceOverview();
    workspaces.createWithOwner.mockResolvedValue(created);

    const result = await service.create('user-1', {
      name: '  测试团队 ',
      code: 'QA-Team',
      description: ' 负责生产验收 ',
    });

    expect(workspaces.createWithOwner).toHaveBeenCalledWith({
      name: '测试团队',
      code: 'qa-team',
      description: '负责生产验收',
      ownerUserId: 'user-1',
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        operatorId: 'user-1',
        action: 'WORKSPACE_CREATED',
      }),
    );
    expect(result).toBe(created);
  });

  it('rejects a duplicated workspace code', async () => {
    const { workspaces, audit, service } = setup();
    workspaces.findByCode.mockResolvedValue({ id: 'other', name: '其他团队' });

    await expect(
      service.create('user-1', { name: '测试团队', code: 'qa-team' }),
    ).rejects.toThrow('工作空间编码 qa-team 已被占用');
    expect(workspaces.createWithOwner).not.toHaveBeenCalled();
  });

  it('allows signed-in users to create workspaces', async () => {
    const { service } = setup();
    await expect(service.creationPolicy('user-1')).resolves.toEqual({
      mode: 'ANY_USER',
      allowed: true,
    });
  });

  it('clears the description when an empty string is submitted', async () => {
    const { workspaces, audit, service } = setup();
    workspaces.findForUser.mockResolvedValue(workspaceOverview());

    await service.update('workspace-1', 'user-1', { description: '' });

    expect(workspaces.update).toHaveBeenCalledWith(
      'workspace-1',
      { description: null },
      'user-1',
    );
  });

  it('does not touch fields that were omitted', async () => {
    const { workspaces, audit, service } = setup();
    workspaces.findForUser.mockResolvedValue(workspaceOverview());

    await service.update('workspace-1', 'user-1', { name: ' 新名字 ' });

    expect(workspaces.update).toHaveBeenCalledWith(
      'workspace-1',
      { name: '新名字' },
      'user-1',
    );
  });
});

describe('WorkspacesService 归档与恢复', () => {
  function setup() {
    const workspaces = {
      findForUser: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return {
      workspaces,
      audit,
      service: new WorkspacesService(
        workspaces as never,
        {} as never,
        audit as never,
      ),
    };
  }

  it('archives the workspace and records the audit entry', async () => {
    const { workspaces, audit, service } = setup();
    workspaces.archive.mockResolvedValue(true);

    const result = await service.archive('workspace-1', 'user-1', '10.0.0.1');

    expect(workspaces.archive).toHaveBeenCalledWith('workspace-1', 'user-1');
    expect(result).toEqual({ archived: true });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKSPACE_ARCHIVED',
        workspaceId: 'workspace-1',
        operatorId: 'user-1',
      }),
    );
  });

  it('rejects archiving an already archived or missing workspace', async () => {
    const { workspaces, service } = setup();
    workspaces.archive.mockResolvedValue(false);

    await expect(service.archive('workspace-1', 'user-1')).rejects.toThrow(
      '工作空间不存在或已归档',
    );
  });

  it('restores an archived workspace', async () => {
    const { workspaces, audit, service } = setup();
    workspaces.findForUser.mockResolvedValue(
      workspaceOverview({ status: 'ARCHIVED', archivedAt: '2026-09-21T01:00:00.000Z' }),
    );
    workspaces.restore.mockResolvedValue(true);

    const result = await service.restore('workspace-1', 'user-1');

    expect(result).toEqual({ restored: true });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WORKSPACE_RESTORED' }),
    );
  });

  it('rejects restoring a workspace that is not archived', async () => {
    const { workspaces, service } = setup();
    workspaces.findForUser.mockResolvedValue(workspaceOverview());

    await expect(service.restore('workspace-1', 'user-1')).rejects.toThrow(
      '工作空间不存在或未归档',
    );
    expect(workspaces.restore).not.toHaveBeenCalled();
  });

  it('does not restore a workspace owned by another tenant', async () => {
    const { workspaces, service } = setup();
    workspaces.findForUser.mockResolvedValue(null);

    await expect(service.restore('workspace-2', 'user-1')).rejects.toThrow(
      '工作空间不存在或你不是其所有者',
    );
    expect(workspaces.restore).not.toHaveBeenCalled();
  });

  it('does not let a non-owner restore an archived workspace', async () => {
    const { workspaces, service } = setup();
    workspaces.findForUser.mockResolvedValue(
      workspaceOverview({ role: 'ADMIN', status: 'ARCHIVED' }),
    );

    await expect(service.restore('workspace-1', 'user-2')).rejects.toThrow(
      '工作空间不存在或你不是其所有者',
    );
    expect(workspaces.restore).not.toHaveBeenCalled();
  });
});
