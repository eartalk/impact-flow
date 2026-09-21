import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  AnalysisTask,
  AnalysisExecutionLog,
  AutomationConfig,
  AiProviderConfig,
  AiProviderConnectionTest,
  CodeSymbolKind,
  CreateProjectInput,
  CreateAiProviderConfigInput,
  InspectionLog,
  InspectionLogQuery,
  NotificationDeliveryLog,
  PendingNotificationConfig,
  Project,
  RepositoryConnectionTest,
  AuthSession,
  CreateWorkspaceMemberInput,
  WorkspaceMember,
} from "@impact-flow/contracts";
import { api } from "../api";

export function useWorkspaceController() {
const projects = ref<Project[]>([]);
const analyses = ref<AnalysisTask[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
type LogsTab = "CHANGE_ANALYSIS" | "AI_ANALYSIS" | "NOTIFICATION";

const LOGS_PAGE_SIZE = 10;

const activeView = ref<"analysis" | "services" | "base-config" | "logs">("analysis");
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
const logsTab = ref<LogsTab>("CHANGE_ANALYSIS");
const logsLoading = ref(false);
const logsProjectId = ref("");
const logsStatus = ref("");
const logsPage = ref(1);
const logsTotal = ref(0);
const logsTotalPages = ref(1);
const analysisLogs = ref<AnalysisExecutionLog[]>([]);
const deliveryLogs = ref<NotificationDeliveryLog[]>([]);
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
const pendingNotificationConfig = ref<PendingNotificationConfig | null>(null);
const pendingNotificationLoading = ref(false);
const savingPendingNotification = ref(false);
const testingPendingNotification = ref(false);
const automationConfig = ref<AutomationConfig | null>(null);
const automationConfigLoading = ref(false);
const savingAutomationConfig = ref(false);
const authLoading = ref(true);
const authSubmitting = ref(false);
const bootstrapRequired = ref(false);
const currentSession = ref<AuthSession | null>(null);
const membersVisible = ref(false);
const membersLoading = ref(false);
const members = ref<WorkspaceMember[]>([]);
const memberCreating = ref(false);
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

const pendingNotificationForm = reactive({
  enabled: false,
  dingTalkWebhook: "",
});

const automationForm = reactive({
  autoInspectionEnabled: true,
  autoChangeAnalysisEnabled: false,
  autoAiAnalysisEnabled: false,
});

const loginForm = reactive({ username: "", password: "" });
const bootstrapForm = reactive({
  username: "admin",
  password: "",
  displayName: "系统管理员",
  workspaceName: "Impact Flow 团队",
});
const memberForm = reactive<CreateWorkspaceMemberInput>({
  username: "",
  password: "",
  displayName: "",
  role: "MEMBER",
});

const canManageMembers = computed(() =>
  ["OWNER", "ADMIN"].includes(currentSession.value?.workspace.role ?? ""),
);
const memberFormValid = computed(() =>
  memberForm.displayName.trim().length > 0 &&
  /^[a-zA-Z0-9_.@-]{3,100}$/.test(memberForm.username.trim()) &&
  memberForm.password.length >= 8,
);

function startBackgroundTasks() {
  if (!projectRefreshTimer) {
    projectRefreshTimer = setInterval(async () => {
      try {
        projects.value = await api.listProjects();
      } catch {
        // 后台静默刷新失败时保留当前页面数据。
      }
    }, 30_000);
  }
  if (!analysisPollTimer) {
    analysisPollTimer = setInterval(() => void pollActiveAnalyses(), 2_000);
  }
}

function stopBackgroundTasks() {
  if (projectRefreshTimer) clearInterval(projectRefreshTimer);
  if (analysisPollTimer) clearInterval(analysisPollTimer);
  projectRefreshTimer = undefined;
  analysisPollTimer = undefined;
}

async function initializeAuth() {
  authLoading.value = true;
  try {
    const status = await api.getBootstrapStatus();
    bootstrapRequired.value = status.required;
    if (!status.required) {
      try {
        currentSession.value = await api.getCurrentSession();
        await loadData();
        startBackgroundTasks();
      } catch {
        currentSession.value = null;
      }
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "认证服务不可用");
  } finally {
    authLoading.value = false;
  }
}

async function submitAuth() {
  authSubmitting.value = true;
  try {
    currentSession.value = bootstrapRequired.value
      ? await api.bootstrap(bootstrapForm)
      : await api.login(loginForm);
    bootstrapRequired.value = false;
    loginForm.password = "";
    bootstrapForm.password = "";
    await loadData();
    startBackgroundTasks();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    authSubmitting.value = false;
  }
}

async function logout() {
  try {
    await api.logout();
  } finally {
    stopBackgroundTasks();
    currentSession.value = null;
    projects.value = [];
    analyses.value = [];
  }
}

async function openMembers() {
  membersVisible.value = true;
  membersLoading.value = true;
  try {
    members.value = await api.listMembers();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "成员加载失败");
  } finally {
    membersLoading.value = false;
  }
}

async function createMember() {
  if (!memberForm.displayName.trim()) {
    ElMessage.warning("请填写成员显示名称");
    return;
  }
  if (!/^[a-zA-Z0-9_.@-]{3,100}$/.test(memberForm.username.trim())) {
    ElMessage.warning("登录账号至少 3 位，只能使用字母、数字及 . _ @ -");
    return;
  }
  if (memberForm.password.length < 8) {
    ElMessage.warning("成员初始密码至少需要 8 个字符");
    return;
  }
  memberCreating.value = true;
  try {
    await api.createMember(memberForm);
    members.value = await api.listMembers();
    Object.assign(memberForm, {
      username: "",
      password: "",
      displayName: "",
      role: "MEMBER",
    });
    ElMessage.success("成员已创建");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "成员创建失败");
  } finally {
    memberCreating.value = false;
  }
}

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

