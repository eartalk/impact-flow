import { reactive, ref, type Ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { AuthSession, RegisterInput } from "@impact-flow/contracts";
import { api } from "../api";

export type AuthMode = "login" | "register-account" | "register-workspace";

interface AuthSessionDependencies {
  loadData(): Promise<void>;
  loadWorkspaces(): Promise<void>;
  loadWorkspaceCreationPolicy(): Promise<void>;
  startBackgroundTasks(): void;
  stopBackgroundTasks(): void;
  resetWorkspaceScopedState(): void;
  clearWorkspaces(): void;
  notifyError(error: unknown, fallback: string): void;
}

/** 登录、初始化与注册流程的唯一状态入口。 */
export function useAuthSession(deps: AuthSessionDependencies) {
  const authLoading = ref(true);
  const authSubmitting = ref(false);
  const bootstrapRequired = ref(false);
  const authMode = ref<AuthMode>("login");
  const currentSession: Ref<AuthSession | null> = ref(null);

  const loginForm = reactive({ username: "", password: "" });
  const registerAccountForm = reactive({
    displayName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const registerWorkspaceForm = reactive({
    name: "",
    code: "",
    description: "",
  });
  const bootstrapForm = reactive({
    username: "admin",
    password: "",
    displayName: "系统管理员",
    workspaceName: "Impact Flow 团队",
  });

  async function loadAuthenticatedWorkspace() {
    await Promise.all([deps.loadData(), deps.loadWorkspaces()]);
    void deps.loadWorkspaceCreationPolicy();
    deps.startBackgroundTasks();
  }

  async function initializeAuth() {
    authLoading.value = true;
    try {
      const status = await api.getBootstrapStatus();
      bootstrapRequired.value = status.required;
      if (!status.required) {
        try {
          currentSession.value = await api.getCurrentSession();
          await loadAuthenticatedWorkspace();
        } catch {
          currentSession.value = null;
        }
      }
    } catch (error) {
      deps.notifyError(error, "认证服务不可用");
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
      await loadAuthenticatedWorkspace();
    } catch (error) {
      deps.notifyError(error, "登录失败");
    } finally {
      authSubmitting.value = false;
    }
  }

  function openRegistration() {
    authMode.value = "register-account";
    loginForm.password = "";
  }

  function showLogin() {
    authMode.value = "login";
  }

  async function continueRegistration() {
    const username = registerAccountForm.username.trim();
    if (!registerAccountForm.displayName.trim()) {
      ElMessage.warning("请输入显示名称");
      return;
    }
    if (!/^[a-zA-Z0-9_.@-]{3,100}$/.test(username)) {
      ElMessage.warning("账号需为 3-100 位字母、数字或 . _ @ -");
      return;
    }
    if (registerAccountForm.password.length < 8) {
      ElMessage.warning("密码至少需要 8 个字符");
      return;
    }
    if (registerAccountForm.password !== registerAccountForm.confirmPassword) {
      ElMessage.warning("两次输入的密码不一致");
      return;
    }

    try {
      await ElMessageBox.confirm(
        "账号信息已填写完成，是否继续新建工作空间？",
        "继续完成注册",
        {
          confirmButtonText: "继续新建工作空间",
          cancelButtonText: "暂不创建",
          type: "info",
        },
      );
      if (!registerWorkspaceForm.code) {
        const code = username
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        registerWorkspaceForm.code = `${code || "team"}-workspace`.slice(0, 100);
      }
      authMode.value = "register-workspace";
    } catch {
      ElMessage.info("账号信息已保留，创建工作空间后即可完成注册");
    }
  }

  function backToRegisterAccount() {
    authMode.value = "register-account";
  }

  async function submitRegistration() {
    if (!registerWorkspaceForm.name.trim()) {
      ElMessage.warning("请输入工作空间名称");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(registerWorkspaceForm.code.trim())) {
      ElMessage.warning("工作空间编码需为 2-100 位小写字母、数字或连字符");
      return;
    }

    authSubmitting.value = true;
    const input: RegisterInput = {
      username: registerAccountForm.username,
      password: registerAccountForm.password,
      displayName: registerAccountForm.displayName,
      workspaceName: registerWorkspaceForm.name,
      workspaceCode: registerWorkspaceForm.code,
      workspaceDescription: registerWorkspaceForm.description || undefined,
    };
    try {
      currentSession.value = await api.register(input);
      registerAccountForm.password = "";
      registerAccountForm.confirmPassword = "";
      authMode.value = "login";
      await loadAuthenticatedWorkspace();
      ElMessage.success("账号和工作空间已创建");
    } catch (error) {
      deps.notifyError(error, "注册失败");
    } finally {
      authSubmitting.value = false;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      deps.stopBackgroundTasks();
      currentSession.value = null;
      deps.resetWorkspaceScopedState();
      deps.clearWorkspaces();
      authMode.value = "login";
    }
  }

  return {
    authLoading,
    authSubmitting,
    bootstrapRequired,
    authMode,
    currentSession,
    loginForm,
    registerAccountForm,
    registerWorkspaceForm,
    bootstrapForm,
    initializeAuth,
    submitAuth,
    openRegistration,
    showLogin,
    continueRegistration,
    backToRegisterAccount,
    submitRegistration,
    logout,
  };
}
