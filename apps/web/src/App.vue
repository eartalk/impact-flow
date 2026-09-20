<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Collection,
  DataAnalysis,
  Delete,
  Edit,
  Connection,
  Plus,
  Refresh,
  Tickets,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AnalysisTask,
  CodeSymbolKind,
  CreateProjectInput,
  InspectionLog,
  InspectionLogQuery,
  Project,
  RepositoryConnectionTest,
} from "@impact-flow/contracts";
import { api } from "./api";

const projects = ref<Project[]>([]);
const analyses = ref<AnalysisTask[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const activeView = ref<"analysis" | "services">("analysis");
const editingProjectId = ref<string | null>(null);
const savingProject = ref(false);
const detectingProjectId = ref<string | null>(null);
const testingConnectionId = ref<string | null>(null);
const connectionResults = ref<Record<string, RepositoryConnectionTest>>({});
const detailLoadingProjectId = ref<string | null>(null);
const checkingAll = ref(false);
const inspectionLogVisible = ref(false);
const inspectionLogLoading = ref(false);
const inspectionLogs = ref<InspectionLog[]>([]);
const inspectionLogTotal = ref(0);
const inspectionLogPage = ref(1);
const inspectionLogTotalPages = ref(1);
const inspectionLogFilters = reactive<{
  projectId: string;
  status: "" | NonNullable<InspectionLogQuery["status"]>;
  triggerType: "" | NonNullable<InspectionLogQuery["triggerType"]>;
}>({ projectId: "", status: "", triggerType: "" });
const expandedProjectIds = ref<string[]>([]);
const analysisDetails = ref<Record<string, AnalysisTask>>({});
let projectRefreshTimer: ReturnType<typeof setInterval> | undefined;
let analysisPollTimer: ReturnType<typeof setInterval> | undefined;

const form = reactive<CreateProjectInput>({
  name: "",
  code: "",
  repositoryUrl: "",
  productionBranch: "production",
});

const latestAnalysisByProject = computed(() => {
  const result = new Map<string, AnalysisTask>();
  for (const task of analyses.value) {
    if (!result.has(task.projectId)) result.set(task.projectId, task);
  }
  return result;
});

const shortCommit = (commit: string | null | undefined) =>
  commit ? commit.slice(0, 8) : "尚未记录";

async function loadData() {
  loading.value = true;
  try {
    [projects.value, analyses.value] = await Promise.all([
      api.listProjects(),
      api.listAnalyses(),
    ]);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    name: "",
    code: "",
    repositoryUrl: "",
    productionBranch: "production",
  });
}

