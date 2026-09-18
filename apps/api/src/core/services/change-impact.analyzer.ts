import type {
  ChangedFile,
  ImpactModule,
  RegressionSuggestion,
  RiskLevel,
} from '@impact-flow/contracts';

export interface ChangeImpactResult {
  riskLevel: RiskLevel;
  riskSummary: string;
  impactedModules: ImpactModule[];
  regressionSuggestions: RegressionSuggestion[];
}

export class ChangeImpactAnalyzer {
  analyze(input: {
    files: ChangedFile[];
    additions: number;
    deletions: number;
  }): ChangeImpactResult {
    const paths = input.files.map((file) => file.path.toLowerCase());
    const changedLines = input.additions + input.deletions;
    const hasDatabaseChange = paths.some((path) =>
      /(^|\/)(database|migrations?|schema)(\/|\.|$)/.test(path),
    );
    const hasSensitiveChange = paths.some((path) =>
      /(auth|permission|security|payment|billing|token|credential)/.test(path),
    );
    const hasApiChange = paths.some((path) =>
      /(controller|router|routes?|dto|contracts?|openapi|graphql)/.test(path),
    );
    const hasUiChange = paths.some((path) =>
      /(apps\/web|frontend|\.(vue|tsx?|jsx?|css|scss|less)$)/.test(path),
    );
    const hasConfigChange = paths.some((path) =>
      /(^|\/)(package\.json|.*lock.*|dockerfile|.*\.ya?ml|.*\.toml|config.*)(\/|$)/.test(path),
    );
    const deletedFiles = input.files.filter((file) => file.changeType === 'D').length;

    let score = 0;
    if (input.files.length >= 15) score += 3;
    else if (input.files.length >= 7) score += 2;
    else if (input.files.length >= 3) score += 1;
    if (changedLines >= 500) score += 3;
    else if (changedLines >= 150) score += 2;
    else if (changedLines >= 50) score += 1;
    if (hasDatabaseChange) score += 3;
    if (hasSensitiveChange) score += 4;
    if (hasApiChange) score += 2;
    if (hasConfigChange) score += 1;
    if (deletedFiles > 0) score += Math.min(deletedFiles, 2);

    const riskLevel: RiskLevel =
      score >= 8 ? 'CRITICAL' : score >= 5 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';
    const impactedModules = this.buildModules(input.files);
    const highlights = [
      hasSensitiveChange ? '涉及鉴权、权限或资金等敏感代码' : null,
      hasDatabaseChange ? '包含数据库结构或迁移变更' : null,
      hasApiChange ? '包含接口契约或路由变更' : null,
      deletedFiles ? `删除 ${deletedFiles} 个文件` : null,
    ].filter(Boolean);
    const riskSummary = `${input.files.length} 个文件发生变更，共 ${changedLines} 行调整，影响 ${impactedModules.length} 个模块${
      highlights.length ? `；${highlights.join('；')}` : ''
    }。`;

    const suggestions: RegressionSuggestion[] = [
      {
        title: '核心业务链路回归',
        scope: `覆盖 ${impactedModules.slice(0, 3).map((item) => item.name).join('、') || '本次变更模块'} 的正常、异常和边界场景。`,
        priority: riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'P0' : 'P1',
      },
    ];
    if (hasDatabaseChange) {
      suggestions.push({
        title: '数据库升级与回滚验证',
        scope: '验证迁移脚本在存量数据上的兼容性、幂等性、锁表影响及回滚路径。',
        priority: 'P0',
      });
    }
    if (hasApiChange) {
      suggestions.push({
        title: '接口兼容性回归',
        scope: '核对请求参数、响应结构、错误码和旧客户端兼容性。',
        priority: 'P1',
      });
    }
    if (hasUiChange) {
      suggestions.push({
        title: '关键页面交互回归',
        scope: '覆盖主要操作路径、加载与失败状态，并检查常用分辨率下的布局。',
        priority: 'P1',
      });
    }
    if (hasConfigChange) {
      suggestions.push({
        title: '部署与启动验证',
        scope: '在目标环境验证依赖安装、配置加载、服务启动和健康检查。',
        priority: 'P1',
      });
    }
    if (suggestions.length < 3) {
      suggestions.push({
        title: '变更文件定向验证',
        scope: '逐项验证新增、修改和删除文件对应的功能，并检查相关日志与监控。',
        priority: 'P2',
      });
    }

    return { riskLevel, riskSummary, impactedModules, regressionSuggestions: suggestions };
  }

  private buildModules(files: ChangedFile[]): ImpactModule[] {
    const groups = new Map<string, ChangedFile[]>();
    for (const file of files) {
      const name = this.moduleName(file.path);
      groups.set(name, [...(groups.get(name) ?? []), file]);
    }
    return [...groups.entries()]
      .map(([name, moduleFiles]) => {
        const sensitive = moduleFiles.some((file) =>
          /(auth|permission|security|payment|database|migration|schema)/i.test(file.path),
        );
        const deleted = moduleFiles.filter((file) => file.changeType === 'D').length;
        const fileCount = moduleFiles.length;
        const riskLevel: RiskLevel = sensitive
          ? 'HIGH'
          : deleted || fileCount >= 6
            ? 'MEDIUM'
            : 'LOW';
        return {
          name,
          fileCount,
          riskLevel,
          reason: `${fileCount} 个文件变更${deleted ? `，其中删除 ${deleted} 个` : ''}`,
        };
      })
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 8);
  }

  private moduleName(path: string) {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts[0] === 'apps' && parts[1]) return `应用 · ${parts[1]}`;
    if (parts[0] === 'packages' && parts[1]) return `共享包 · ${parts[1]}`;
    if (parts[0] === 'database' || parts[0] === 'migrations') return '数据库';
    const moduleIndex = parts.indexOf('modules');
    if (moduleIndex >= 0 && parts[moduleIndex + 1]) {
      return `模块 · ${parts[moduleIndex + 1]}`;
    }
    return parts[0] || '根目录';
  }
}