async function loadPendingNotificationConfig() {
  pendingNotificationLoading.value = true;
  try {
    const config = await api.getPendingNotificationConfig();
    pendingNotificationConfig.value = config;
    pendingNotificationForm.enabled = config.enabled;
    pendingNotificationForm.dingTalkWebhook = "";
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    pendingNotificationLoading.value = false;
  }
}

async function loadAutomationConfig() {
  automationConfigLoading.value = true;
  try {
    const config = await api.getAutomationConfig();
    automationConfig.value = config;
    automationForm.autoInspectionEnabled = config.autoInspectionEnabled;
    automationForm.autoChangeAnalysisEnabled =
      config.autoChangeAnalysisEnabled;
    automationForm.autoAiAnalysisEnabled = config.autoAiAnalysisEnabled;
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    automationConfigLoading.value = false;
  }
}

function setAutoInspection(enabled: boolean) {
  automationForm.autoInspectionEnabled = enabled;
  if (!enabled) {
    automationForm.autoChangeAnalysisEnabled = false;
    automationForm.autoAiAnalysisEnabled = false;
  }
}

function setAutoChangeAnalysis(enabled: boolean) {
  automationForm.autoChangeAnalysisEnabled = enabled;
  if (enabled) automationForm.autoInspectionEnabled = true;
  if (!enabled) automationForm.autoAiAnalysisEnabled = false;
}

function setAutoAiAnalysis(enabled: boolean) {
  automationForm.autoAiAnalysisEnabled = enabled;
  if (enabled) {
    automationForm.autoInspectionEnabled = true;
    automationForm.autoChangeAnalysisEnabled = true;
  }
}

async function saveAutomationConfig() {
  savingAutomationConfig.value = true;
  try {
    const config = await api.updateAutomationConfig({ ...automationForm });
    automationConfig.value = config;
    automationForm.autoInspectionEnabled = config.autoInspectionEnabled;
    automationForm.autoChangeAnalysisEnabled =
      config.autoChangeAnalysisEnabled;
    automationForm.autoAiAnalysisEnabled = config.autoAiAnalysisEnabled;
    ElMessage.success('自动化流程配置已保存');
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    savingAutomationConfig.value = false;
  }
}

