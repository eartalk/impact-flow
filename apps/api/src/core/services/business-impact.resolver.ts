import type {
  CodeSymbolReference,
  RegressionSuggestion,
} from '@impact-flow/contracts';

export interface BusinessSemantics {
  domain: string;
  scenario: string;
  boundaryType: NonNullable<RegressionSuggestion['boundaryType']>;
  confidence: NonNullable<RegressionSuggestion['businessConfidence']>;
  groupKey: string;
}

/**
 * 将技术边界转换成稳定、可聚合的业务语言。
 * 这里只使用代码中可验证的路由、路径和命名，不依赖基础设施或模型推断。
 */
export class BusinessImpactResolver {
  isBoundary(symbol: CodeSymbolReference) {
    return this.boundaryType(symbol) !== 'TECHNICAL';
  }

  resolve(symbol: CodeSymbolReference): BusinessSemantics {
    const boundaryType = this.boundaryType(symbol);
    const serverRoute = symbol.httpRoutes?.find((route) => route.role === 'SERVER');
    const source = [
      serverRoute?.path,
      symbol.qualifiedName,
      symbol.name,
      symbol.filePath,
    ].filter(Boolean).join(' ');
    const tokens = this.tokens(source);
    const domain = this.domain(tokens);
    const action = this.action(tokens);
    const subject = this.subject(tokens, boundaryType);
    const scenario = this.scenario(domain.label, action, subject, boundaryType);
    const confidence: BusinessSemantics['confidence'] = domain.known
      ? serverRoute || boundaryType === 'PAGE' ? 'HIGH' : 'MEDIUM'
      : 'LOW';
    const routeKey = serverRoute
      ? `${serverRoute.method}:${this.normalizeRoute(serverRoute.path)}`
      : null;
    return {
      domain: domain.label,
      scenario,
      boundaryType,
      confidence,
      // 已识别业务域时按业务场景聚合，具体路由保留在 entryPoints；
      // 未识别业务域时保留路由维度，避免把无关入口误合并。
      groupKey: domain.known
        ? `${domain.key}:${action}:${subject}:${boundaryType}`
        : routeKey ?? `${domain.key}:${action}:${subject}:${boundaryType}`,
    };
  }

  resolveFile(path: string): BusinessSemantics {
    const symbol: CodeSymbolReference = {
      key: path,
      name: path.split(/[/\\]/).pop() ?? path,
      qualifiedName: path,
      kind: 'TYPE',
      filePath: path,
      startLine: 1,
      endLine: 1,
    };
    const resolved = this.resolve(symbol);
    return {
      ...resolved,
      boundaryType: resolved.boundaryType === 'TECHNICAL' ? 'UNKNOWN' : resolved.boundaryType,
      groupKey: `file:${resolved.groupKey}`,
    };
  }

  private boundaryType(symbol: CodeSymbolReference): BusinessSemantics['boundaryType'] {
    const path = symbol.filePath.toLowerCase().replace(/\\/g, '/');
    const name = `${symbol.qualifiedName} ${symbol.name}`.toLowerCase();
    if (symbol.httpRoutes?.some((route) => route.role === 'SERVER')) return 'HTTP';
    if (
      /(^|\/)(pages?|screens?|views?)(\/|$)/.test(path) ||
      (/\.(vue|tsx|jsx)$/.test(path) && /(page|screen|view)/.test(name))
    ) {
      return 'PAGE';
    }
    if (/(^|\/)(jobs?|cron|schedulers?|workers?)(\/|$)/.test(path) || /(cron|scheduled|scheduler|job|worker)/.test(name)) {
      return 'JOB';
    }
    if (/(^|\/)(consumers?|producers?|events?|mq)(\/|$)/.test(path) || /(consumer|producer|listener|handler)/.test(name)) {
      return 'MESSAGE';
    }
    if (/(database|migrations?|schema|\.sql$)/.test(path)) return 'DATA';
    return 'TECHNICAL';
  }

