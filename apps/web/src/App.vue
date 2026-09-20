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
  Setting,
  Tickets,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AnalysisTask,
  AnalysisExecutionLog,
  AnalysisLogType,
  AiProviderConfig,
  AiProviderConnectionTest,
  CodeSymbolKind,
  CreateProjectInput,
  CreateAiProviderConfigInput,
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
const activeView = ref<"analysis" | "services" | "ai-config">("analysis");
const editingProjectId = ref<string | null>(null);
const savingProject = ref(false);
const detectingProjectId = ref<string | null>(null);
const rerunningProjectId = ref<string | null>(null);
const startingAiProjectId = ref<string | null>(null);
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
const analysisLogVisible = ref(false);
const analysisLogLoading = ref(false);
const analysisLogProject = ref<Project | null>(null);
const analysisLogType = ref<AnalysisLogType>("CHANGE_ANALYSIS");
const analysisLogs = ref<AnalysisExecutionLog[]>([]);
const analysisLogTotal = ref(0);
const analysisLogPage = ref(1);
const analysisLogTotalPages = ref(1);
const expandedProjectIds = ref<string[]>([]);
const analysisDetails = ref<Record<string, AnalysisTask>>({});
const expandedDetailSections = ref<string[]>([]);
const aiConfigs = ref<AiProviderConfig[]>([]);
const aiConfigLoading = ref(false);
const aiConfigDialogVisible = ref(false);
const editingAiConfigId = ref<string | null>(null);
const savingAiConfig = ref(false);
const testingAiConfigId = ref<string | null>(null);
const aiConnectionResults = ref<Record<string, AiProviderConnectionTest>>({});
let projectRefreshTimer: ReturnType<typeof setInterval> | undefined;
let analysisPollTimer: ReturnType<typeof setInterval> | undefined;

const form = reactive<CreateProjectInput>({
  name: "",
  code: "",
  repositoryUrl: "",
  productionBranch: "production",
});

