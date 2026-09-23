import type {
  ChangedFile,
  ChangeRelevanceClassification,
  ChangeRelevanceDecision,
  ChangeRelevanceSummary,
  RegressionSuggestion,
} from '@impact-flow/contracts';

export interface ChangeRelevanceResult {
  analysisFiles: ChangedFile[];
  ignoredFiles: ChangedFile[];
  technicalFiles: ChangedFile[];
  reviewFiles: ChangedFile[];
  technicalSuggestions: RegressionSuggestion[];
  summary: ChangeRelevanceSummary;
}

/**
 * Deterministic gate between Git facts and expensive semantic/AI analysis.
 * It removes known non-runtime noise without hiding uncertain or high-risk changes.
 */
export class ChangeRelevancePolicy {
  static readonly VERSION = 'change-relevance-v1';

  evaluate(files: ChangedFile[]): ChangeRelevanceResult {
    const decisions = files.map((file) => this.classify(file.path));
    const byPath = new Map(decisions.map((decision) => [this.normalize(decision.filePath), decision]));
    const select = (classification: ChangeRelevanceClassification) =>
      files.filter((file) => byPath.get(this.normalize(file.path))?.classification === classification);
    const businessFiles = select('BUSINESS_RELEVANT');
    const reviewFiles = select('NEEDS_REVIEW');
    const technicalFiles = select('TECHNICAL_VALIDATION');
    const ignoredFiles = select('IGNORED');

    return {
      analysisFiles: [...businessFiles, ...reviewFiles],
      ignoredFiles,
      technicalFiles,
      reviewFiles,
      technicalSuggestions: this.technicalSuggestions(technicalFiles),
      summary: {
        policyVersion: ChangeRelevancePolicy.VERSION,
        businessRelevant: businessFiles.length,
        technicalValidation: technicalFiles.length,
        ignored: ignoredFiles.length,
        needsReview: reviewFiles.length,
        decisions,
      },
    };
  }

