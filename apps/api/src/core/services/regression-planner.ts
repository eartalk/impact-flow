import type {
  AiAnalysisResult,
  ChangeKind,
  ChangeUnit,
  RegressionPlan,
  RegressionSuggestion,
  RegressionTarget,
  RiskLevel,
} from '@impact-flow/contracts';

type Priority = RegressionSuggestion['priority'];

/** 回归清单是唯一最终产物；候选来源不能直接决定最终优先级和表述。 */
export class RegressionPlanner {
  plan(input: {
    summary: string;
    riskLevel: RiskLevel;
    changeUnits: ChangeUnit[];
    ruleSuggestions: RegressionSuggestion[];
    aiAnalysis?: AiAnalysisResult | null;
  }): RegressionPlan {
    const candidates = this.mergeCandidates([
      ...input.ruleSuggestions,
      ...(input.aiAnalysis?.status === 'SUCCESS'
        ? input.aiAnalysis.regressionSuggestions
        : []),
    ]);
    const targets = candidates
      .map((candidate, index) => this.toTarget(candidate, input.changeUnits, index))
      .sort((left, right) =>
        this.priorityRank(left.priority) - this.priorityRank(right.priority) ||
        this.confidenceRank(right.confidence) - this.confidenceRank(left.confidence) ||
        left.title.localeCompare(right.title),
      )
      .slice(0, 20);
    const uncovered = input.changeUnits.filter((unit) =>
      !targets.some((target) => target.sourceSymbolKeys?.includes(unit.symbolKey ?? '')),
    );
    const unknowns = [
      ...targets
        .filter((target) => target.coverageStatus === 'NEEDS_REVIEW' || target.confidence === 'LOW')
        .map((target) => `${target.title}：证据不足，需要人工确认业务入口`),
      ...uncovered.map((unit) => `${unit.title}：尚未追踪到可靠业务边界`),
    ].slice(0, 20);

    return {
      version: 2,
      summary: input.aiAnalysis?.status === 'SUCCESS' && input.aiAnalysis.summary
        ? input.aiAnalysis.summary
        : input.summary,
      riskLevel: this.calibratePlanRisk(input.riskLevel, targets),
      targets,
      unknowns: [...new Set(unknowns)],
      generatedBy: input.aiAnalysis?.status === 'SUCCESS' ? 'STATIC_AND_AI' : 'STATIC',
      model: input.aiAnalysis?.status === 'SUCCESS' ? input.aiAnalysis.model : null,
      generatedAt: new Date().toISOString(),
    };
  }

