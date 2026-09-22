import type { AnalysisTask, RegressionSuggestion } from "@impact-flow/contracts";

export const BUSINESS_MODULES = [
  { key: "site-list", name: "工地列表" },
  { key: "site-checkin", name: "工地签到" },
  { key: "site-inspection", name: "工地巡检" },
  { key: "site-problem", name: "工地问题" },
  { key: "acceptance-report", name: "验收报告" },
  { key: "event-report", name: "事件报备" },
  { key: "camera", name: "摄像头" },
  { key: "ai", name: "AI相关" },
] as const;

type BusinessModuleKey = (typeof BUSINESS_MODULES)[number]["key"];

export interface BusinessImpactSummaryItem {
  key: string;
  name: string;
  changeCount: number;
  aiCount: number;
  priority: RegressionSuggestion["priority"];
  needsReview: boolean;
}

export interface BusinessImpactModule {
  key: BusinessModuleKey;
  name: string;
  items: BusinessImpactSummaryItem[];
  changeCount: number;
  aiCount: number;
  pendingCount: number;
}

export interface BusinessImpactSummary {
  modules: BusinessImpactModule[];
  itemCount: number;
  changeCount: number;
  aiCount: number;
  pendingCount: number;
}

const priorityWeight: Record<RegressionSuggestion["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

const clean = (value?: string) => value?.replace(/\s+/g, " ").trim() ?? "";

function searchableText(suggestion: RegressionSuggestion) {
  return [
    suggestion.businessDomain,
    suggestion.businessScenario,
    suggestion.title,
    suggestion.scope,
    ...(suggestion.entryPoints ?? []),
    ...(suggestion.evidence ?? []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
}

function assignedModules(suggestion: RegressionSuggestion): BusinessModuleKey[] {
  const text = searchableText(suggestion);
  const modules = new Set<BusinessModuleKey>();

  // 产品一级路由是最可靠的业务归属依据；先于名称和英文关键字判断。
  const isSignRoute = /\/?device\/history\/sign(?:\b|[?#/])/i.test(text);
  if (/#?\/?project\/list(?:\b|[?#/])/i.test(text)) modules.add("site-list");
  if (isSignRoute) modules.add("site-checkin");
  if (/#?\/?screen-monitor(?:\b|[?#/])/i.test(text) && !/screen-monitor-report/i.test(text)) {
    modules.add("site-inspection");
  }
  if (/#?\/?report\/screen-monitor-report(?:\b|[?#/])/i.test(text)) modules.add("site-problem");
  if (/\/?acceptance-report(?:\b|[?#/])/i.test(text)) modules.add("acceptance-report");
  if (/#?\/?project\/event-report(?:\b|[?#/])/i.test(text)) modules.add("event-report");
  if (/\/?device\//i.test(text) && !isSignRoute) modules.add("camera");

  if (/(工地问题|problem|defect|issue)/i.test(text)) modules.add("site-problem");
  if (/(事件报备|事件申报|event[\s/_-]*filing|event[\s/_-]*report)/i.test(text)) modules.add("event-report");
  if (/(验收报告|交付验收|acceptance|delivery[\s/_-]*report)/i.test(text)) modules.add("acceptance-report");
  if (/(工地巡检|现场巡检|site[\s/_-]*(inspection|patrol)|project[\s/_-]*(inspection|patrol))/i.test(text)) modules.add("site-inspection");
  if (/(工地签到|现场签到|sign[\s/_-]*in|signin|check[\s/_-]*in|attendance)/i.test(text)) modules.add("site-checkin");
  if (/(摄像头|工地监控|camera|video[\s/_-]*monitor)/i.test(text)) modules.add("camera");
  if (/(AI相关|人工智能|人脸|\bai\b|face[\s/_-]*(recognition|verify|match)|algorithm|智能识别)/i.test(text)) modules.add("ai");
  if (
    /(工地列表|工地管理)/.test(text) ||
    /\/(live\/marketing\/)?project\/(list|search|add|create|detail|info|node)/i.test(text)
  ) {
    modules.add("site-list");
  }

  return modules.size ? [...modules] : ["site-list"];
}

function actionOf(text: string) {
  const actions: Array<[RegExp, string]> = [
    [/(绑定|bind|binding)/i, "绑定"],
    [/(撤销|revoke|withdraw|cancel)/i, "撤销"],
    [/(整改|处理|resolve|rectify|repair|handle)/i, "整改处理"],
    [/(审批|approve|approval|audit|review)/i, "审批"],
    [/(创建|新增|create|add|insert)/i, "创建"],
    [/(修改|编辑|update|modify|edit)/i, "修改"],
    [/(删除|delete|remove)/i, "删除"],
    [/(触发|推送|trigger|dispatch|push|send)/i, "触发"],
    [/(检测|识别|detect|recognition|verify|match)/i, "检测"],
    [/(查询|列表|详情|历史|list|search|query|get|detail|find|history)/i, "查询"],
  ];
  return actions.find(([pattern]) => pattern.test(text))?.[1] ?? "受影响";
}

function itemName(suggestion: RegressionSuggestion, moduleKey: BusinessModuleKey) {
  const text = searchableText(suggestion);
  const action = actionOf(text);
  const scenario = clean(suggestion.businessScenario);

  if (moduleKey === "camera") return `摄像头${action}`;
  if (moduleKey === "ai") {
    if (/(人脸|face)/i.test(text) && /(签到|sign[\s/_-]*in|check[\s/_-]*in)/i.test(text)) {
      return "人脸签到";
    }
    return `AI${action}`;
  }

  const module = BUSINESS_MODULES.find((item) => item.key === moduleKey)!;
  const expectedPrefixes: Record<Exclude<BusinessModuleKey, "camera" | "ai">, string[]> = {
    "site-list": ["工地管理", "工地列表", "工地"],
    "site-checkin": ["工地签到"],
    "site-inspection": ["工地巡检"],
    "site-problem": ["工地问题"],
    "acceptance-report": ["验收报告", "交付验收"],
    "event-report": ["事件报备"],
  };
  const prefix = expectedPrefixes[moduleKey].find((item) => scenario.startsWith(item));
  if (prefix) {
    if (moduleKey === "site-list" && prefix === "工地管理") {
      return `工地${scenario.slice(prefix.length) || action}`;
    }
    if (moduleKey === "acceptance-report" && prefix === "交付验收") {
      return `验收报告${scenario.slice(prefix.length) || action}`;
    }
    return scenario;
  }
  return `${module.name}${action}`;
}

function summaryKey(name: string) {
  return name.toLocaleLowerCase("zh-CN").replace(/[\s·・/_-]+/g, "");
}

export function summarizeBusinessImpacts(
  task: Pick<AnalysisTask, "regressionSuggestions" | "aiAnalysis"> | null | undefined,
): BusinessImpactSummary {
  const groupedItems = new Map<string, BusinessImpactSummaryItem>();
  let changeCount = 0;
  let aiCount = 0;

  const add = (suggestion: RegressionSuggestion, source: "change" | "ai") => {
    for (const moduleKey of assignedModules(suggestion)) {
      const name = itemName(suggestion, moduleKey);
      const key = `${moduleKey}:${summaryKey(name)}`;
      const current = groupedItems.get(key) ?? {
        key,
        name,
        changeCount: 0,
        aiCount: 0,
        priority: suggestion.priority,
        needsReview: false,
      };

      current[`${source}Count`] += 1;
      if (priorityWeight[suggestion.priority] < priorityWeight[current.priority]) {
        current.priority = suggestion.priority;
      }
      current.needsReview ||=
        suggestion.coverageStatus === "NEEDS_REVIEW" ||
        suggestion.businessConfidence === "LOW";
      groupedItems.set(key, current);
    }
  };

  for (const suggestion of task?.regressionSuggestions ?? []) {
    changeCount += 1;
    add(suggestion, "change");
  }
  if (task?.aiAnalysis?.status === "SUCCESS") {
    for (const suggestion of task.aiAnalysis.regressionSuggestions ?? []) {
      aiCount += 1;
      add(suggestion, "ai");
    }
  }

  const modules = BUSINESS_MODULES.map((module) => {
    const items = [...groupedItems.values()]
      .filter((item) => item.key.startsWith(`${module.key}:`))
      .sort((left, right) =>
        priorityWeight[left.priority] - priorityWeight[right.priority] ||
        Number(left.needsReview) - Number(right.needsReview) ||
        left.name.localeCompare(right.name, "zh-CN"),
      );
    return {
      ...module,
      items,
      changeCount: items.reduce((total, item) => total + item.changeCount, 0),
      aiCount: items.reduce((total, item) => total + item.aiCount, 0),
      pendingCount: items.filter((item) => item.needsReview).length,
    };
  }).filter((module) => module.items.length > 0);

  return {
    modules,
    itemCount: modules.reduce((total, module) => total + module.items.length, 0),
    changeCount,
    aiCount,
    pendingCount: modules.reduce((total, module) => total + module.pendingCount, 0),
  };
}
