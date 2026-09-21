import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('always scopes audit queries to the session workspace', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    };
    const service = new AuditService(repository as never);
    const query = { action: 'WORKSPACE_UPDATED', page: 1, pageSize: 20 };

    await service.list(query, 'workspace-1');

    expect(repository.list).toHaveBeenCalledWith(query, 'workspace-1');
  });
});