const aiForm = reactive<CreateAiProviderConfigInput>({
  name: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  apiFormat: "OPENAI",
  enabled: true,
  isDefault: false,
  timeoutMs: 90000,
  maxFiles: 80,
  maxSymbols: 50,
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

async function loadAiConfigs() {
  aiConfigLoading.value = true;
  try {
    aiConfigs.value = await api.listAiConfigs();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    aiConfigLoading.value = false;
  }
}

function openAiConfigView() {
  activeView.value = "ai-config";
  void loadAiConfigs();
}

function resetAiForm() {
  Object.assign(aiForm, {
    name: "",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    apiFormat: "OPENAI",
    enabled: true,
    isDefault: !aiConfigs.value.length,
    timeoutMs: 90000,
    maxFiles: 80,
    maxSymbols: 50,
  });
}

function openCreateAiConfig() {
  editingAiConfigId.value = null;
  resetAiForm();
  aiConfigDialogVisible.value = true;
}

function openEditAiConfig(config: AiProviderConfig) {
  editingAiConfigId.value = config.id;
  Object.assign(aiForm, {
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: "",
    model: config.model,
    apiFormat: config.apiFormat,
    enabled: config.enabled,
    isDefault: config.isDefault,
    timeoutMs: config.timeoutMs,
    maxFiles: config.maxFiles,
    maxSymbols: config.maxSymbols,
  });
  aiConfigDialogVisible.value = true;
}

async function saveAiConfig() {
  if (!aiForm.name.trim() || !aiForm.baseUrl.trim() || !aiForm.model.trim()) {
    ElMessage.warning("请填写配置名称、API 地址和模型名称");
    return;
  }
  if (!editingAiConfigId.value && !aiForm.apiKey.trim()) {
    ElMessage.warning("请填写 API Key");
    return;
  }
  savingAiConfig.value = true;
  try {
    if (editingAiConfigId.value) {
      const { apiKey, ...input } = aiForm;
      await api.updateAiConfig(editingAiConfigId.value, {
        ...input,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
    } else {
      await api.createAiConfig({ ...aiForm, apiKey: aiForm.apiKey.trim() });
    }
    aiConfigDialogVisible.value = false;
    await loadAiConfigs();
    ElMessage.success(
      editingAiConfigId.value ? "AI 配置已更新" : "AI 配置已添加",
    );
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    savingAiConfig.value = false;
  }
}

async function toggleAiConfig(config: AiProviderConfig, enabled: boolean) {
  try {
    await api.updateAiConfig(config.id, { enabled });
    await loadAiConfigs();
    ElMessage.success(enabled ? "AI 配置已启用" : "AI 配置已停用");
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function makeDefaultAiConfig(config: AiProviderConfig) {
  try {
    await api.updateAiConfig(config.id, { isDefault: true, enabled: true });
    await loadAiConfigs();
    ElMessage.success(`已将“${config.name}”设为默认配置`);
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function testAiConfig(config: AiProviderConfig) {
  testingAiConfigId.value = config.id;
  try {
    const result = await api.testAiConfig(config.id);
    aiConnectionResults.value = {
      ...aiConnectionResults.value,
      [config.id]: result,
    };
    ElMessage.success(`${config.name} 连接成功，耗时 ${result.latencyMs}ms`);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    testingAiConfigId.value = null;
  }
}

async function removeAiConfig(config: AiProviderConfig) {
  try {
    await ElMessageBox.confirm(
      `确定删除 AI 配置“${config.name}”吗？`,
      "删除 AI 配置",
      {
        confirmButtonText: "确认删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    await api.deleteAiConfig(config.id);
    await loadAiConfigs();
    ElMessage.success("AI 配置已删除");
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error((error as Error).message);
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

function aiAnalysisIsActive(projectId: string) {
  return analysisFor(projectId)?.aiAnalysis?.status === "RUNNING";
}

function analysisStatusLabel(status: AnalysisTask["status"] | undefined) {
  return {
    READY: "等待分析",
    RUNNING: "变更分析中",
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

function confidenceLabel(confidence: "HIGH" | "MEDIUM" | "LOW" | undefined) {
  return { HIGH: "高置信", MEDIUM: "中置信", LOW: "低置信" }[
    confidence ?? "LOW"
  ];
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

type AnalysisDetailSection = "symbols" | "files";

function detailSectionKey(projectId: string, section: AnalysisDetailSection) {
  return `${analysisDetail(projectId)?.id ?? projectId}:${section}`;
}

function isDetailSectionExpanded(
  projectId: string,
  section: AnalysisDetailSection,
) {
  return expandedDetailSections.value.includes(
    detailSectionKey(projectId, section),
  );
}

function toggleDetailSection(
  projectId: string,
  section: AnalysisDetailSection,
) {
  const key = detailSectionKey(projectId, section);
  expandedDetailSections.value = expandedDetailSections.value.includes(key)
    ? expandedDetailSections.value.filter((item) => item !== key)
    : [...expandedDetailSections.value, key];
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
    project.previousDetectedCommit ??
    analysisFor(project.id)?.baseCommit ??
    null
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

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "执行中";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function analysisLogStatusLabel(status: AnalysisExecutionLog["status"]) {
  return {
    READY: "等待执行",
    RUNNING: "执行中",
    SUCCESS: "成功",
    FAILED: "失败",
    NO_CHANGES: "无变更",
    DISABLED: "未启用",
  }[status];
}

async function loadAnalysisLogs(resetPage = false) {
  if (!analysisLogProject.value) return;
  if (resetPage) analysisLogPage.value = 1;
  analysisLogLoading.value = true;
  try {
    const result = await api.listAnalysisLogs({
      projectId: analysisLogProject.value.id,
      type: analysisLogType.value,
      page: analysisLogPage.value,
      pageSize: 10,
    });
    analysisLogs.value = result.items;
    analysisLogTotal.value = result.total;
    analysisLogPage.value = result.page;
    analysisLogTotalPages.value = result.totalPages;
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    analysisLogLoading.value = false;
  }
}

function openAnalysisLogs(project: Project) {
  analysisLogProject.value = project;
  analysisLogType.value = "CHANGE_ANALYSIS";
  analysisLogPage.value = 1;
  analysisLogVisible.value = true;
  void loadAnalysisLogs();
}

function changeAnalysisLogType(type: AnalysisLogType) {
  if (analysisLogType.value === type) return;
  analysisLogType.value = type;
  void loadAnalysisLogs(true);
}

function changeAnalysisLogPage(page: number) {
  if (page < 1 || page > analysisLogTotalPages.value) return;
  analysisLogPage.value = page;
  void loadAnalysisLogs();
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
  void ElMessageBox.alert(
    log.errorMessage ?? "未记录失败原因",
    `${log.projectName} · 巡检失败`,
    {
      confirmButtonText: "关闭",
      customClass: "inspection-error-message",
    },
  );
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
        : `${project.name} 已提交变更分析`,
    );
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    detectingProjectId.value = null;
  }
}

async function rerunAnalysis(project: Project) {
  const source = analysisDetail(project.id);
  if (!source) return;

  rerunningProjectId.value = project.id;
  try {
    const task = await api.rerunAnalysis(source.id);
    analysisDetails.value = {
      ...analysisDetails.value,
      [project.id]: task,
    };
    analyses.value = [
      task,
      ...analyses.value.filter((item) => item.id !== task.id),
    ];
    ElMessage.success(
      `${project.name} 已重新提交变更分析`,
    );
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    rerunningProjectId.value = null;
  }
}

async function startAiAnalysis(project: Project) {
  const task = analysisFor(project.id);
  if (!task || task.status !== "SUCCESS") return;

  startingAiProjectId.value = project.id;
  try {
    const updated = await api.runAiAnalysis(task.id);
    analysisDetails.value = {
      ...analysisDetails.value,
      [project.id]: updated,
    };
    analyses.value = analyses.value.map((item) =>
      item.id === updated.id ? updated : item,
    );
    if (!expandedProjectIds.value.includes(project.id)) {
      expandedProjectIds.value = [...expandedProjectIds.value, project.id];
    }
    ElMessage.success(`${project.name} 已提交 AI 分析`);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    startingAiProjectId.value = null;
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
  if (
    !analyses.value.some(
      (task) =>
        ["READY", "RUNNING"].includes(task.status) ||
        task.aiAnalysis?.status === "RUNNING",
    )
  ) {
    return;
  }
  try {
    const previous = new Map(
      analyses.value.map((task) => [
        task.id,
        { status: task.status, aiStatus: task.aiAnalysis?.status },
      ]),
    );
    const next = await api.listAnalyses();
    analyses.value = next;
    const completed = next.filter((task) => {
      const old = previous.get(task.id);
      return (
        (["READY", "RUNNING"].includes(old?.status ?? "") &&
          !["READY", "RUNNING"].includes(task.status)) ||
        (old?.aiStatus === "RUNNING" && task.aiAnalysis?.status !== "RUNNING")
      );
    });
    for (const task of completed) {
      const detail = await api.getAnalysis(task.id);
      analysisDetails.value = {
        ...analysisDetails.value,
        [task.projectId]: detail,
      };
    }
    if (
      completed.some((task) =>
        !["READY", "RUNNING"].includes(task.status),
      )
    ) {
      projects.value = await api.listProjects();
    }
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
        <button
          class="rail-button"
          :class="{ active: activeView === 'ai-config' }"
          @click="openAiConfigView"
        >
          <el-icon><Setting /></el-icon>
          <span>AI 配置</span>
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
              <button class="inspection-log-action" @click="openInspectionLogs">
                <el-icon><Tickets /></el-icon>
                巡检日志
              </button>
              <button
                class="inspect-all-action"
                :disabled="checkingAll"
                @click="inspectAllProjects"
              >
                <el-icon :class="{ spinning: checkingAll }"
                  ><Refresh
                /></el-icon>
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
            <span>上一分析版本号</span>
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
                  :title="currentVersion(project) ?? '尚未分析'"
                >
                  {{ shortCommit(currentVersion(project)) }}
                </code>
                <code
                  class="version-code"
                  :title="previousVersion(project) ?? '尚未分析'"
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
                      project.lastCheckedAt ? project.pendingCommitCount : "—"
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
                    {{
                      detectingProjectId === project.id ||
                      analysisIsActive(project.id)
                        ? "分析中…"
                        : "变更分析"
                    }}
                  </button>
                  <button
                    class="ai-analysis-action"
                    :disabled="
                      analysisFor(project.id)?.status !== 'SUCCESS' ||
                      analysisIsActive(project.id) ||
                      aiAnalysisIsActive(project.id) ||
                      startingAiProjectId === project.id
                    "
                    @click="startAiAnalysis(project)"
                  >
                    {{
                      aiAnalysisIsActive(project.id) ||
                      startingAiProjectId === project.id
                        ? "分析中"
                        : "AI 分析"
                    }}
                  </button>
                  <button
                    class="analysis-log-action"
                    @click="openAnalysisLogs(project)"
                  >
                    分析日志
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
                      {{
                        analysisStatusLabel(analysisDetail(project.id)?.status)
                      }}
                    </span>
                    <strong>变更分析结果</strong>
                  </div>
                  <div class="result-header-actions">
                    <div class="result-commits">
                      <code>{{
                        shortCommit(analysisDetail(project.id)?.baseCommit)
                      }}</code>
                      <el-icon><ArrowRight /></el-icon>
                      <code>{{
                        shortCommit(analysisDetail(project.id)?.targetCommit)
                      }}</code>
                    </div>
                    <button
                      class="rerun-analysis-action"
                      :disabled="
                        analysisIsActive(project.id) ||
                        rerunningProjectId === project.id
                      "
                      title="使用相同版本区间重新执行变更分析"
                      @click="rerunAnalysis(project)"
                    >
                      <el-icon
                        :class="{
                          spinning:
                            analysisIsActive(project.id) ||
                            rerunningProjectId === project.id,
                        }"
                      >
                        <Refresh />
                      </el-icon>
                      {{
                        analysisIsActive(project.id) ||
                        rerunningProjectId === project.id
                          ? "分析中"
                          : "重新分析"
                      }}
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    ['READY', 'RUNNING'].includes(
                      analysisDetail(project.id)?.status ?? '',
                    )
                  "
                  class="analysis-running-state"
                >
                  <span class="analysis-running-indicator"></span>
                  <div>
                    <strong>后台正在执行变更分析</strong>
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
                      <strong
                        >+{{ analysisDetail(project.id)?.additions }}</strong
                      >
                    </div>
                    <div class="negative">
                      <span>删除行</span>
                      <strong
                        >-{{ analysisDetail(project.id)?.deletions }}</strong
                      >
                    </div>
                  </div>

                  <section
                    v-if="analysisDetail(project.id)?.riskLevel"
                    class="impact-analysis"
                  >
                    <div class="impact-overview">
                      <span
                        class="risk-badge"
                        :class="
                          analysisDetail(project.id)?.riskLevel?.toLowerCase()
                        "
                      >
                        {{
                          riskLabel(
                            analysisDetail(project.id)?.riskLevel ?? null,
                          )
                        }}
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
                            v-for="module in analysisDetail(project.id)
                              ?.impactedModules"
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
                            v-for="suggestion in analysisDetail(project.id)
                              ?.regressionSuggestions"
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
                    v-if="
                      analysisDetail(project.id)?.aiAnalysis &&
                      analysisDetail(project.id)?.aiAnalysis?.status !==
                        'DISABLED'
                    "
                    class="ai-analysis"
                    :class="
                      analysisDetail(
                        project.id,
                      )?.aiAnalysis?.status.toLowerCase()
                    "
                  >
                    <header class="ai-analysis-header">
                      <span class="ai-analysis-icon"><DataAnalysis /></span>
                      <div>
                        <strong>AI 分析</strong>
                        <p v-if="analysisDetail(project.id)?.aiAnalysis?.model">
                          {{ analysisDetail(project.id)?.aiAnalysis?.model }} ·
                          AI 结论不覆盖规则结果
                        </p>
                      </div>
                      <span
                        v-if="analysisDetail(project.id)?.aiAnalysis?.riskLevel"
                        class="risk-badge"
                        :class="
                          analysisDetail(
                            project.id,
                          )?.aiAnalysis?.riskLevel?.toLowerCase()
                        "
                      >
                        {{
                          riskLabel(
                            analysisDetail(project.id)?.aiAnalysis?.riskLevel ??
                              null,
                          )
                        }}
                      </span>
                    </header>
                    <div
                      v-if="
                        analysisDetail(project.id)?.aiAnalysis?.status ===
                        'RUNNING'
                      "
                      class="analysis-running-state ai-running-state"
                    >
                      <span class="analysis-running-indicator"></span>
                      <div>
                        <strong>AI 正在分析变更分析结果</strong>
                        <p>只调用 AI，不会重新拉取 Git 或执行 Symbol 分析。</p>
                      </div>
                    </div>
                    <div
                      v-else-if="
                        analysisDetail(project.id)?.aiAnalysis?.status ===
                        'SUCCESS'
                      "
                      class="ai-analysis-content"
                    >
                      <p class="ai-analysis-summary">
                        {{ analysisDetail(project.id)?.aiAnalysis?.summary }}
                      </p>
                      <div class="ai-analysis-columns">
                        <div class="ai-findings-panel">
                          <h4>关键发现</h4>
                          <ul class="ai-finding-list">
                            <li
                              v-for="finding in analysisDetail(project.id)
                                ?.aiAnalysis?.keyFindings"
                              :key="finding"
                            >
                              {{ finding }}
                            </li>
                          </ul>
                        </div>
                        <div class="ai-regression-scopes">
                          <h4>可执行回归范围</h4>
                          <article
                              v-for="suggestion in analysisDetail(project.id)
                                ?.aiAnalysis?.regressionSuggestions"
                              :key="suggestion.title"
                            >
                              <header>
                                <span>{{ suggestion.priority }}</span>
                                <strong>{{ suggestion.title }}</strong>
                                <em
                                  :class="suggestion.confidence?.toLowerCase()"
                                >{{ confidenceLabel(suggestion.confidence) }}</em>
                              </header>
                              <p class="ai-scope-summary">{{ suggestion.scope }}</p>

                              <div
                                v-if="suggestion.entryPoints?.length"
                                class="ai-entry-points"
                              >
                                <span
                                  v-for="entry in suggestion.entryPoints"
                                  :key="entry"
                                >{{ entry }}</span>
                              </div>

                              <div
                                v-if="
                                  suggestion.scenarios?.length ||
                                  suggestion.steps?.length ||
                                  suggestion.expectedResults?.length
                                "
                                class="ai-scope-grid"
                              >
                                <section v-if="suggestion.scenarios?.length">
                                  <h5>回归场景</h5>
                                  <ul>
                                    <li
                                      v-for="scenario in suggestion.scenarios"
                                      :key="scenario"
                                    >{{ scenario }}</li>
                                  </ul>
                                </section>
                                <section v-if="suggestion.steps?.length">
                                  <h5>执行步骤</h5>
                                  <ol>
                                    <li
                                      v-for="step in suggestion.steps"
                                      :key="step"
                                    >{{ step }}</li>
                                  </ol>
                                </section>
                                <section v-if="suggestion.expectedResults?.length">
                                  <h5>预期结果</h5>
                                  <ul>
                                    <li
                                      v-for="expected in suggestion.expectedResults"
                                      :key="expected"
                                    >{{ expected }}</li>
                                  </ul>
                                </section>
                              </div>

                              <footer v-if="suggestion.evidence?.length">
                                <strong>判断依据</strong>
                                <code
                                  v-for="evidence in suggestion.evidence"
                                  :key="evidence"
                                >{{ evidence }}</code>
                              </footer>
                            </article>
                        </div>
                      </div>
                    </div>
                    <p v-else class="ai-analysis-error">
                      AI 分析未完成：{{
                        analysisDetail(project.id)?.aiAnalysis?.errorMessage
                      }}
                    </p>
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
                      <button
                        class="detail-toggle"
                        type="button"
                        :aria-expanded="
                          isDetailSectionExpanded(project.id, 'symbols')
                        "
                        :aria-label="
                          isDetailSectionExpanded(project.id, 'symbols')
                            ? '收起 TypeScript Symbol 影响'
                            : '展开 TypeScript Symbol 影响'
                        "
                        :title="
                          isDetailSectionExpanded(project.id, 'symbols')
                            ? '收起'
                            : '展开'
                        "
                        @click="toggleDetailSection(project.id, 'symbols')"
                      >
                        <el-icon>
                          <ArrowUp
                            v-if="
                              isDetailSectionExpanded(project.id, 'symbols')
                            "
                          />
                          <ArrowDown v-else />
                        </el-icon>
                      </button>
                    </header>

                    <template
                      v-if="isDetailSectionExpanded(project.id, 'symbols')"
                    >
                      <div
                        v-if="analysisDetail(project.id)?.symbolChanges?.length"
                        class="symbol-analysis-grid"
                      >
                      <div class="symbol-change-panel">
                        <h4>
                          变更 Symbol
                          <span>{{
                            analysisDetail(project.id)?.symbolChanges?.length
                          }}</span>
                        </h4>
                        <div class="symbol-change-list">
                          <article
                            v-for="symbol in analysisDetail(
                              project.id,
                            )?.symbolChanges?.slice(0, 12)"
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
                                  v-if="
                                    symbol.projectId &&
                                    symbol.projectId !== project.id
                                  "
                                  class="symbol-project-badge"
                                  >{{ symbol.projectName }}</em
                                >
                                {{ symbol.qualifiedName }}
                              </strong>
                              <p>
                                {{ symbolKindLabel(symbol.kind) }} ·
                                {{ symbol.filePath }}:{{ symbol.startLine }}
                              </p>
                              <div
                                v-if="symbol.httpRoutes?.length"
                                class="symbol-http-routes"
                              >
                                <span
                                  v-for="route in symbol.httpRoutes"
                                  :key="`${symbol.key}-${route.role}-${route.method}-${route.path}`"
                                  class="symbol-http-route"
                                  :class="route.role.toLowerCase()"
                                >
                                  {{ route.method }} {{ route.path }}
                                </span>
                              </div>
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
                          <span>{{
                            analysisDetail(project.id)?.symbolImpacts?.length ??
                            0
                          }}</span>
                        </h4>
                        <div
                          v-if="
                            analysisDetail(project.id)?.symbolImpacts?.length
                          "
                          class="symbol-chain-list"
                        >
                          <article
                            v-for="impact in analysisDetail(
                              project.id,
                            )?.symbolImpacts?.slice(0, 10)"
                            :key="`${impact.changedSymbolKey}-${impact.impactedSymbol.key}`"
                            :title="impact.reason"
                          >
                            <div class="symbol-chain-depth">
                              {{ impact.depth }} 层
                            </div>
                            <div class="symbol-chain-path">
                              <template
                                v-for="(node, index) in impact.callChain"
                                :key="node.key"
                              >
                                <em
                                  v-if="
                                    node.projectId &&
                                    node.projectId !== project.id
                                  "
                                  class="symbol-project-badge"
                                  >{{ node.projectName }}</em
                                >
                                <code>{{ node.qualifiedName }}</code>
                                <span
                                  v-for="route in node.httpRoutes"
                                  :key="`${node.key}-${route.role}-${route.method}-${route.path}`"
                                  class="symbol-http-route"
                                  :class="route.role.toLowerCase()"
                                >
                                  {{ route.method }} {{ route.path }}
                                </span>
                                <ArrowRight
                                  v-if="index < impact.callChain.length - 1"
                                />
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
                        本次 TypeScript
                        变更没有落在可识别的类、方法、函数或类型上。
                      </div>
                    </template>
                  </section>

                  <section
                    v-if="analysisDetail(project.id)?.files?.length"
                    class="detail-disclosure"
                  >
                    <header class="detail-disclosure-header">
                      <div>
                        <strong>具体变动文件</strong>
                        <p>
                          共 {{ analysisDetail(project.id)?.files?.length ?? 0 }}
                          个文件，需要时展开查看路径和增删行数
                        </p>
                      </div>
                      <button
                        class="detail-toggle"
                        type="button"
                        :aria-expanded="
                          isDetailSectionExpanded(project.id, 'files')
                        "
                        :aria-label="
                          isDetailSectionExpanded(project.id, 'files')
                            ? '收起具体变动文件'
                            : '展开具体变动文件'
                        "
                        :title="
                          isDetailSectionExpanded(project.id, 'files')
                            ? '收起'
                            : '展开'
                        "
                        @click="toggleDetailSection(project.id, 'files')"
                      >
                        <el-icon>
                          <ArrowUp
                            v-if="
                              isDetailSectionExpanded(project.id, 'files')
                            "
                          />
                          <ArrowDown v-else />
                        </el-icon>
                      </button>
                    </header>
                    <div
                      v-if="isDetailSectionExpanded(project.id, 'files')"
                      class="file-table detail-file-table"
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
                  </section>

                  <div
                    v-else-if="analysisDetail(project.id)?.status !== 'RUNNING'"
                    class="no-file-change"
                  >
                    本次分析没有文件变更
                  </div>
                </template>
              </section>
            </div>
          </div>

          <div v-else class="release-empty">
            <span>NO SERVICES</span>
            <h2>还没有可以分析的服务</h2>
            <p>先添加服务和生产分支，发布分析列表会自动生成。</p>
            <button class="primary-action" @click="openCreateProject">
              添加服务
            </button>
          </div>
        </section>
      </template>

      <template v-else-if="activeView === 'services'">
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
                      ><Connection
                    /></el-icon>
                    <span>{{
                      testingConnectionId === project.id ? "测试中" : "测试连接"
                    }}</span>
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
            <p>添加 Codeup 仓库后，就可以在发布分析页分析生产版本。</p>
            <button class="primary-action" @click="openCreateProject">
              添加服务
            </button>
          </div>
        </section>
      </template>

      <template v-else>
        <header class="topbar ai-config-topbar">
          <div class="page-title">
            <h1>AI 配置</h1>
            <span
              >管理多个 OpenAI 或 Anthropic 兼容接口，默认配置用于发布分析</span
            >
          </div>
          <button class="add-project" @click="openCreateAiConfig">
            <el-icon><Plus /></el-icon>
            添加 AI 配置
          </button>
        </header>

        <section class="ai-config-summary">
          <div class="ai-config-summary-count">
            <span>配置总数</span>
            <strong>{{ aiConfigs.length }}</strong>
          </div>
          <div class="ai-config-summary-count active">
            <span>已启用</span>
            <strong>{{
              aiConfigs.filter((item) => item.enabled).length
            }}</strong>
          </div>
          <p>
            <b>运行规则</b>
            每次发布分析只调用一条“默认且已启用”的配置；API Key
            已加密保存，页面仅显示末四位。
          </p>
        </section>

        <section class="ai-config-panel" v-loading="aiConfigLoading">
          <div class="ai-config-table-head">
            <span>配置</span>
            <span>接口与模型</span>
            <span>分析限额</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          <div v-if="aiConfigs.length" class="ai-config-table-body">
            <article
              v-for="config in aiConfigs"
              :key="config.id"
              class="ai-config-record"
            >
              <div class="ai-config-identity">
                <span class="ai-provider-mark">AI</span>
                <div>
                  <strong>{{ config.name }}</strong>
                  <small>{{ config.apiKeyMasked }}</small>
                </div>
                <em v-if="config.isDefault">默认</em>
              </div>
              <div class="ai-config-endpoint">
                <code :title="config.baseUrl">{{ config.baseUrl }}</code>
                <span>{{ config.model }}</span>
                <small>{{
                  config.apiFormat === "ANTHROPIC"
                    ? "Anthropic Messages"
                    : "OpenAI Chat Completions"
                }}</small>
              </div>
              <div class="ai-config-limits">
                <span>{{ config.timeoutMs / 1000 }}s 超时</span>
                <span>{{ config.maxFiles }} 文件</span>
                <span>{{ config.maxSymbols }} Symbol</span>
              </div>
              <div class="ai-config-state">
                <button
                  class="state-toggle"
                  :class="{ enabled: config.enabled }"
                  @click="toggleAiConfig(config, !config.enabled)"
                >
                  <i></i>{{ config.enabled ? "已启用" : "已停用" }}
                </button>
                <small v-if="aiConnectionResults[config.id]">
                  最近测试 {{ aiConnectionResults[config.id].latencyMs }}ms
                </small>
              </div>
              <div class="record-actions ai-config-actions">
                <button
                  class="connection-action"
                  :disabled="testingAiConfigId === config.id"
                  @click="testAiConfig(config)"
                >
                  <el-icon
                    :class="{ spinning: testingAiConfigId === config.id }"
                    ><Connection
                  /></el-icon>
                  <span>{{
                    testingAiConfigId === config.id ? "测试中" : "测试"
                  }}</span>
                </button>
                <button
                  v-if="!config.isDefault"
                  @click="makeDefaultAiConfig(config)"
                >
                  设为默认
                </button>
                <button title="编辑配置" @click="openEditAiConfig(config)">
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </button>
                <button
                  class="danger"
                  title="删除配置"
                  @click="removeAiConfig(config)"
                >
                  <el-icon><Delete /></el-icon><span>删除</span>
                </button>
              </div>
            </article>
          </div>
          <div v-else class="ai-config-empty">
            <span>NO AI PROVIDER</span>
            <h2>还没有 AI 接口配置</h2>
            <p>添加一个 OpenAI 兼容接口，测试成功后设为默认配置。</p>
            <button class="primary-action" @click="openCreateAiConfig">
              添加 AI 配置
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
            <el-icon :class="{ spinning: inspectionLogLoading }"
              ><Refresh
            /></el-icon>
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
            <span class="inspection-duration">{{
              inspectionDuration(log)
            }}</span>
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
              inspectionLogPage >= inspectionLogTotalPages ||
              inspectionLogLoading
            "
            @click="changeInspectionLogPage(inspectionLogPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="analysisLogVisible"
      width="980px"
      class="analysis-log-dialog"
      append-to-body
    >
      <template #header>
        <div class="inspection-dialog-header">
          <div>
            <span>分析日志</span>
            <small v-if="analysisLogProject">
              {{ analysisLogProject.name }}
            </small>
          </div>
          <button
            class="dialog-refresh-action"
            :disabled="analysisLogLoading"
            title="刷新分析日志"
            aria-label="刷新分析日志"
            @click="loadAnalysisLogs()"
          >
            <el-icon :class="{ spinning: analysisLogLoading }">
              <Refresh />
            </el-icon>
          </button>
        </div>
      </template>

      <div class="analysis-log-tabs">
        <button
          :class="{ active: analysisLogType === 'CHANGE_ANALYSIS' }"
          @click="changeAnalysisLogType('CHANGE_ANALYSIS')"
        >
          变更分析日志
        </button>
        <button
          :class="{ active: analysisLogType === 'AI_ANALYSIS' }"
          @click="changeAnalysisLogType('AI_ANALYSIS')"
        >
          AI 分析日志
        </button>
      </div>

      <div class="analysis-log-table" v-loading="analysisLogLoading">
        <div
          class="analysis-log-row analysis-log-head"
          :class="{ 'is-ai': analysisLogType === 'AI_ANALYSIS' }"
        >
          <span>开始时间</span>
          <span>版本区间</span>
          <span>结果</span>
          <span v-if="analysisLogType === 'AI_ANALYSIS'">模型</span>
          <span v-if="analysisLogType === 'AI_ANALYSIS'">Token</span>
          <span>耗时</span>
          <span>详情</span>
        </div>
        <div v-if="analysisLogs.length" class="analysis-log-body">
          <div
            v-for="log in analysisLogs"
            :key="log.id"
            class="analysis-log-row"
            :class="{ 'is-ai': analysisLogType === 'AI_ANALYSIS' }"
          >
            <time>{{ formatLogTime(log.startedAt) }}</time>
            <div class="analysis-log-commits">
              <code :title="log.baseCommit">{{ shortCommit(log.baseCommit) }}</code>
              <el-icon><ArrowRight /></el-icon>
              <code :title="log.targetCommit">{{ shortCommit(log.targetCommit) }}</code>
            </div>
            <el-tooltip
              placement="top"
              :disabled="!log.errorMessage"
              :content="log.errorMessage ?? ''"
            >
              <span class="log-status" :class="log.status.toLowerCase()">
                <i></i>{{ analysisLogStatusLabel(log.status) }}
              </span>
            </el-tooltip>
            <code
              v-if="analysisLogType === 'AI_ANALYSIS'"
              class="analysis-log-model"
              :title="log.model ?? ''"
            >{{ log.model ?? '—' }}</code>
            <span
              v-if="analysisLogType === 'AI_ANALYSIS'"
              class="analysis-log-token"
            >{{ log.tokenUsage?.total ?? '—' }}</span>
            <span>{{ formatDuration(log.durationMs) }}</span>
            <button
              v-if="log.errorMessage"
              class="inspection-detail-action"
              @click="
                ElMessageBox.alert(
                  log.errorMessage,
                  `${log.projectName} · ${
                    log.type === 'AI_ANALYSIS' ? 'AI 分析失败' : '变更分析失败'
                  }`,
                  { confirmButtonText: '关闭' },
                )
              "
            >
              查看
            </button>
            <span v-else class="inspection-detail-empty">—</span>
          </div>
        </div>
        <div v-else-if="!analysisLogLoading" class="inspection-log-empty">
          暂无{{ analysisLogType === "AI_ANALYSIS" ? "AI 分析" : "变更分析" }}日志
        </div>
      </div>

      <div class="inspection-log-footer">
        <span>
          第 {{ analysisLogPage }} / {{ analysisLogTotalPages }} 页，共
          {{ analysisLogTotal }} 条
        </span>
        <div>
          <button
            :disabled="analysisLogPage <= 1 || analysisLogLoading"
            @click="changeAnalysisLogPage(analysisLogPage - 1)"
          >上一页</button>
          <button
            :disabled="
              analysisLogPage >= analysisLogTotalPages || analysisLogLoading
            "
            @click="changeAnalysisLogPage(analysisLogPage + 1)"
          >下一页</button>
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

    <el-dialog
      v-model="aiConfigDialogVisible"
      :title="editingAiConfigId ? '编辑 AI 配置' : '添加 AI 配置'"
      width="620px"
      class="ai-config-dialog"
    >
      <el-form label-position="top" @submit.prevent="saveAiConfig">
        <div class="form-row">
          <el-form-item label="配置名称">
            <el-input
              v-model="aiForm.name"
              placeholder="例如：DeepSeek 生产接口"
            />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input
              v-model="aiForm.model"
              placeholder="例如：deepseek-chat"
            />
          </el-form-item>
        </div>
        <el-form-item label="接口协议">
          <el-radio-group v-model="aiForm.apiFormat">
            <el-radio-button value="OPENAI"
              >OpenAI Chat Completions</el-radio-button
            >
            <el-radio-button value="ANTHROPIC"
              >Anthropic Messages</el-radio-button
            >
          </el-radio-group>
        </el-form-item>
        <el-form-item label="API 地址">
          <el-input
            v-model="aiForm.baseUrl"
            placeholder="https://api.example.com/v1"
          />
        </el-form-item>
        <el-form-item
          :label="editingAiConfigId ? 'API Key（留空则不修改）' : 'API Key'"
        >
          <el-input
            v-model="aiForm.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="sk-..."
          />
        </el-form-item>
        <div class="form-row ai-number-row">
          <el-form-item label="超时时间（毫秒）">
            <el-input-number
              v-model="aiForm.timeoutMs"
              :min="1000"
              :max="300000"
              :step="1000"
            />
          </el-form-item>
          <el-form-item label="最多文件数">
            <el-input-number v-model="aiForm.maxFiles" :min="1" :max="500" />
          </el-form-item>
          <el-form-item label="最多 Symbol 数">
            <el-input-number v-model="aiForm.maxSymbols" :min="1" :max="500" />
          </el-form-item>
        </div>
        <div class="ai-config-switches">
          <el-checkbox v-model="aiForm.enabled">启用此配置</el-checkbox>
          <el-checkbox v-model="aiForm.isDefault">设为默认分析配置</el-checkbox>
        </div>
      </el-form>
      <template #footer>
        <button class="dialog-secondary" @click="aiConfigDialogVisible = false">
          取消
        </button>
        <button
          class="dialog-primary"
          :disabled="savingAiConfig"
          @click="saveAiConfig"
        >
          {{
            savingAiConfig
              ? "保存中…"
              : editingAiConfigId
                ? "保存修改"
                : "确认添加"
          }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>
