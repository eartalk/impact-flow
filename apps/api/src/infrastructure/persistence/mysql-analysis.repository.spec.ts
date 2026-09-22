import { MysqlAnalysisRepository } from './mysql-analysis.repository';
import type { DatabaseService } from './database.service';

describe('MysqlAnalysisRepository', () => {
  it('uses a compact projection for the frequently-polled analysis list', async () => {
    const query = jest.fn().mockResolvedValue([[]]);
    const database = {
      connection: jest.fn().mockResolvedValue({ query }),
    } as unknown as DatabaseService;
    const repository = new MysqlAnalysisRepository(database);

    await expect(repository.findAll('workspace-1')).resolves.toEqual([]);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).not.toContain('SELECT a.*');
    expect(sql).not.toContain('change_evidence');
    expect(sql).not.toContain('symbol_impacts');
    expect(sql).not.toContain('regression_suggestions');
    expect(sql).toContain('a.progress_stage');
    expect(sql).toContain('JSON_EXTRACT(a.ai_analysis');
  });
});