function openBaseConfigView() {
  activeView.value = "base-config";
  void Promise.all([
    loadAiConfigs(),
    loadAutomationConfig(),
    loadPendingNotificationConfig(),
  ]);
}

function openLogsView(tab: LogsTab = logsTab.value, projectId = "") {
  activeView.value = "logs";
  logsTab.value = tab;
  logsProjectId.value = projectId;
  logsStatus.value = "";
  void loadLogs(true);
}

async function loadLogs(resetPage = false) {
  if (resetPage) logsPage.value = 1;
  logsLoading.value = true;
  try {
    if (logsTab.value === "NOTIFICATION") {
      const result = await api.listNotificationDeliveryLogs({
        page: logsPage.value,
        pageSize: LOGS_PAGE_SIZE,
        projectId: logsProjectId.value || undefined,
        status: (logsStatus.value || undefined) as
          | NotificationDeliveryLog["status"]
          | undefined,
      });
      deliveryLogs.value = result.items;
      logsTotal.value = result.total;
      logsTotalPages.value = result.totalPages;
    } else {
      const result = await api.listAnalysisLogs({
        type: logsTab.value,
        page: logsPage.value,
        pageSize: LOGS_PAGE_SIZE,
        projectId: logsProjectId.value || undefined,
        status: (logsStatus.value || undefined) as
          | AnalysisExecutionLog["status"]
          | undefined,
      });
      analysisLogs.value = result.items;
      logsTotal.value = result.total;
      logsTotalPages.value = result.totalPages;
    }
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    logsLoading.value = false;
  }
}

function changeLogsTab(tab: LogsTab) {
  if (logsTab.value === tab) return;
  logsTab.value = tab;
  // 各 tab 的状态取值不同，切换时清空避免无效筛选
  logsStatus.value = "";
  void loadLogs(true);
}

function onLogsFilterChange() {
  void loadLogs(true);
}

function changeLogsPage(page: number) {
  if (page < 1 || page > logsTotalPages.value) return;
  logsPage.value = page;
  void loadLogs();
}

const LOGS_STATUS_OPTIONS: Record<LogsTab, Array<{ value: string; label: string }>> = {
  CHANGE_ANALYSIS: [
    { value: "SUCCESS", label: "成功" },
    { value: "FAILED", label: "失败" },
    { value: "RUNNING", label: "执行中" },
    { value: "READY", label: "等待执行" },
    { value: "NO_CHANGES", label: "无变更" },
  ],
  AI_ANALYSIS: [
    { value: "SUCCESS", label: "成功" },
    { value: "FAILED", label: "失败" },
    { value: "RUNNING", label: "执行中" },
    { value: "DISABLED", label: "未启用" },
  ],
  NOTIFICATION: [
    { value: "SUCCESS", label: "成功" },
    { value: "FAILED", label: "失败" },
  ],
};

const logsStatusOptions = computed(() => LOGS_STATUS_OPTIONS[logsTab.value]);

async function savePendingNotificationConfig() {
  savingPendingNotification.value = true;
  try {
    const webhook = pendingNotificationForm.dingTalkWebhook.trim();
    const config = await api.updatePendingNotificationConfig({
      enabled: pendingNotificationForm.enabled,
      ...(webhook ? { dingTalkWebhook: webhook } : {}),
    });
    pendingNotificationConfig.value = config;
    pendingNotificationForm.dingTalkWebhook = "";
    ElMessage.success("待检测通知配置已保存");
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    savingPendingNotification.value = false;
  }
}

