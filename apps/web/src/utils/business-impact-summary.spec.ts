import { describe, expect, it } from 'vitest';
import { summarizeBusinessImpacts } from './business-impact-summary';

describe('summarizeBusinessImpacts', () => {
  it('groups the final regression plan by business module', () => {
    const result = summarizeBusinessImpacts({
      regressionSuggestions: [{
        title: '工地列表查询',
        scope: '列表接口经过本次修改的方法',
        priority: 'P0',
        businessDomain: '工地列表',
        businessScenario: '查看工地列表',
        entryPoints: ['#/project/list'],
        coverageStatus: 'CONFIRMED',
      }],
    });

    expect(result.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '工地列表', changeCount: 1 }),
    ]));
    expect(result.changeCount).toBe(1);
  });

  it('returns an empty summary without suggestions', () => {
    const result = summarizeBusinessImpacts(null);
    expect(result.modules).toEqual([]);
    expect(result.changeCount).toBe(0);
  });
});
