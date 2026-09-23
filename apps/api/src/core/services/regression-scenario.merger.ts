import type { RegressionSuggestion } from '@impact-flow/contracts';

/**
 * 将不同技术路径归并为稳定的业务场景。
 * 业务边界是聚合根；Service、DAO、Entity 等技术候选只能补充边界证据。
 */
export class RegressionScenarioMerger {
  merge(items: RegressionSuggestion[]) {
    const exact = this.mergeExactCandidates(items);
    const scenarioGroups = new Map<string, RegressionSuggestion[]>();
    const standalone: RegressionSuggestion[] = [];

    for (const item of exact) {
      const key = this.scenarioKey(item);
      if (!key) {
        standalone.push(item);
        continue;
      }
      scenarioGroups.set(key, [...(scenarioGroups.get(key) ?? []), item]);
    }

    for (const group of scenarioGroups.values()) {
      const boundaries = group.filter((item) => this.isBusinessBoundary(item));
      if (!boundaries.length) {
        standalone.push(...group);
        continue;
      }

      const boundary = boundaries.reduce((merged, item) => this.combine(merged, item));
      const remaining = group.filter((item) => !boundaries.includes(item));
      const relatedEvidence = remaining.filter((item) => this.canAttachToBoundary(item, boundaries));
      const unrelated = remaining.filter((item) => !relatedEvidence.includes(item));
      const enriched = relatedEvidence.reduce(
        (merged, item) => this.attachSupportingEvidence(merged, item),
        boundary,
      );
      standalone.push(enriched, ...unrelated);
    }

    return standalone;
  }

  private mergeExactCandidates(items: RegressionSuggestion[]) {
    const merged = new Map<string, RegressionSuggestion>();
    for (const item of items) {
      const key = this.exactKey(item);
      const previous = merged.get(key);
      merged.set(key, previous ? this.combine(previous, item) : { ...item });
    }
    return [...merged.values()];
  }

  private combine(left: RegressionSuggestion, right: RegressionSuggestion): RegressionSuggestion {
    const representative = this.representative(left, right);
    const other = representative === left ? right : left;
    return {
      ...other,
      ...representative,
      priority: this.priorityRank(left.priority) <= this.priorityRank(right.priority)
        ? left.priority
        : right.priority,
      impactRelation: this.relationRank(left.impactRelation) >= this.relationRank(right.impactRelation)
        ? left.impactRelation
        : right.impactRelation,
      coverageStatus: this.coverageRank(left.coverageStatus) >= this.coverageRank(right.coverageStatus)
        ? left.coverageStatus
        : right.coverageStatus,
      confidence: this.strongerConfidence(left.confidence, right.confidence),
      technicalConfidence: this.strongerConfidence(left.technicalConfidence, right.technicalConfidence),
      businessConfidence: this.strongerConfidence(left.businessConfidence, right.businessConfidence),
      entryPoints: this.unique([...(left.entryPoints ?? []), ...(right.entryPoints ?? [])]),
      evidence: this.unique([...(left.evidence ?? []), ...(right.evidence ?? [])]),
      sourceSymbolKeys: this.unique([...(left.sourceSymbolKeys ?? []), ...(right.sourceSymbolKeys ?? [])]),
      traceSymbolKeys: this.unique([...(left.traceSymbolKeys ?? []), ...(right.traceSymbolKeys ?? [])]),
      scenarios: this.unique([...(left.scenarios ?? []), ...(right.scenarios ?? [])]),
      steps: this.unique([...(left.steps ?? []), ...(right.steps ?? [])]),
      expectedResults: this.unique([...(left.expectedResults ?? []), ...(right.expectedResults ?? [])]),
    };
  }

  private attachSupportingEvidence(boundary: RegressionSuggestion, supporting: RegressionSuggestion) {
    const evidenceLabel = supporting.boundaryType === 'UNKNOWN' ? '未映射文件' : '内部调用';
    const supportingEntries = (supporting.entryPoints ?? []).map((entry) =>
      supporting.boundaryType === 'UNKNOWN'
        ? `${evidenceLabel}：${entry}（按同一业务场景归并，调用关系待确认）`
        : `${evidenceLabel}：${entry}`,
    );
    return {
      ...this.combine(boundary, {
        ...supporting,
        // 内部 Symbol 和未映射源码是传播证据，不是用户需要执行回归的业务入口。
        entryPoints: [],
        evidence: this.unique([...(supporting.evidence ?? []), ...supportingEntries]),
      }),
      title: boundary.title,
      targetType: boundary.targetType,
      boundaryType: boundary.boundaryType,
      businessDomain: boundary.businessDomain,
      businessScenario: boundary.businessScenario,
      entryPoints: boundary.entryPoints,
      coverageStatus: boundary.coverageStatus,
    } satisfies RegressionSuggestion;
  }