async function testPendingNotification() {
  if (pendingNotificationForm.dingTalkWebhook.trim()) {
    ElMessage.warning("Webhook 有修改，请先保存后再测试");
    return;
  }
  testingPendingNotification.value = true;
  try {
    const result = await api.testPendingNotification();
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    testingPendingNotification.value = false;
  }
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

function deliveryStatusLabel(status: NotificationDeliveryLog["status"]) {
  return status === "SUCCESS" ? "成功" : "失败";
}

function openProjectAnalysisLogs(project: Project) {
  openLogsView("CHANGE_ANALYSIS", project.id);
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

onMounted(() => void initializeAuth());

onBeforeUnmount(() => {
  stopBackgroundTasks();
});

  return {
    projects,
    analyses,
    loading,
    dialogVisible,
    LOGS_PAGE_SIZE,
    activeView,
    editingProjectId,
    savingProject,
    detectingProjectId,
    rerunningProjectId,
    startingAiProjectId,
    testingConnectionId,
    connectionResults,
    detailLoadingProjectId,
    checkingAll,
    inspectionLogVisible,
    inspectionLogLoading,
    inspectionLogs,
    inspectionLogTotal,
    inspectionLogPage,
    inspectionLogTotalPages,
    inspectionLogFilters,
    logsTab,
    logsLoading,
    logsProjectId,
    logsStatus,
    logsPage,
    logsTotal,
    logsTotalPages,
    analysisLogs,
    deliveryLogs,
    expandedProjectIds,
    analysisDetails,
    expandedDetailSections,
    aiConfigs,
    aiConfigLoading,
    aiConfigDialogVisible,
    editingAiConfigId,
    savingAiConfig,
    testingAiConfigId,
    aiConnectionResults,
    pendingNotificationConfig,
    pendingNotificationLoading,
    savingPendingNotification,
    testingPendingNotification,
    automationConfig,
    automationConfigLoading,
    savingAutomationConfig,
    authLoading,
    authSubmitting,
    bootstrapRequired,
    currentSession,
    membersVisible,
    membersLoading,
    members,
    memberCreating,
    form,
    aiForm,
    pendingNotificationForm,
    automationForm,
    loginForm,
    bootstrapForm,
    memberForm,
    canManageMembers,
    memberFormValid,
    latestAnalysisByProject,
    shortCommit,
    logsStatusOptions,
    formatCheckedAt,
    formatLogTime,
    startBackgroundTasks,
    stopBackgroundTasks,
    initializeAuth,
    submitAuth,
    logout,
    openMembers,
    createMember,
    loadData,
    loadAiConfigs,
    loadPendingNotificationConfig,
    loadAutomationConfig,
    setAutoInspection,
    setAutoChangeAnalysis,
    setAutoAiAnalysis,
    saveAutomationConfig,
    openBaseConfigView,
    openLogsView,
    loadLogs,
    changeLogsTab,
    onLogsFilterChange,
    changeLogsPage,
    savePendingNotificationConfig,
    testPendingNotification,
    resetAiForm,
    openCreateAiConfig,
    openEditAiConfig,
    saveAiConfig,
    toggleAiConfig,
    makeDefaultAiConfig,
    testAiConfig,
    removeAiConfig,
    resetForm,
    openCreateProject,
    openEditProject,
    saveProject,
    removeProject,
    analysisFor,
    analysisIsActive,
    aiAnalysisIsActive,
    analysisStatusLabel,
    riskLabel,
    confidenceLabel,
    symbolKindLabel,
    symbolChangeLabel,
    analysisDetail,
    isExpanded,
    detailSectionKey,
    isDetailSectionExpanded,
    toggleDetailSection,
    toggleAnalysis,
    currentVersion,
    previousVersion,
    intervalVersions,
    pushState,
    inspectionDuration,
    formatDuration,
    analysisLogStatusLabel,
    deliveryStatusLabel,
    openProjectAnalysisLogs,
    loadInspectionLogs,
    openInspectionLogs,
    resetInspectionLogFilters,
    changeInspectionLogPage,
    showInspectionError,
    inspectAllProjects,
    startDetection,
    rerunAnalysis,
    startAiAnalysis,
    testProjectConnection,
    pollActiveAnalyses,
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
