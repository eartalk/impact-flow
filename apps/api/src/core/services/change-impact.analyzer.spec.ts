import { ChangeImpactAnalyzer } from './change-impact.analyzer';

describe('ChangeImpactAnalyzer', () => {
  const analyzer = new ChangeImpactAnalyzer();

  it('raises risk and creates targeted suggestions for database and API changes', () => {
    const result = analyzer.analyze({
      files: [
        {
          path: 'database/006_add_order.sql',
          oldPath: null,
          changeType: 'A',
          additions: 80,
          deletions: 0,
        },
        {
          path: 'apps/api/src/modules/orders/orders.controller.ts',
          oldPath: null,
          changeType: 'M',
          additions: 90,
          deletions: 20,
        },
      ],
      additions: 170,
      deletions: 20,
    });

    expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel);
    expect(result.impactedModules.map((item) => item.name)).toContain('数据库');
    expect(result.regressionSuggestions.map((item) => item.title)).toEqual(
      expect.arrayContaining(['数据库升级与回滚验证', '接口兼容性回归']),
    );
  });
});