function openCreateProject() {
  editingProjectId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEditProject(project: Project) {
  editingProjectId.value = project.id;
  Object.assign(form, {
    name: project.name,
    code: project.code,
    repositoryUrl: project.repositoryUrl,
    productionBranch: project.productionBranch,
  });
  dialogVisible.value = true;
}

async function saveProject() {
  savingProject.value = true;
  try {
    const project = editingProjectId.value
      ? await api.updateProject(editingProjectId.value, form)
      : await api.createProject(form);
    dialogVisible.value = false;
    resetForm();
    await loadData();
    ElMessage.success(editingProjectId.value ? "服务已更新" : "服务已添加");
    editingProjectId.value = null;
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    savingProject.value = false;
  }
}

async function removeProject(project: Project) {
  try {
    await ElMessageBox.confirm(
      `确定删除服务“${project.name}”吗？已有分析记录的服务不会被删除。`,
      "删除服务",
      {
        confirmButtonText: "确认删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    await api.deleteProject(project.id);
    await loadData();
    ElMessage.success("服务已删除");
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error((error as Error).message);
  }
}

function analysisFor(projectId: string) {
  return latestAnalysisByProject.value.get(projectId);
}

function analysisIsActive(projectId: string) {
  const status = analysisFor(projectId)?.status;
  return status === "READY" || status === "RUNNING";
}

function analysisStatusLabel(status: AnalysisTask["status"] | undefined) {
  return {
    READY: "等待执行",
    RUNNING: "分析中",
    SUCCESS: "分析完成",
    FAILED: "分析失败",
    NO_CHANGES: "无变更",
  }[status ?? "READY"];
}

function riskLabel(level: AnalysisTask["riskLevel"]) {
  return {
    LOW: "低风险",
    MEDIUM: "中风险",
    HIGH: "高风险",
    CRITICAL: "严重风险",
  }[level ?? "LOW"];
}

function symbolKindLabel(kind: CodeSymbolKind) {
  return {
    CLASS: "类",
    METHOD: "方法",
    FUNCTION: "函数",
    INTERFACE: "接口",
    TYPE: "类型",
    PROPERTY: "属性",
  }[kind];
}

function symbolChangeLabel(changeType: "ADDED" | "MODIFIED" | "DELETED") {
  return { ADDED: "新增", MODIFIED: "修改", DELETED: "删除" }[changeType];
}

function analysisDetail(projectId: string) {
  return analysisDetails.value[projectId] ?? analysisFor(projectId);
}

function isExpanded(projectId: string) {
  return expandedProjectIds.value.includes(projectId);
}

async function toggleAnalysis(project: Project) {
  if (isExpanded(project.id)) {
    expandedProjectIds.value = expandedProjectIds.value.filter(
      (id) => id !== project.id,
    );
    return;
  }

  const task = analysisFor(project.id);
  if (!task) return;
  expandedProjectIds.value = [...expandedProjectIds.value, project.id];

  if (analysisDetails.value[project.id]?.files) return;
  detailLoadingProjectId.value = project.id;
  try {
    const detail = await api.getAnalysis(task.id);
    analysisDetails.value = {
      ...analysisDetails.value,
      [project.id]: detail,
    };
  } catch (error) {
    expandedProjectIds.value = expandedProjectIds.value.filter(
      (id) => id !== project.id,
    );
    ElMessage.error((error as Error).message);
  } finally {
    detailLoadingProjectId.value = null;
  }
}

function currentVersion(project: Project) {
  return (
    project.detectedCommit ??
    analysisFor(project.id)?.targetCommit ??
    project.lastAnalyzedCommit
  );
}

function previousVersion(project: Project) {
  return (
    project.previousDetectedCommit ?? analysisFor(project.id)?.baseCommit ?? null
  );
}

function intervalVersions(project: Project) {
  if (project.pendingCommits?.length) return project.pendingCommits;
  const task = analysisFor(project.id);
  if (!task?.commits?.length) return [];
  return task.commits.map((commit) => ({
    sha: commit.sha,
    shortSha: commit.shortSha,
    subject: commit.subject,
  }));
}

function pushState(project: Project) {
  if (project.checkStatus === "FAILED") return "error";
  if (project.checkStatus === "RUNNING") return "checking";
  if (!project.lastCheckedAt) return "unknown";
  return project.detectedCommit !== project.lastAnalyzedCommit ? "yes" : "no";
}

const formatCheckedAt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";

const formatLogTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";

function inspectionDuration(log: InspectionLog) {
  if (!log.finishedAt) return "执行中";
  const duration = Math.max(
    0,
    new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime(),
  );
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
}

async function loadInspectionLogs(resetPage = false) {
  if (resetPage) inspectionLogPage.value = 1;
  inspectionLogLoading.value = true;
  try {
    const result = await api.listInspectionLogs({
      page: inspectionLogPage.value,
      pageSize: 10,
      projectId: inspectionLogFilters.projectId || undefined,
      status: inspectionLogFilters.status || undefined,
      triggerType: inspectionLogFilters.triggerType || undefined,
    });
    inspectionLogs.value = result.items;
    inspectionLogTotal.value = result.total;
    inspectionLogPage.value = result.page;
    inspectionLogTotalPages.value = result.totalPages;
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    inspectionLogLoading.value = false;
  }
}

function openInspectionLogs() {
  inspectionLogVisible.value = true;
  inspectionLogPage.value = 1;
  void loadInspectionLogs();
}

function resetInspectionLogFilters() {
  Object.assign(inspectionLogFilters, {
    projectId: "",
    status: "",
    triggerType: "",
  });
  void loadInspectionLogs(true);
}

function changeInspectionLogPage(page: number) {
  if (page < 1 || page > inspectionLogTotalPages.value) return;
  inspectionLogPage.value = page;
  void loadInspectionLogs();
}

function showInspectionError(log: InspectionLog) {
  void ElMessageBox.alert(log.errorMessage ?? "未记录失败原因", `${log.projectName} · 巡检失败`, {
    confirmButtonText: "关闭",
    customClass: "inspection-error-message",
  });
}

async function inspectAllProjects() {
  checkingAll.value = true;
  try {
    projects.value = await api.inspectAllProjects();
    const failed = projects.value.filter(
      (project) => project.checkStatus === "FAILED",
    ).length;
    failed
      ? ElMessage.warning(`巡检完成，${failed} 个服务配置异常`)
      : ElMessage.success("全部服务巡检完成");
    if (inspectionLogVisible.value) await loadInspectionLogs();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    checkingAll.value = false;
  }
}

async function startDetection(project: Project) {
  detectingProjectId.value = project.id;
  try {
    const task = await api.createAnalysis(project.id);
    analysisDetails.value = {
      ...analysisDetails.value,
      [project.id]: task,
    };
    analyses.value = [
      task,
      ...analyses.value.filter((item) => item.id !== task.id),
    ];
    if (!expandedProjectIds.value.includes(project.id)) {
      expandedProjectIds.value = [...expandedProjectIds.value, project.id];
    }
    ElMessage.success(
      task.status === "NO_CHANGES"
        ? `${project.name} 当前没有新推送`
        : `${project.name} 已提交后台分析`,
    );
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    detectingProjectId.value = null;
  }
}

async function testProjectConnection(project: Project) {
  testingConnectionId.value = project.id;
  try {
    const result = await api.testProjectConnection(project.id);
    connectionResults.value = {
      ...connectionResults.value,
      [project.id]: result,
    };
    result.success
      ? ElMessage.success(`${project.name} 连接正常`)
      : ElMessage.error(`${project.name}：${result.message}`);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    testingConnectionId.value = null;
  }
}

async function pollActiveAnalyses() {
  if (!analyses.value.some((task) => ["READY", "RUNNING"].includes(task.status))) {
    return;
  }
  try {
    const previous = new Map(analyses.value.map((task) => [task.id, task.status]));
    const next = await api.listAnalyses();
    analyses.value = next;
    const completed = next.filter(
      (task) =>
        ["READY", "RUNNING"].includes(previous.get(task.id) ?? "") &&
        !["READY", "RUNNING"].includes(task.status),
    );
    for (const task of completed) {
      const detail = await api.getAnalysis(task.id);
      analysisDetails.value = {
        ...analysisDetails.value,
        [task.projectId]: detail,
      };
    }
    if (completed.length) projects.value = await api.listProjects();
  } catch {
    // 轮询失败时保留当前状态，下一轮继续尝试。
  }
}

onMounted(() => {
  void loadData();
  projectRefreshTimer = setInterval(async () => {
    try {
      projects.value = await api.listProjects();
    } catch {
      // 后台静默刷新失败时保留当前页面数据。
    }
  }, 30_000);
  analysisPollTimer = setInterval(() => void pollActiveAnalyses(), 2_000);
});

onBeforeUnmount(() => {
  if (projectRefreshTimer) clearInterval(projectRefreshTimer);
  if (analysisPollTimer) clearInterval(analysisPollTimer);
});
</script>

<template>
  <div class="shell" v-loading="loading">
    <aside class="rail">
      <div class="brand-mark"><b>IF</b><span>IMPACT FLOW</span></div>
      <nav aria-label="主导航">
        <button
          class="rail-button"
          :class="{ active: activeView === 'analysis' }"
          @click="activeView = 'analysis'"
        >
          <el-icon><DataAnalysis /></el-icon>
          <span>发布分析</span>
        </button>
        <button
          class="rail-button"
          :class="{ active: activeView === 'services' }"
          @click="activeView = 'services'"
        >
          <el-icon><Collection /></el-icon>
          <span>服务管理</span>
        </button>
      </nav>
      <div class="rail-status" title="API 服务状态">
        <span></span>
      </div>
    </aside>

    <main class="workspace">
      <template v-if="activeView === 'analysis'">
        <section class="release-overview">
          <div class="release-stat">
            <span>服务总数</span>
            <strong>{{ projects.length }}</strong>
          </div>
          <div class="release-stat">
            <span>存在新推送</span>
            <strong class="accent-count">{{
              projects.filter((project) => pushState(project) === "yes").length
            }}</strong>
          </div>
          <div class="release-hint">
            <span class="pulse-dot"></span>
            <span>系统每 5 分钟自动巡检生产分支</span>
            <div class="inspection-actions">
              <button
                class="inspection-log-action"
                @click="openInspectionLogs"
              >
                <el-icon><Tickets /></el-icon>
                巡检日志
              </button>
              <button
                class="inspect-all-action"
                :disabled="checkingAll"
                @click="inspectAllProjects"
              >
                <el-icon :class="{ spinning: checkingAll }"><Refresh /></el-icon>
                {{ checkingAll ? "巡检中…" : "立即巡检" }}
              </button>
            </div>
          </div>
        </section>

        <section class="release-panel">
          <div class="release-table-head">
            <span>服务名称</span>
            <span>分支</span>
            <span>当前版本号</span>
            <span>上一检测版本号</span>
            <span>间隔版本</span>
            <span>是否存在新推送</span>
            <span>操作</span>
          </div>

          <div v-if="projects.length" class="release-table-body">
            <div
              v-for="(project, index) in projects"
              :key="project.id"
              class="release-record-group"
            >
              <div class="release-record">
                <div class="release-service">
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <div>
                  <strong>{{ project.name }}</strong>
                  <small>{{ project.code }}</small>
                </div>
                </div>
                <span class="branch-chip">{{ project.productionBranch }}</span>
                <code
                  class="version-code current"
                  :title="currentVersion(project) ?? '尚未检测'"
                >
                  {{ shortCommit(currentVersion(project)) }}
                </code>
                <code
                  class="version-code"
                  :title="previousVersion(project) ?? '尚未检测'"
                >
                  {{ shortCommit(previousVersion(project)) }}
                </code>
                <el-tooltip
                  placement="top"
                  effect="light"
                  popper-class="version-tooltip"
                  :disabled="intervalVersions(project).length === 0"
                >
                  <template #content>
                    <div class="version-tooltip-content">
                      <p>间隔版本明细</p>
                      <div
                        v-for="version in intervalVersions(project)"
                        :key="version.sha"
                      >
                        <code>{{ version.shortSha }}</code>
                        <span>{{ version.subject }}</span>
                      </div>
                    </div>
                  </template>
                  <span
                    class="interval-count"
                    :class="{ active: intervalVersions(project).length > 0 }"
                  >
                    <strong>{{
                      project.lastCheckedAt
                        ? project.pendingCommitCount
                        : "—"
                    }}</strong>
                    <small v-if="project.lastCheckedAt">次</small>
                  </span>
                </el-tooltip>
                <div>
                  <el-tooltip
                    placement="top"
                    :disabled="pushState(project) !== 'error'"
                    :content="project.checkError ?? ''"
                  >
                    <span class="push-state" :class="pushState(project)">
                      <i></i>
                      {{
                        pushState(project) === "yes"
                          ? "是"
                          : pushState(project) === "no"
                            ? "否"
                            : pushState(project) === "checking"
                              ? "巡检中"
                              : pushState(project) === "error"
                                ? "巡检失败"
                                : "待巡检"
                      }}
                    </span>
                  </el-tooltip>
                  <small v-if="project.lastCheckedAt" class="checked-at">
                    {{ formatCheckedAt(project.lastCheckedAt) }}
                  </small>
                </div>
                <div class="release-actions">
                  <button
                    class="detect-action"
                    :disabled="
                      detectingProjectId === project.id ||
                      analysisIsActive(project.id) ||
                      pushState(project) !== 'yes'
                    "
                    @click="startDetection(project)"
                  >
                    <el-icon
                      :class="{
                        spinning:
                          detectingProjectId === project.id ||
                          analysisIsActive(project.id),
                      }"
                    >
                      <DataAnalysis />
                    </el-icon>
                    {{
                      detectingProjectId === project.id || analysisIsActive(project.id)
                        ? "分析中…"
                        : "开始检测"
                    }}
                  </button>
                  <button
                    class="expand-action"
                    :disabled="!analysisFor(project.id)"
                    @click="toggleAnalysis(project)"
                  >
                    {{ isExpanded(project.id) ? "收起" : "展开" }}
                    <el-icon>
                      <ArrowUp v-if="isExpanded(project.id)" />
                      <ArrowDown v-else />
                    </el-icon>
                  </button>
                </div>
              </div>

              <section
                v-if="isExpanded(project.id) && analysisDetail(project.id)"
                class="row-analysis"
                v-loading="detailLoadingProjectId === project.id"
              >
                <div class="result-header">
                  <div>
                    <span class="analysis-status">
                      {{ analysisStatusLabel(analysisDetail(project.id)?.status) }}
                    </span>
                    <strong>检测结果</strong>
                  </div>
                  <div class="result-commits">
                    <code>{{
                      shortCommit(analysisDetail(project.id)?.baseCommit)
                    }}</code>
                    <el-icon><ArrowRight /></el-icon>
                    <code>{{
                      shortCommit(analysisDetail(project.id)?.targetCommit)
                    }}</code>
                  </div>
                </div>

                <div
                  v-if="['READY', 'RUNNING'].includes(analysisDetail(project.id)?.status ?? '')"
                  class="analysis-running-state"
                >
                  <span class="analysis-running-indicator"></span>
                  <div>
                    <strong>后台正在分析变更影响</strong>
                    <p>页面可以继续操作，结果完成后会自动更新。</p>
                  </div>
                </div>

                <div
                  v-else-if="analysisDetail(project.id)?.status === 'FAILED'"
                  class="analysis-error"
                >
                  {{ analysisDetail(project.id)?.errorMessage }}
                </div>

                <template v-else>
                  <div class="result-metrics">
                    <div>
                      <span>提交</span>
                      <strong>{{
                        analysisDetail(project.id)?.commitCount
                      }}</strong>
                    </div>
                    <div>
                      <span>文件</span>
                      <strong>{{
                        analysisDetail(project.id)?.changedFileCount
                      }}</strong>
                    </div>
                    <div class="positive">
                      <span>新增行</span>
                      <strong>+{{
                        analysisDetail(project.id)?.additions
                      }}</strong>
                    </div>
                    <div class="negative">
                      <span>删除行</span>
                      <strong>-{{
                        analysisDetail(project.id)?.deletions
                      }}</strong>
                    </div>
                  </div>

                  <section
                    v-if="analysisDetail(project.id)?.riskLevel"
                    class="impact-analysis"
                  >
                    <div class="impact-overview">
                      <span
                        class="risk-badge"
                        :class="analysisDetail(project.id)?.riskLevel?.toLowerCase()"
                      >
                        {{ riskLabel(analysisDetail(project.id)?.riskLevel ?? null) }}
                      </span>
                      <div>
                        <strong>变更影响评估</strong>
                        <p>{{ analysisDetail(project.id)?.riskSummary }}</p>
                      </div>
                    </div>
                    <div class="impact-columns">
                      <div>
                        <h4>影响模块</h4>
                        <div class="impact-module-list">
                          <article
                            v-for="module in analysisDetail(project.id)?.impactedModules"
                            :key="module.name"
                          >
                            <strong>{{ module.name }}</strong>
                            <span>{{ module.reason }}</span>
                          </article>
                        </div>
                      </div>
                      <div>
                        <h4>回归建议</h4>
                        <ol class="regression-list">
                          <li
                            v-for="suggestion in analysisDetail(project.id)?.regressionSuggestions"
                            :key="suggestion.title"
                          >
                            <span>{{ suggestion.priority }}</span>
                            <div>
                              <strong>{{ suggestion.title }}</strong>
                              <p>{{ suggestion.scope }}</p>
                            </div>
                          </li>
                        </ol>
                      </div>
                    </div>
                  </section>

                  <section
                    v-if="analysisDetail(project.id)?.symbolSummary"
                    class="symbol-analysis"
                  >
                    <header class="symbol-analysis-header">
                      <span class="symbol-analysis-icon"><DataAnalysis /></span>
                      <div>
                        <strong>TypeScript Symbol 影响</strong>
                        <p>{{ analysisDetail(project.id)?.symbolSummary }}</p>
                      </div>
                    </header>

                    <div
                      v-if="analysisDetail(project.id)?.symbolChanges?.length"
                      class="symbol-analysis-grid"
                    >
                      <div class="symbol-change-panel">
                        <h4>
                          变更 Symbol
                          <span>{{ analysisDetail(project.id)?.symbolChanges?.length }}</span>
                        </h4>
                        <div class="symbol-change-list">
                          <article
                            v-for="symbol in analysisDetail(project.id)?.symbolChanges?.slice(0, 12)"
                            :key="`${symbol.changeType}-${symbol.key}`"
                          >
                            <span
                              class="symbol-change-type"
                              :class="symbol.changeType.toLowerCase()"
                            >
                              {{ symbolChangeLabel(symbol.changeType) }}
                            </span>
                            <div>
                              <strong>
                                <em
                                  v-if="symbol.projectId && symbol.projectId !== project.id"
                                  class="symbol-project-badge"
                                >{{ symbol.projectName }}</em>
                                {{ symbol.qualifiedName }}
                              </strong>
                              <p>
                                {{ symbolKindLabel(symbol.kind) }} ·
                                {{ symbol.filePath }}:{{ symbol.startLine }}
                              </p>
                            </div>
                            <span
                              class="symbol-risk"
                              :class="symbol.riskLevel.toLowerCase()"
                            >
                              {{ riskLabel(symbol.riskLevel) }}
                            </span>
                          </article>
                        </div>
                      </div>

                      <div class="symbol-chain-panel">
                        <h4>
                          上游调用链
                          <span>{{ analysisDetail(project.id)?.symbolImpacts?.length ?? 0 }}</span>
                        </h4>
                        <div
                          v-if="analysisDetail(project.id)?.symbolImpacts?.length"
                          class="symbol-chain-list"
                        >
                          <article
                            v-for="impact in analysisDetail(project.id)?.symbolImpacts?.slice(0, 10)"
                            :key="`${impact.changedSymbolKey}-${impact.impactedSymbol.key}`"
                          >
                            <div class="symbol-chain-depth">{{ impact.depth }} 层</div>
                            <div class="symbol-chain-path">
                              <template
                                v-for="(node, index) in impact.callChain"
                                :key="node.key"
                              >
                                <em
                                  v-if="node.projectId && node.projectId !== project.id"
                                  class="symbol-project-badge"
                                >{{ node.projectName }}</em>
                                <code>{{ node.qualifiedName }}</code>
                                <ArrowRight v-if="index < impact.callChain.length - 1" />
                              </template>
                            </div>
                          </article>
                        </div>
                        <div v-else class="symbol-chain-empty">
                          未发现项目内的上游静态调用
                        </div>
                      </div>
                    </div>
                    <div v-else class="symbol-analysis-empty">
                      本次 TypeScript 变更没有落在可识别的类、方法、函数或类型上。
                    </div>
                  </section>

                  <div
                    v-if="analysisDetail(project.id)?.files?.length"
                    class="file-table"
                  >
                    <div class="file-row file-head">
                      <span>状态</span><span>文件</span><span>变更行</span>
                    </div>
                    <div
                      v-for="file in analysisDetail(project.id)?.files"
                      :key="`${file.changeType}-${file.path}`"
                      class="file-row"
                    >
                      <span
                        class="change-badge"
                        :class="file.changeType.toLowerCase()"
                      >
                        {{ file.changeType }}
                      </span>
                      <div>
                        <code>{{ file.path }}</code>
                        <small v-if="file.oldPath">
                          原路径：{{ file.oldPath }}
                        </small>
                      </div>
                      <span class="line-count">
                        <b>+{{ file.additions }}</b>
                        <i>-{{ file.deletions }}</i>
                      </span>
                    </div>
                  </div>

                  <div
                    v-else-if="analysisDetail(project.id)?.status !== 'RUNNING'"
                    class="no-file-change"
                  >
                    本次检测没有文件变更
                  </div>
                </template>
              </section>
            </div>
          </div>

          <div v-else class="release-empty">
            <span>NO SERVICES</span>
            <h2>还没有可以检测的服务</h2>
            <p>先添加服务和生产分支，发布分析列表会自动生成。</p>
            <button class="primary-action" @click="openCreateProject">
              添加服务
            </button>
          </div>
        </section>

      </template>

      <template v-else>
        <header class="topbar service-topbar">
          <div class="page-title">
            <h1>服务管理</h1>
            <span>维护 Codeup 仓库与生产分支</span>
          </div>
          <button class="add-project" @click="openCreateProject">
            <el-icon><Plus /></el-icon>
            添加服务
          </button>
        </header>

        <section class="service-summary">
          <div>
            <span>已接入服务</span>
            <strong>{{ projects.length }}</strong>
          </div>
          <p>维护 Codeup 仓库和生产分支。分析入口会直接读取这里的配置。</p>
        </section>

        <section class="service-panel">
          <div class="service-table-head">
            <span>服务</span>
            <span>Codeup 仓库</span>
            <span>生产分支</span>
            <span>最近分析版本</span>
            <span>操作</span>
          </div>

          <div v-if="projects.length" class="service-table-body">
            <div
              v-for="(project, index) in projects"
              :key="project.id"
              class="service-record"
            >
              <div class="service-identity">
                <i>{{ String(index + 1).padStart(2, "0") }}</i>
                <div>
                  <strong>{{ project.name }}</strong
                  ><code>{{ project.code }}</code>
                </div>
              </div>
              <code class="repository-cell" :title="project.repositoryUrl">
                {{ project.repositoryUrl }}
              </code>
              <span class="branch-chip">{{ project.productionBranch }}</span>
              <code class="commit-cell">{{
                shortCommit(project.lastAnalyzedCommit)
              }}</code>
              <div class="record-actions">
                <el-tooltip
                  placement="top"
                  :disabled="!connectionResults[project.id]"
                  :content="connectionResults[project.id]?.message ?? ''"
                >
                  <button
                    class="connection-action"
                    :class="{
                      success: connectionResults[project.id]?.success,
                      failed: connectionResults[project.id]?.success === false,
                    }"
                    :disabled="testingConnectionId === project.id"
                    title="测试仓库与生产分支连接"
                    @click="testProjectConnection(project)"
                  >
                    <el-icon
                      :class="{ spinning: testingConnectionId === project.id }"
                    ><Connection /></el-icon>
                    <span>{{ testingConnectionId === project.id ? "测试中" : "测试连接" }}</span>
                  </button>
                </el-tooltip>
                <button title="编辑服务" @click="openEditProject(project)">
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </button>
                <button
                  class="danger"
                  title="删除服务"
                  @click="removeProject(project)"
                >
                  <el-icon><Delete /></el-icon><span>删除</span>
                </button>
              </div>
            </div>
          </div>

          <div v-else class="service-empty">
            <span>EMPTY SERVICE CATALOG</span>
            <h2>还没有接入服务</h2>
            <p>添加 Codeup 仓库后，就可以在发布分析页检测生产版本。</p>
            <button class="primary-action" @click="openCreateProject">
              添加服务
            </button>
          </div>
        </section>
      </template>

    </main>

    <el-dialog
      v-model="inspectionLogVisible"
      width="920px"
      class="inspection-log-dialog"
      append-to-body
    >
      <template #header>
        <div class="inspection-dialog-header">
          <span>巡检日志</span>
          <button
            class="dialog-refresh-action"
            :disabled="inspectionLogLoading"
            title="刷新巡检日志"
            aria-label="刷新巡检日志"
            @click="loadInspectionLogs()"
          >
            <el-icon :class="{ spinning: inspectionLogLoading }"><Refresh /></el-icon>
          </button>
        </div>
      </template>

      <div class="inspection-log-filters">
        <el-select
          v-model="inspectionLogFilters.projectId"
          placeholder="全部服务"
          clearable
        >
          <el-option
            v-for="project in projects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>
        <el-select
          v-model="inspectionLogFilters.status"
          placeholder="全部结果"
          clearable
        >
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILED" />
          <el-option label="执行中" value="RUNNING" />
        </el-select>
        <el-select
          v-model="inspectionLogFilters.triggerType"
          placeholder="全部触发方式"
          clearable
        >
          <el-option label="定时巡检" value="SCHEDULED" />
          <el-option label="手动巡检" value="MANUAL" />
        </el-select>
        <button class="log-query-action" @click="loadInspectionLogs(true)">
          查询
        </button>
        <button class="log-reset-action" @click="resetInspectionLogFilters">
          重置
        </button>
      </div>

      <div class="inspection-log-table" v-loading="inspectionLogLoading">
        <div class="inspection-log-head">
          <span>开始时间</span>
          <span>服务</span>
          <span>触发方式</span>
          <span>结果</span>
          <span>检测版本</span>
          <span>耗时</span>
          <span>详情</span>
        </div>
        <div v-if="inspectionLogs.length" class="inspection-log-body">
          <div
            v-for="log in inspectionLogs"
            :key="log.id"
            class="inspection-log-row"
          >
            <time>{{ formatLogTime(log.startedAt) }}</time>
            <div class="inspection-log-service">
              <strong>{{ log.projectName }}</strong>
              <small>{{ log.projectCode }}</small>
            </div>
            <span class="trigger-badge" :class="log.triggerType.toLowerCase()">
              {{ log.triggerType === "SCHEDULED" ? "定时巡检" : "手动巡检" }}
            </span>
            <el-tooltip
              placement="top"
              :disabled="!log.errorMessage"
              :content="log.errorMessage ?? ''"
            >
              <span class="log-status" :class="log.status.toLowerCase()">
                <i></i>
                {{
                  log.status === "SUCCESS"
                    ? `成功 · ${log.pendingCommitCount} 个待分析`
                    : log.status === "FAILED"
                      ? "失败"
                      : "执行中"
                }}
              </span>
            </el-tooltip>
            <code :title="log.detectedCommit ?? ''">
              {{ shortCommit(log.detectedCommit) }}
            </code>
            <span class="inspection-duration">{{ inspectionDuration(log) }}</span>
            <button
              v-if="log.status === 'FAILED'"
              class="inspection-detail-action"
              @click="showInspectionError(log)"
            >
              查看
            </button>
            <span v-else class="inspection-detail-empty">—</span>
          </div>
        </div>
        <div v-else-if="!inspectionLogLoading" class="inspection-log-empty">
          暂无巡检日志，执行一次巡检后会显示在这里
        </div>
      </div>
      <div class="inspection-log-footer">
        <span>
          第 {{ inspectionLogPage }} / {{ inspectionLogTotalPages }} 页，共
          {{ inspectionLogTotal }} 条
        </span>
        <div>
          <button
            :disabled="inspectionLogPage <= 1 || inspectionLogLoading"
            @click="changeInspectionLogPage(inspectionLogPage - 1)"
          >
            上一页
          </button>
          <button
            :disabled="
              inspectionLogPage >= inspectionLogTotalPages || inspectionLogLoading
            "
            @click="changeInspectionLogPage(inspectionLogPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="dialogVisible"
      :title="editingProjectId ? '编辑服务' : '接入 Codeup 服务'"
      width="520px"
    >
      <el-form label-position="top" @submit.prevent="saveProject">
        <div class="form-row">
          <el-form-item label="服务名称">
            <el-input v-model="form.name" placeholder="例如：PC 工人端" />
          </el-form-item>
          <el-form-item label="服务编码">
            <el-input v-model="form.code" placeholder="pc-worker" />
          </el-form-item>
        </div>
        <el-form-item label="Codeup 仓库地址">
          <el-input
            v-model="form.repositoryUrl"
            placeholder="git@codeup.aliyun.com:team/repository.git"
          />
        </el-form-item>
        <el-form-item label="生产分支">
          <el-input v-model="form.productionBranch" placeholder="production" />
        </el-form-item>
      </el-form>
      <template #footer>
        <button class="dialog-secondary" @click="dialogVisible = false">
          取消
        </button>
        <button
          class="dialog-primary"
          :disabled="savingProject"
          @click="saveProject"
        >
          {{
            savingProject
              ? "保存中…"
              : editingProjectId
                ? "保存修改"
                : "确认接入"
          }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>
