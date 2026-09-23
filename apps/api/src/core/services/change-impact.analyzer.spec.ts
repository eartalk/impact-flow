import { ChangeImpactAnalyzer } from './change-impact.analyzer';

describe('ChangeImpactAnalyzer', () => {
  const analyzer = new ChangeImpactAnalyzer();

  it('raises risk and exposes unmapped files as scopes that need review', () => {
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
    expect(result.regressionSuggestions).toHaveLength(2);
    expect(result.regressionSuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessDomain: '交易与支付',
        businessScenario: '交易与支付创建',
        targetType: 'DATA',
        coverageStatus: 'NEEDS_REVIEW',
      }),
      expect.objectContaining({
        businessDomain: '交易与支付',
        targetType: 'API',
        impactRelation: 'UNKNOWN',
      }),
    ]));
  });

  it('turns changed symbols and their callers into evidence-backed regression scopes', () => {
    const changedSymbol = {
      key: 'prepare',
      name: 'getScheduleModifyPrepare',
      qualifiedName: 'ScheduleService.getScheduleModifyPrepare',
      kind: 'METHOD' as const,
      filePath: 'src/services/schedule.ts',
      startLine: 20,
      endLine: 34,
      projectId: 'api',
      changeType: 'MODIFIED' as const,
      riskLevel: 'MEDIUM' as const,
      reason: '方法实现发生变化',
      httpRoutes: [{ method: 'GET', path: '/config/search', role: 'CLIENT' as const }],
    };
    const pageSymbol = {
      key: 'editor',
      name: 'ScheduleManagementEditor',
      qualifiedName: 'ScheduleManagementEditor',
      kind: 'FUNCTION' as const,
      filePath: 'src/screens/schedule-management-editor/index.tsx',
      startLine: 10,
      endLine: 100,
      projectId: 'web',
    };

    const result = analyzer.analyze({
      files: [{
        path: 'src/services/schedule.ts',
        oldPath: null,
        changeType: 'M',
        additions: 8,
        deletions: 3,
      }],
      additions: 8,
      deletions: 3,
      symbolChanges: [changedSymbol],
      symbolImpacts: [{
        changedSymbolKey: changedSymbol.key,
        impactedSymbol: pageSymbol,
        depth: 1,
        callChain: [pageSymbol, changedSymbol],
        reason: '调用了变更方法',
      }],
    });

    expect(result.regressionSuggestions).toEqual([
      expect.objectContaining({
        title: '工期管理页面',
        businessDomain: '工期管理',
        boundaryType: 'PAGE',
        impactRelation: 'CROSS_REPOSITORY',
        coverageStatus: 'CONFIRMED',
        entryPoints: ['ScheduleManagementEditor'],
        sourceSymbolKeys: ['prepare'],
      }),
    ]);
  });

});