  private canAttachToBoundary(item: RegressionSuggestion, boundaries: RegressionSuggestion[]) {
    if (this.confidenceRank(item.businessConfidence) < 2) return false;
    if (item.boundaryType === 'TECHNICAL') {
      if (boundaries.some((boundary) => this.hasCallRelation(item, boundary))) return true;
      // 精确的业务域 + 场景身份且只有一个边界聚合根时，可安全吸收没有完整图关系的技术候选。
      return boundaries.length === 1;
    }
    if (item.boundaryType === 'UNKNOWN' && item.coverageStatus === 'NEEDS_REVIEW') {
      // 文件级兜底候选只有在唯一业务边界下才吸收；其不确定性作为证据显式保留。
      return boundaries.length === 1 &&
        Boolean(item.entryPoints?.length) &&
        item.entryPoints!.every((entry) => this.isSourceFile(entry));
    }
    return false;
  }

  private isSourceFile(value: string) {
    const normalized = value.replace(/\\/g, '/');
    return /(^|\/)[^/]+\.(ts|tsx|js|jsx|vue|java|kt|go|py|rb|php|cs|rs|swift|dart|graphql|proto)$/i.test(normalized);
  }

  private hasCallRelation(left: RegressionSuggestion, right: RegressionSuggestion) {
    const leftKeys = new Set([...(left.sourceSymbolKeys ?? []), ...(left.traceSymbolKeys ?? [])]);
    const rightKeys = new Set([...(right.sourceSymbolKeys ?? []), ...(right.traceSymbolKeys ?? [])]);
    return [...leftKeys].some((key) => rightKeys.has(key));
  }

  private isBusinessBoundary(item: RegressionSuggestion) {
    return ['HTTP', 'PAGE', 'JOB', 'MESSAGE', 'DATA'].includes(item.boundaryType ?? '') &&
      item.coverageStatus !== 'NEEDS_REVIEW';
  }

  private scenarioKey(item: RegressionSuggestion) {
    if (!item.businessDomain || !item.businessScenario || item.businessConfidence === 'LOW') return null;
    return `${this.normalize(item.businessDomain)}|${this.normalize(item.businessScenario)}`;
  }

  private exactKey(item: RegressionSuggestion) {
    const entries = [...(item.entryPoints ?? [])].map((value) => this.normalize(value)).sort();
    return entries.length
      ? `${item.targetType ?? ''}|${entries.join('|')}`
      : `${item.targetType ?? ''}|${this.normalize(item.businessScenario ?? item.title)}`;
  }

  private representative(left: RegressionSuggestion, right: RegressionSuggestion) {
    const rank = (item: RegressionSuggestion) =>
      this.boundaryRank(item.boundaryType) * 1000 +
      this.coverageRank(item.coverageStatus) * 100 +
      this.confidenceRank(item.businessConfidence ?? item.confidence) * 10 +
      this.richness(item);
    return rank(left) >= rank(right) ? left : right;
  }

  private boundaryRank(value?: RegressionSuggestion['boundaryType']) {
    if (value === 'PAGE') return 6;
    if (value === 'HTTP') return 5;
    if (['JOB', 'MESSAGE'].includes(value ?? '')) return 4;
    if (value === 'DATA') return 3;
    if (value === 'TECHNICAL') return 2;
    return 1;
  }

  private coverageRank(value?: RegressionSuggestion['coverageStatus']) {
    return value === 'CONFIRMED' ? 3 : value === 'RECOMMENDED' ? 2 : 1;
  }

  private relationRank(value?: RegressionSuggestion['impactRelation']) {
    return value === 'CROSS_REPOSITORY' ? 4 : value === 'UPSTREAM' ? 3 : value === 'DIRECT' ? 2 : value === 'RELATED' ? 1 : 0;
  }

  private priorityRank(value: RegressionSuggestion['priority']) {
    return value === 'P0' ? 0 : value === 'P1' ? 1 : 2;
  }

  private confidenceRank(value?: RegressionSuggestion['confidence']) {
    return value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1;
  }

  private strongerConfidence<T extends RegressionSuggestion['confidence']>(left?: T, right?: T) {
    return this.confidenceRank(left) >= this.confidenceRank(right) ? left : right;
  }

  private richness(item: RegressionSuggestion) {
    return (item.scope?.length ?? 0) + (item.scenarios?.length ?? 0) * 20 +
      (item.expectedResults?.length ?? 0) * 20 + (item.evidence?.length ?? 0) * 10;
  }

  private normalize(value: string) {
    return value.toLowerCase().replace(/[\s_\-:/\\]+/g, '');
  }

  private unique(items: string[]) {
    return [...new Set(items.filter(Boolean))];
  }
}
