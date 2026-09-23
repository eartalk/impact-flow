import type {
  ChangedFile,
  ImpactModule,
  RegressionSuggestion,
  RiskLevel,
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';
import { BusinessImpactResolver } from './business-impact.resolver';

export interface ChangeImpactResult {
  riskLevel: RiskLevel;
  riskSummary: string;
  impactedModules: ImpactModule[];
  regressionSuggestions: RegressionSuggestion[];
}

export class ChangeImpactAnalyzer {
  private readonly business = new BusinessImpactResolver();

  analyze(input: {
    files: ChangedFile[];
    additions: number;
    deletions: number;
    symbolSummary?: string;
    symbolChanges?: SymbolChange[];
    symbolImpacts?: SymbolImpact[];
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

    const suggestions = this.buildRegressionScopes(input, riskLevel);

    return { riskLevel, riskSummary, impactedModules, regressionSuggestions: suggestions };
  }

  private buildRegressionScopes(input: {
    files: ChangedFile[];
    symbolSummary?: string;
    symbolChanges?: SymbolChange[];
    symbolImpacts?: SymbolImpact[];
  }, riskLevel: RiskLevel): RegressionSuggestion[] {
    const changes = input.symbolChanges ?? [];
    const impacts = input.symbolImpacts ?? [];
    const priority = riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'P0' : 'P1';
    const scopes = new Map<string, RegressionSuggestion>();
    const mappedFiles = new Set(changes.map((item) => this.normalizePath(item.filePath)));

    const coveredChangeKeys = new Set<string>();

    // 直接修改的 Controller、页面、任务和消息消费者本身就是业务入口。
    for (const change of changes.filter((item) => this.business.isBoundary(item))) {
      const semantics = this.business.resolve(change);
      const routes = this.routes(change);
      this.mergeScope(scopes, `${change.projectId ?? ''}:${semantics.groupKey}`, {
        title: semantics.scenario,
        scope: '',
        priority,
        targetType: this.scopeTargetType(semantics.boundaryType),
        impactRelation: 'DIRECT',
        coverageStatus: semantics.confidence === 'HIGH' ? 'CONFIRMED' : 'RECOMMENDED',
        businessDomain: semantics.domain,
        businessScenario: semantics.scenario,
        boundaryType: semantics.boundaryType,
        technicalConfidence: 'HIGH',
        businessConfidence: semantics.confidence,
        sourceSymbolKeys: [change.key],
        entryPoints: routes.length ? routes : [change.qualifiedName || change.name],
        evidence: [
          `${change.filePath}:${change.startLine} · ${this.changeLabel(change.changeType)} ${change.qualifiedName || change.name}`,
        ],
        confidence: 'HIGH',
      });
      coveredChangeKeys.add(change.key);
    }

    // 只把调用链上真正的业务边界提升为一级范围，中间 Service 保留在证据链中。
    for (const impact of impacts.filter((item) => this.business.isBoundary(item.impactedSymbol))) {
      const target = impact.impactedSymbol;
      const semantics = this.business.resolve(target);
      const routes = this.routes(target);
      const changed = changes.find((item) => item.key === impact.changedSymbolKey);
      const crossRepository = Boolean(
        changed?.projectId && target.projectId && changed.projectId !== target.projectId,
      );
      this.mergeScope(scopes, `${target.projectId ?? ''}:${semantics.groupKey}`, {
        title: semantics.scenario,
        scope: '',
        priority: impact.depth <= 2 ? priority : 'P1',
        targetType: this.scopeTargetType(semantics.boundaryType),
        impactRelation: crossRepository ? 'CROSS_REPOSITORY' : 'UPSTREAM',
        coverageStatus: semantics.confidence === 'HIGH' ? 'CONFIRMED' : 'RECOMMENDED',
        businessDomain: semantics.domain,
        businessScenario: semantics.scenario,
        boundaryType: semantics.boundaryType,
        technicalConfidence: 'HIGH',
        businessConfidence: semantics.confidence,
        sourceSymbolKeys: [impact.changedSymbolKey],
        entryPoints: routes.length ? routes : [target.qualifiedName || target.name],
        evidence: [impact.callChain.map((symbol) => symbol.qualifiedName || symbol.name).join(' → ')],
        confidence: 'HIGH',
      });
      coveredChangeKeys.add(impact.changedSymbolKey);
    }

    // 找不到业务边界时，按业务语义聚合最远端调用者，避免每个方法生成一张卡片。
    for (const change of changes.filter((item) => !coveredChangeKeys.has(item.key))) {
      const related = impacts.filter((item) => item.changedSymbolKey === change.key);
      const maxDepth = Math.max(0, ...related.map((item) => item.depth));
      const terminalImpacts = related.filter((item) => item.depth === maxDepth);
      const targets = terminalImpacts.length ? terminalImpacts : [{
        changedSymbolKey: change.key,
        impactedSymbol: change,
        depth: 0,
        callChain: [change],
        reason: change.reason,
      }];
      for (const impact of targets) {
        const target = impact.impactedSymbol;
        const semantics = this.business.resolve(target);
        const crossRepository = Boolean(
          change.projectId && target.projectId && change.projectId !== target.projectId,
        );
        this.mergeScope(scopes, `${target.projectId ?? ''}:technical:${semantics.groupKey}`, {
          title: semantics.scenario,
          scope: '',
          priority: 'P1',
          targetType: this.targetType(target.filePath, false),
          impactRelation: crossRepository ? 'CROSS_REPOSITORY' : impact.depth ? 'UPSTREAM' : 'DIRECT',
          coverageStatus: semantics.confidence === 'LOW' ? 'NEEDS_REVIEW' : 'RECOMMENDED',
          businessDomain: semantics.domain,
          businessScenario: semantics.scenario,
          boundaryType: 'TECHNICAL',
          technicalConfidence: impact.depth ? 'HIGH' : 'MEDIUM',
          businessConfidence: semantics.confidence === 'HIGH' ? 'MEDIUM' : semantics.confidence,
          sourceSymbolKeys: [change.key],
          entryPoints: [target.qualifiedName || target.name],
          evidence: [impact.callChain.map((symbol) => symbol.qualifiedName || symbol.name).join(' → ')],
          confidence: impact.depth ? 'HIGH' : 'MEDIUM',
        });
      }
      coveredChangeKeys.add(change.key);
    }

    for (const file of input.files) {
      if (mappedFiles.has(this.normalizePath(file.path))) continue;
      const semantics = this.business.resolveFile(file.path);
      this.mergeScope(scopes, semantics.groupKey, {
        title: semantics.scenario,
        scope: '',
        priority: file.changeType === 'D' ? priority : 'P2',
        targetType: this.targetType(file.path, false),
        impactRelation: 'UNKNOWN',
        coverageStatus: 'NEEDS_REVIEW',
        businessDomain: semantics.domain,
        businessScenario: semantics.scenario,
        boundaryType: 'UNKNOWN',
        technicalConfidence: 'LOW',
        businessConfidence: semantics.confidence === 'HIGH' ? 'MEDIUM' : semantics.confidence,
        entryPoints: [file.path],
        evidence: [`${this.changeLabel(file.changeType)} ${file.path}（+${file.additions}/-${file.deletions}）`],
        confidence: 'LOW',
      });
    }

    if (/未完成|分析范围受限/.test(input.symbolSummary ?? '')) {
      this.mergeScope(scopes, 'analysis-blind-spot', {
        title: '静态分析覆盖盲区',
        scope: '部分源码或相关仓库未能完整扫描，当前清单不能证明这些区域不受影响，需要人工补充确认。',
        priority,
        targetType: 'MODULE',
        impactRelation: 'UNKNOWN',
        coverageStatus: 'NEEDS_REVIEW',
        businessDomain: '分析盲区',
        businessScenario: '静态分析覆盖盲区',
        boundaryType: 'UNKNOWN',
        technicalConfidence: 'LOW',
        businessConfidence: 'LOW',
        evidence: [input.symbolSummary!],
        confidence: 'LOW',
      });
    }

    if (!scopes.size) {
      this.mergeScope(scopes, 'unresolved', {
        title: '未识别到可定位的回归范围',
        scope: input.symbolSummary ?? '当前变更缺少可用于建立影响关系的代码证据，请人工确认。',
        priority: 'P1',
        targetType: 'MODULE',
        impactRelation: 'UNKNOWN',
        coverageStatus: 'NEEDS_REVIEW',
        businessDomain: '待确认业务',
        businessScenario: '未识别到可定位的业务范围',
        boundaryType: 'UNKNOWN',
        technicalConfidence: 'LOW',
        businessConfidence: 'LOW',
        evidence: input.symbolSummary ? [input.symbolSummary] : [],
        confidence: 'LOW',
      });
    }

    return [...scopes.values()]
      .map((item) => ({ ...item, scope: item.scope || this.scopeSummary(item) }))
      .sort((a, b) =>
        this.coverageRank(a.coverageStatus) - this.coverageRank(b.coverageStatus) ||
        this.priorityRank(a.priority) - this.priorityRank(b.priority) ||
        (a.businessScenario ?? a.title).localeCompare(b.businessScenario ?? b.title),
      );
  }

  private mergeScope(
    scopes: Map<string, RegressionSuggestion>,
    key: string,
    incoming: RegressionSuggestion,
  ) {
    const existing = scopes.get(key);
    if (!existing) {
      scopes.set(key, incoming);
      return;
    }
    existing.priority = this.priorityRank(incoming.priority) < this.priorityRank(existing.priority)
      ? incoming.priority
      : existing.priority;
    existing.impactRelation = this.relationRank(incoming.impactRelation) > this.relationRank(existing.impactRelation)
      ? incoming.impactRelation
      : existing.impactRelation;
    existing.entryPoints = this.unique([...(existing.entryPoints ?? []), ...(incoming.entryPoints ?? [])]);
    existing.evidence = this.unique([...(existing.evidence ?? []), ...(incoming.evidence ?? [])]);
    existing.sourceSymbolKeys = this.unique([
      ...(existing.sourceSymbolKeys ?? []),
      ...(incoming.sourceSymbolKeys ?? []),
    ]);
  }

  private scopeSummary(item: RegressionSuggestion) {
    const count = item.sourceSymbolKeys?.length ?? 0;
    if (item.boundaryType === 'TECHNICAL') {
      return `调用关系已确认，但尚未追踪到 HTTP、页面、任务或消息边界；业务归属根据代码命名推断，覆盖 ${count || 1} 个变更 Symbol。`;
    }
    if (item.boundaryType === 'UNKNOWN') {
      return '当前证据无法定位明确业务入口，需要人工确认业务归属及是否纳入回归。';
    }
    return `已追踪到${this.boundaryLabel(item.boundaryType)}，由 ${count || 1} 个变更 Symbol 影响。`;
  }

  private routes(symbol: SymbolChange | SymbolImpact['impactedSymbol']) {
    return this.unique((symbol.httpRoutes ?? []).map((route) => `${route.method} ${route.path}`));
  }

  private httpRoutesMatch(
    left: { method: string; path: string },
    right: { method: string; path: string },
  ) {
    if (left.method !== 'ALL' && right.method !== 'ALL' && left.method !== right.method) return false;
    const parts = (path: string) => path.replace(/[?#].*$/, '').replace(/\{[^}]+\}/g, ':param').split('/').filter(Boolean);
    const a = parts(left.path);
    const b = parts(right.path);
    return a.length === b.length && a.every((part, index) => part.startsWith(':') || b[index]?.startsWith(':') || part === b[index]);
  }

  private scopeTargetType(boundary: NonNullable<RegressionSuggestion['boundaryType']>): NonNullable<RegressionSuggestion['targetType']> {
    const mapping: Partial<Record<typeof boundary, NonNullable<RegressionSuggestion['targetType']>>> = {
      HTTP: 'API', PAGE: 'PAGE', JOB: 'JOB', MESSAGE: 'JOB', DATA: 'DATA',
      TECHNICAL: 'SYMBOL', UNKNOWN: 'FILE',
    };
    return mapping[boundary] ?? 'MODULE';
  }

  private boundaryLabel(boundary?: RegressionSuggestion['boundaryType']) {
    const labels: Record<string, string> = {
      HTTP: '业务接口', PAGE: '业务页面', JOB: '后台任务', MESSAGE: '消息入口', DATA: '数据边界',
    };
    return labels[boundary ?? ''] ?? '业务边界';
  }

  private coverageRank(status?: RegressionSuggestion['coverageStatus']) {
    return status === 'CONFIRMED' ? 0 : status === 'RECOMMENDED' ? 1 : 2;
  }

  private priorityRank(priority: RegressionSuggestion['priority']) {
    return priority === 'P0' ? 0 : priority === 'P1' ? 1 : 2;
  }

  private relationRank(relation?: RegressionSuggestion['impactRelation']) {
    return relation === 'CROSS_REPOSITORY' ? 3 : relation === 'UPSTREAM' ? 2 : relation === 'DIRECT' ? 1 : 0;
  }

  private unique(items: string[]) {
    return [...new Set(items.filter(Boolean))];
  }

  private normalizePath(path: string) {
    return path.replace(/\\/g, '/').toLowerCase();
  }

  private targetType(path: string, hasRoute: boolean): NonNullable<RegressionSuggestion['targetType']> {
    const normalized = path.toLowerCase();
    if (hasRoute || /(controller|router|routes?|openapi|graphql)/.test(normalized)) return 'API';
    if (/\.(vue|tsx|jsx)$/.test(normalized) || /(pages?|screens?|views?)[/\\]/.test(normalized)) return 'PAGE';
    if (/(jobs?|workers?|queues?|cron)/.test(normalized)) return 'JOB';
    if (/(database|migrations?|schema)/.test(normalized)) return 'DATA';
    if (/(package\.json|lock|dockerfile|\.ya?ml$|\.toml$|config)/.test(normalized)) return 'CONFIG';
    if (/\.(ts|js)$/.test(normalized)) return 'SYMBOL';
    return 'FILE';
  }

  private changeLabel(changeType: ChangedFile['changeType'] | SymbolChange['changeType']) {
    const labels: Record<string, string> = {
      A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制', T: '类型变化', U: '未合并',
      ADDED: '新增', MODIFIED: '修改', DELETED: '删除',
    };
    return labels[changeType] ?? changeType;
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
