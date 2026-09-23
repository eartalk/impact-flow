import type { ChangedFile } from '@impact-flow/contracts';
import { ChangeRelevancePolicy } from './change-relevance.policy';

describe('ChangeRelevancePolicy', () => {
  const policy = new ChangeRelevancePolicy();
  const file = (path: string): ChangedFile => ({
    path, oldPath: null, changeType: 'M', additions: 2, deletions: 1,
  });

  it('ignores ordinary markdown but keeps runtime markdown', () => {
    const result = policy.evaluate([
      file('README.md'),
      file('docs/design.md'),
      file('prompts/regression.md'),
      file('src/help-page.mdx'),
    ]);

    expect(result.summary.ignored).toBe(2);
    expect(result.summary.businessRelevant).toBe(1);
    expect(result.summary.needsReview).toBe(1);
    expect(result.analysisFiles.map((item) => item.path)).toEqual([
      'prompts/regression.md', 'src/help-page.mdx',
    ]);
  });

  it('turns tests and delivery files into technical verification suggestions', () => {
    const result = policy.evaluate([
      file('src/order.service.spec.ts'),
      file('Dockerfile'),
      file('pnpm-lock.yaml'),
    ]);

    expect(result.analysisFiles).toEqual([]);
    expect(result.summary.technicalValidation).toBe(3);
    expect(result.technicalSuggestions.map((item) => item.title)).toEqual([
      '依赖安装与构建验证', '部署流水线验证', '测试套件完整性验证',
    ]);
  });

  it('never filters migrations, contracts, or runtime source', () => {
    const result = policy.evaluate([
      file('database/027_change_order.sql'),
      file('src/order.dto.ts'),
      file('packages/contracts/schema.graphql'),
    ]);

    expect(result.summary.businessRelevant).toBe(3);
    expect(result.analysisFiles).toHaveLength(3);
  });
});