  private classify(filePath: string): ChangeRelevanceDecision {
    const path = this.normalize(filePath);
    const decide = (
      classification: ChangeRelevanceClassification,
      rule: string,
      reason: string,
    ): ChangeRelevanceDecision => ({ filePath, classification, rule, reason });

    if (/(^|\/)(prompts?|knowledge|policies|runtime-templates?)\/.*\.md$/i.test(path)) {
      return decide('BUSINESS_RELEVANT', 'RUNTIME_MARKDOWN', '运行时 Prompt、知识或策略文档可能直接改变系统行为');
    }
    if (/\.mdx$/i.test(path)) {
      return decide('NEEDS_REVIEW', 'MDX_CONTENT', 'MDX 可能参与页面构建或运行时内容，需要保守分析');
    }
    if (/(^|\/)(database|migrations?|schema)(\/|\.|$)|\.sql$/i.test(path)) {
      return decide('BUSINESS_RELEVANT', 'DATA_CHANGE', '数据库结构、迁移或 SQL 可能改变业务数据与兼容性');
    }
    if (/(^|\/)(__tests__|tests?|specs?|storybook|stories|mocks?|fixtures?)(\/|$)|\.(spec|test|stories)\.[^.]+$/i.test(path)) {
      return decide('TECHNICAL_VALIDATION', 'TEST_ASSET', '测试与 Mock 变化不直接生成业务回归范围，但需要验证测试套件');
    }
    if (/(^|\/)(dist|build|coverage|\.cache|\.turbo|\.next|out|generated)(\/|$)|\.min\.(js|css)$/i.test(path)) {
      return decide('IGNORED', 'GENERATED_OUTPUT', '构建产物、覆盖率或生成文件不作为业务影响证据');
    }
    if (/(^|\/)(docs?|design|screenshots?|assets\/docs)(\/|$)|\.(md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/i.test(path)) {
      return decide('IGNORED', 'DOCUMENTATION', '普通文档与说明性资源不影响运行时业务行为');
    }
    if (/(^|\/)(\.vscode|\.idea)(\/|$)|(^|\/)(\.editorconfig|\.gitattributes|\.gitignore)$/i.test(path)) {
      return decide('IGNORED', 'DEVELOPER_TOOLING', '编辑器与版本控制辅助配置不影响运行时业务行为');
    }
    if (/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(path)) {
      return decide('TECHNICAL_VALIDATION', 'DEPENDENCY_CHANGE', '依赖或锁文件变化需要安装、构建和兼容性验证');
    }
    if (/(^|\/)(dockerfile|docker-compose[^/]*\.ya?ml|nginx[^/]*\.conf)|(^|\/)(\.github\/workflows|deploy|helm|k8s|scripts)(\/|$)/i.test(path)) {
      return decide('TECHNICAL_VALIDATION', 'DELIVERY_CHANGE', '构建、部署或流水线变化需要技术验证，不直接推断业务场景');
    }
    if (/(^|\/)(tsconfig[^/]*\.json|vite\.config\.[^/]+|nest-cli\.json|eslint[^/]*|prettier[^/]*|\.env[^/]*)$|\.(ya?ml|toml)$/i.test(path)) {
      return decide('TECHNICAL_VALIDATION', 'BUILD_CONFIG', '构建或运行配置变化需要启动和构建验证');
    }
    if (/\.(ts|tsx|js|jsx|vue|java|kt|go|py|rb|php|cs|rs|swift|dart|graphql|proto)$/i.test(path)) {
      return decide('BUSINESS_RELEVANT', 'RUNTIME_SOURCE', '运行时代码或接口契约进入完整影响分析');
    }
    return decide('NEEDS_REVIEW', 'UNKNOWN_FILE', '文件用途无法由确定性规则安全判断，保留进入分析');
  }

  private technicalSuggestions(files: ChangedFile[]): RegressionSuggestion[] {
    const groups = [
      {
        key: 'DEPENDENCY_CHANGE', title: '依赖安装与构建验证', priority: 'P1' as const,
        scenario: '依赖升级后的安装、编译与启动',
        checks: ['依赖能够无冲突安装', '生产构建成功且无新增告警', '应用启动及健康检查正常'],
      },
      {
        key: 'DELIVERY_CHANGE', title: '部署流水线验证', priority: 'P1' as const,
        scenario: '构建、部署与运行环境交付',
        checks: ['镜像或制品能够成功生成', '部署流程及环境变量装配正确', '部署后健康检查正常'],
      },
      {
        key: 'TEST_ASSET', title: '测试套件完整性验证', priority: 'P2' as const,
        scenario: '自动化测试与 Mock 资产',
        checks: ['受影响测试套件全部通过', 'Mock 与真实接口契约保持一致'],
      },
      {
        key: 'BUILD_CONFIG', title: '构建与启动配置验证', priority: 'P2' as const,
        scenario: '构建配置与运行参数',
        checks: ['类型检查和生产构建成功', '目标环境能够正常启动', '配置缺失时错误提示明确'],
      },
    ];
    const decisions = files.map((file) => this.classify(file.path));
    return groups.flatMap((group) => {
      const matched = decisions.filter((decision) => decision.rule === group.key);
      if (!matched.length) return [];
      const paths = matched.map((decision) => decision.filePath);
      return [{
        title: group.title,
        scope: `${paths.length} 个技术文件发生变化，需要完成${group.scenario}验证。`,
        priority: group.priority,
        targetType: 'CONFIG',
        impactRelation: 'DIRECT',
        coverageStatus: 'RECOMMENDED',
        businessDomain: '工程交付',
        businessScenario: group.scenario,
        boundaryType: 'TECHNICAL',
        technicalConfidence: 'HIGH',
        businessConfidence: 'HIGH',
        entryPoints: paths.slice(0, 12),
        scenarios: group.checks,
        expectedResults: group.checks,
        evidence: matched.map((decision) => `${decision.filePath}：${decision.reason}`),
        confidence: 'HIGH',
      } satisfies RegressionSuggestion];
    });
  }

  private normalize(path: string) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  }
}