  /** 同一入口的静态候选与 AI 候选要合并证据，而不是用其中一个覆盖另一个。 */
  private mergeCandidates(items: RegressionSuggestion[]) {
    const merged = new Map<string, RegressionSuggestion>();
    for (const item of items) {
      const key = this.candidateKey(item);
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, { ...item });
        continue;
      }
      const richer = this.richness(item) > this.richness(previous) ? item : previous;
      merged.set(key, {
        ...previous,
        ...richer,
        entryPoints: this.unique([...(previous.entryPoints ?? []), ...(item.entryPoints ?? [])]),
        evidence: this.unique([...(previous.evidence ?? []), ...(item.evidence ?? [])]),
        sourceSymbolKeys: this.unique([...(previous.sourceSymbolKeys ?? []), ...(item.sourceSymbolKeys ?? [])]),
        scenarios: this.unique([...(previous.scenarios ?? []), ...(item.scenarios ?? [])]),
        steps: this.unique([...(previous.steps ?? []), ...(item.steps ?? [])]),
        expectedResults: this.unique([...(previous.expectedResults ?? []), ...(item.expectedResults ?? [])]),
        confidence: this.confidenceRank(previous.confidence) >= this.confidenceRank(item.confidence)
          ? previous.confidence
          : item.confidence,
        technicalConfidence: this.strongerConfidence(previous.technicalConfidence, item.technicalConfidence),
        businessConfidence: this.strongerConfidence(previous.businessConfidence, item.businessConfidence),
        coverageStatus: this.strongerCoverage(previous.coverageStatus, item.coverageStatus),
      });
    }
    return [...merged.values()];
  }

  private toTarget(item: RegressionSuggestion, allUnits: ChangeUnit[], index: number): RegressionTarget {
    const units = this.relatedUnits(item, allUnits);
    const priority = this.calibratePriority(item, units);
    const causalChain = this.buildCausalChain(item, units);
    const verificationPoints = this.verificationPoints(item, units);
    const evidence = this.unique([
      ...(item.evidence ?? []),
      ...units.flatMap((unit) => unit.evidence),
    ]).slice(0, 16);
    const automatedTestRecommendations = this.automatedTestRecommendations(
      item,
      verificationPoints,
    );
    return {
      ...item,
      priority,
      id: `target:${index + 1}:${this.slug(item.title)}`,
      causalChain,
      reason: causalChain.join('；'),
      verificationPoints,
      relatedTests: evidence.filter((value) =>
        /(^|\/|\\)(test|tests|__tests__|specs?)\b|\.(spec|test)\./i.test(value),
      ),
      automatedTestRecommendations,
      evidence,
    };
  }

  private automatedTestRecommendations(
    item: RegressionSuggestion,
    checks: string[],
  ) {
    const apiEntries = this.unique(item.entryPoints ?? []).filter((entry) =>
      /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i.test(entry.trim()),
    );
    if (!apiEntries.length) return [];
    const scenario = item.businessScenario || item.title;
    return [{
      id: `api:${this.slug(apiEntries.join('-'))}`,
      title: `${scenario}接口自动化回归`,
      kind: 'API' as const,
      entryPoints: apiEntries,
      reason: `这些接口是“${scenario}”的已确认业务入口，建议在发布前执行对应接口自动化测试。`,
      checks: checks.slice(0, 6),
      confidence: item.technicalConfidence ?? item.confidence ?? 'MEDIUM',
    }];
  }

  private relatedUnits(item: RegressionSuggestion, units: ChangeUnit[]) {
    const keys = new Set(item.sourceSymbolKeys ?? []);
    const evidence = (item.evidence ?? []).join(' ').toLowerCase();
    const exact = units.filter((unit) =>
      (unit.symbolKey && keys.has(unit.symbolKey)) ||
      evidence.includes(unit.filePath.toLowerCase()) ||
      evidence.includes(unit.title.toLowerCase()),
    );
    return exact.length ? exact : [];
  }

  private buildCausalChain(item: RegressionSuggestion, units: ChangeUnit[]) {
    const scenario = item.businessScenario || item.title;
    const themes = this.changeThemes(units);
    const relation = item.impactRelation === 'CROSS_REPOSITORY'
      ? '跨仓库调用链传播到'
      : item.impactRelation === 'UPSTREAM'
        ? '沿上游调用链传播到'
        : item.impactRelation === 'DIRECT'
          ? '直接作用于'
          : '可能关联到';
    const entry = item.entryPoints?.length
      ? item.entryPoints.slice(0, 3).join('、')
      : scenario;
    return [
      `变更：${themes.length ? themes.join('、') : '相关实现或接口契约发生变化'}`,
      `传播：${relation}${entry}`,
      `业务影响：${this.businessOutcome(item, themes)}`,
    ];
  }

  private changeThemes(units: ChangeUnit[]) {
    const text = units.map((unit) => `${unit.title} ${unit.summary} ${unit.filePath}`).join(' ').toLowerCase();
    const themes: string[] = [];
    if (/(approval|approve|审批)/.test(text)) themes.push('审批流程与结果处理');
    if (/(acceptance|验收)/.test(text)) themes.push('验收流程');
    if (/(status|state|状态)/.test(text)) themes.push('状态流转');
    if (/(transaction|事务)/.test(text)) themes.push('事务一致性');
    if (/(permission|auth|权限|鉴权)/.test(text)) themes.push('权限校验');
    if (/(valid|check|校验)/.test(text)) themes.push('业务校验');
    if (/(repository|entity|schema|migration|database|数据)/.test(text)) themes.push('数据读写');
    if (!themes.length) {
      const labels: Record<ChangeKind, string> = {
        BEHAVIOR: '业务处理逻辑', CONTRACT: '接口契约', VALIDATION: '业务校验',
        DATA: '数据读写', CONFIG: '运行配置', REFACTOR: '内部代码结构', UNKNOWN: '相关实现',
      };
      themes.push(...this.unique(units.map((unit) => labels[unit.changeKind])));
    }
    return this.unique(themes).slice(0, 4);
  }

  private businessOutcome(item: RegressionSuggestion, themes: string[]) {
    const value = `${item.businessScenario ?? ''} ${item.title} ${(item.entryPoints ?? []).join(' ')}`.toLowerCase();
    if (/(query|list|search|get|查询|列表|详情)/.test(value)) {
      return `${item.businessScenario || item.title}的查询结果、可见状态与最新业务数据可能不一致`;
    }
    if (/(revoke|cancel|撤销|取消)/.test(value)) {
      return `${item.businessScenario || item.title}的状态恢复、关联数据和重复操作处理可能发生变化`;
    }
    if (/(create|add|submit|新增|创建|提交)/.test(value)) {
      return `${item.businessScenario || item.title}的创建结果、初始状态及后续流程衔接可能发生变化`;
    }
    if (/(delete|remove|删除)/.test(value)) {
      return `${item.businessScenario || item.title}的删除约束、关联数据和不可恢复边界可能发生变化`;
    }
    if (/(approve|approval|审批|审核|回调)/.test(value) || themes.includes('审批流程与结果处理')) {
      return `${item.businessScenario || item.title}的通过、拒绝、重复处理及状态回写可能发生变化`;
    }
    return `${item.businessScenario || item.title}的主流程、状态和数据一致性可能受到影响`;
  }

  private verificationPoints(item: RegressionSuggestion, units: ChangeUnit[]) {
    const provided = [
      ...(item.scenarios ?? []),
      ...(item.steps ?? []),
      ...(item.expectedResults ?? []),
    ].filter((value) => value && !/^验证入口.+主流程与关键异常分支$/.test(value));
    const scenario = item.businessScenario || item.title;
    const value = `${scenario} ${(item.entryPoints ?? []).join(' ')}`.toLowerCase();
    const generated: string[] = [];
    if (/(query|list|search|get|查询|列表|详情)/.test(value)) {
      generated.push(`${scenario}返回结果与当前业务数据、审批状态保持一致`);
      generated.push(`相关状态变化后再次查询，结果能够反映最新状态且无重复或遗漏`);
    } else if (/(revoke|cancel|撤销|取消)/.test(value)) {
      generated.push(`${scenario}成功后业务状态、关联记录和可执行操作同步恢复`);
      generated.push(`重复撤销或不允许撤销的状态被明确拒绝，不产生二次数据变更`);
    } else if (/(create|add|submit|新增|创建|提交)/.test(value)) {
      generated.push(`${scenario}成功后主记录、初始状态及后续流程数据保持一致`);
      generated.push(`无效或重复请求被正确拒绝，不留下不完整业务数据`);
    } else if (/(approve|approval|审批|审核|回调)/.test(value)) {
      generated.push(`${scenario}通过与拒绝后，业务状态、审批记录和回写数据保持一致`);
      generated.push(`重复处理同一审批结果时保持幂等，不重复更新或生成记录`);
    } else {
      generated.push(`${scenario}主流程的业务结果与变更前预期保持一致`);
      generated.push(`${scenario}失败时不产生部分成功或状态不一致`);
    }
    const kinds = new Set(units.map((unit) => unit.changeKind));
    if (kinds.has('CONTRACT')) generated.push('请求参数、返回结构和既有调用方保持兼容');
    if (kinds.has('VALIDATION')) generated.push('合法输入正常通过，非法输入在写入数据前被明确拒绝');
    if (kinds.has('DATA')) generated.push('成功路径完整落库；失败路径回滚，不产生孤立或脏数据');
    if (this.changeThemes(units).includes('事务一致性')) generated.push('中途异常时事务完整回滚，重试后结果唯一且一致');
    return this.unique([...provided, ...generated]).slice(0, 8);
  }

  private calibratePriority(item: RegressionSuggestion, units: ChangeUnit[]): Priority {
    const confidence = item.businessConfidence ?? item.confidence;
    if (item.coverageStatus === 'NEEDS_REVIEW' || confidence === 'LOW' ||
        ['TECHNICAL', 'UNKNOWN'].includes(item.boundaryType ?? '')) return 'P2';
    const target = `${item.businessScenario ?? ''} ${item.title} ${(item.entryPoints ?? []).join(' ')}`.toLowerCase();
    const criticalAction = /(payment|billing|permission|auth|approve.?result|callback|migration|支付|计费|权限|鉴权|审批结果|状态回写|回调|数据迁移)/.test(target);
    const highEvidence = units.some((unit) =>
      ['HIGH', 'CRITICAL'].includes(unit.riskLevel) || ['DATA', 'VALIDATION'].includes(unit.changeKind),
    );
    if (criticalAction && highEvidence) return 'P0';
    if (units.length && units.every((unit) => unit.changeKind === 'REFACTOR' && unit.riskLevel === 'LOW')) return 'P2';
    return 'P1';
  }

  private calibratePlanRisk(original: RiskLevel, targets: RegressionTarget[]): RiskLevel {
    const p0 = targets.filter((target) => target.priority === 'P0').length;
    const p1 = targets.filter((target) => target.priority === 'P1').length;
    if (p0 >= 2) return 'CRITICAL';
    if (p0 === 1) return 'HIGH';
    if (p1 && ['CRITICAL', 'HIGH'].includes(original)) return 'HIGH';
    if (p1) return 'MEDIUM';
    return original === 'LOW' ? 'LOW' : 'MEDIUM';
  }

  private candidateKey(item: RegressionSuggestion) {
    const entries = [...(item.entryPoints ?? [])].map((value) => value.toLowerCase()).sort();
    return entries.length
      ? `${item.targetType ?? ''}|${entries.join('|')}`
      : `${item.targetType ?? ''}|${item.businessScenario ?? item.title}`.toLowerCase();
  }

  private richness(item: RegressionSuggestion) {
    return (item.scope?.length ?? 0) + (item.scenarios?.length ?? 0) * 20 +
      (item.expectedResults?.length ?? 0) * 20 + (item.evidence?.length ?? 0) * 10;
  }

  private priorityRank(value: Priority) { return value === 'P0' ? 0 : value === 'P1' ? 1 : 2; }
  private confidenceRank(value?: RegressionSuggestion['confidence']) { return value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1; }
  private strongerConfidence(
    left?: RegressionSuggestion['technicalConfidence'],
    right?: RegressionSuggestion['technicalConfidence'],
  ) {
    return this.confidenceRank(left) >= this.confidenceRank(right) ? left : right;
  }
  private strongerCoverage(
    left?: RegressionSuggestion['coverageStatus'],
    right?: RegressionSuggestion['coverageStatus'],
  ) {
    const rank = (value?: RegressionSuggestion['coverageStatus']) =>
      value === 'CONFIRMED' ? 3 : value === 'RECOMMENDED' ? 2 : 1;
    return rank(left) >= rank(right) ? left : right;
  }
  private unique(items: string[]) { return [...new Set(items.filter(Boolean))]; }
  private slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  }
}