  private domain(tokens: string[]) {
    const has = (...values: string[]) => values.every((value) => tokens.includes(value));
    const oneOf = (...values: string[]) => values.some((value) => tokens.includes(value));
    if (has('project', 'sign', 'in') || has('project', 'signin')) {
      return { key: 'project-sign-in', label: '工地签到', known: true };
    }
    if (oneOf('problem', 'problems', 'issue', 'issues', 'defect', 'defects')) return { key: 'problem', label: '工地问题', known: true };
    if (oneOf('schedule', 'duration', 'period')) return { key: 'schedule', label: '工期管理', known: true };
    if (oneOf('approval', 'approve', 'audit', 'review')) return { key: 'approval', label: '审批流程', known: true };
    if (oneOf('delivery', 'acceptance')) return { key: 'delivery', label: '交付验收', known: true };
    if (oneOf('member', 'person', 'manager', 'employee')) return { key: 'member', label: '人员管理', known: true };
    if (oneOf('auth', 'login', 'permission', 'role', 'token')) return { key: 'auth', label: '登录与权限', known: true };
    if (oneOf('payment', 'payments', 'billing', 'order', 'orders', 'refund', 'refunds')) return { key: 'payment', label: '交易与支付', known: true };
    if (oneOf('camera', 'monitor', 'detection')) return { key: 'monitor', label: '工地监控', known: true };
    if (oneOf('notification', 'notify', 'message', 'push')) return { key: 'message', label: '消息通知', known: true };
    if (oneOf('project', 'construction', 'site')) return { key: 'project', label: '工地管理', known: true };
    const fallback = tokens.filter((token) => !this.technicalTokens.has(token)).slice(0, 3).join('-');
    return {
      key: fallback || 'unknown',
      label: fallback ? `待确认业务 · ${fallback}` : '待确认业务',
      known: false,
    };
  }

  private action(tokens: string[]) {
    const oneOf = (...values: string[]) => values.some((value) => tokens.includes(value));
    if (oneOf('revoke', 'revocation', 'withdraw', 'cancel')) return '撤销';
    if (oneOf('resolve', 'rectify', 'repair', 'handle')) return '整改处理';
    if (oneOf('approve', 'approval', 'audit', 'review')) return '审批';
    if (oneOf('create', 'add', 'insert', 'new')) return '创建';
    if (oneOf('update', 'modify', 'edit', 'change')) return '修改';
    if (oneOf('delete', 'remove')) return '删除';
    if (oneOf('submit', 'commit')) return '提交';
    if (oneOf('bind', 'binding')) return '绑定';
    if (oneOf('trigger', 'dispatch', 'send')) return '触发';
    if (oneOf('list', 'search', 'query', 'get', 'detail', 'find')) return '查询';
    return '';
  }

  private subject(tokens: string[], boundaryType: BusinessSemantics['boundaryType']) {
    const oneOf = (...values: string[]) => values.some((value) => tokens.includes(value));
    if (oneOf('notification', 'notify', 'message', 'push')) return '消息通知';
    if (oneOf('preview')) return '预览';
    if (oneOf('camera', 'detection')) return '摄像头检测';
    if (oneOf('flow', 'workflow')) return '流程';
    if (boundaryType === 'PAGE') return '页面';
    if (boundaryType === 'JOB') return '定时任务';
    if (boundaryType === 'MESSAGE') return '消息消费';
    return '';
  }

  private scenario(
    domain: string,
    action: string,
    subject: string,
    boundaryType: BusinessSemantics['boundaryType'],
  ) {
    if (subject === '消息通知') return `${domain}${action || '状态变化'}消息通知`;
    if (action || subject) return `${domain}${action}${subject}`;
    const suffix: Partial<Record<BusinessSemantics['boundaryType'], string>> = {
      HTTP: '接口入口',
      PAGE: '页面入口',
      JOB: '后台任务',
      MESSAGE: '消息链路',
      DATA: '数据变更',
      TECHNICAL: '关联代码',
      UNKNOWN: '待确认范围',
    };
    return `${domain}${suffix[boundaryType] ?? '影响范围'}`;
  }

  private tokens(value: string) {
    return [...new Set(value
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z\d]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean))];
  }

  private normalizeRoute(path: string) {
    return path.replace(/\{[^}]+\}|:[^/]+/g, ':param').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  private readonly technicalTokens = new Set([
    'src', 'app', 'apps', 'service', 'services', 'controller', 'controllers',
    'module', 'modules', 'index', 'ts', 'tsx', 'js', 'jsx', 'vue', 'basic',
    'common', 'core', 'impl', 'interface', 'factory', 'util', 'utils',
  ]);
}
