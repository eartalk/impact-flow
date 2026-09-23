<script setup lang="ts">
import { provide, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import {
  Collection,
  DataAnalysis,
  Document,
  Setting,
  SwitchButton,
  User,
} from "@element-plus/icons-vue";
import { useWorkspaceController } from "./composables/useWorkspaceController";
import { WorkspaceContextKey } from "./workspace-context";
import InspectionLogsDialog from "./components/dialogs/InspectionLogsDialog.vue";
import ProjectDialog from "./components/dialogs/ProjectDialog.vue";
import AiConfigDialog from "./components/dialogs/AiConfigDialog.vue";
import WorkspaceSwitcher from "./components/workspace/WorkspaceSwitcher.vue";
import CreateWorkspaceDialog from "./components/workspace/CreateWorkspaceDialog.vue";
const workspace = useWorkspaceController();
provide(WorkspaceContextKey, workspace);
const route = useRoute();
const router = useRouter();
const {
  activeView,
  authLoading,
  authMode,
  authSubmitting,
  bootstrapRequired,
  bootstrapForm,
  canManageMembers,
  currentSession,
  loading,
  loginForm,
  registerAccountForm,
  registerWorkspaceForm,
  logout,
  openRegistration,
  showLogin,
  continueRegistration,
  backToRegisterAccount,
  submitRegistration,
  openBaseConfigView,
  openLogsView,
  openMembers,
  openWorkspaceSettings,
  isCurrentWorkspaceArchived,
  submitAuth,
} = workspace;

const routeNames = new Set([
  "analysis", "services", "logs", "members", "base-config", "workspace-settings",
]);
watch(
  () => route.name,
  (name) => {
    if (typeof name === "string" && routeNames.has(name)) {
      activeView.value = name as typeof activeView.value;
    }
  },
  { immediate: true },
);
watch(activeView, (view) => {
  if (route.name !== view) void router.replace({ name: view });
});
</script>

<template>
  <div v-if="authLoading" class="auth-loading">
    <div class="auth-loading-mark">IF</div>
    <span>正在连接 Impact Flow</span>
  </div>

  <main v-else-if="!currentSession" class="auth-page">
    <section class="auth-story">
      <div class="auth-brand"><b>IF</b><span>IMPACT FLOW</span></div>
      <div class="auth-story-copy">
        <small>RELEASE INTELLIGENCE</small>
        <h1>让每一次变更<br />都有清晰的影响边界</h1>
        <p>持续巡检生产分支，串联代码影响、调用链与回归范围。</p>
      </div>
      <div class="auth-signal" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    </section>

    <section class="auth-panel">
      <form
        v-if="bootstrapRequired || authMode === 'login'"
        class="auth-card"
        @submit.prevent="submitAuth"
      >
        <header>
          <span class="auth-step">{{ bootstrapRequired ? "首次使用" : "账号登录" }}</span>
          <h2>{{ bootstrapRequired ? "初始化工作空间" : "欢迎回来" }}</h2>
          <p>
            {{ bootstrapRequired
              ? "创建首位所有者账号，现有服务数据将归入该工作空间。"
              : "登录后继续查看服务巡检与变更分析。" }}
          </p>
        </header>

        <template v-if="bootstrapRequired">
          <label>
            <span>工作空间</span>
            <input v-model.trim="bootstrapForm.workspaceName" autocomplete="organization" />
          </label>
          <label>
            <span>显示名称</span>
            <input v-model.trim="bootstrapForm.displayName" autocomplete="name" />
          </label>
          <label>
            <span>管理员账号</span>
            <input v-model.trim="bootstrapForm.username" autocomplete="username" />
          </label>
          <label>
            <span>登录密码</span>
            <input v-model="bootstrapForm.password" type="password" autocomplete="new-password" placeholder="至少 8 个字符" />
          </label>
        </template>
        <template v-else>
          <label>
            <span>账号</span>
            <input v-model.trim="loginForm.username" autocomplete="username" autofocus />
          </label>
          <label>
            <span>密码</span>
            <input v-model="loginForm.password" type="password" autocomplete="current-password" />
          </label>
        </template>

        <button class="auth-submit" :disabled="authSubmitting">
          {{ authSubmitting ? "正在进入…" : bootstrapRequired ? "创建并进入" : "进入工作台" }}
        </button>
        <div v-if="!bootstrapRequired" class="auth-alternative">
          <span>还没有账号？</span>
          <button type="button" @click="openRegistration">新建账号</button>
        </div>
      </form>

      <form
        v-else-if="authMode === 'register-account'"
        class="auth-card"
        @submit.prevent="continueRegistration"
      >
        <header>
          <span class="auth-step">新账号</span>
          <h2>创建登录账号</h2>
          <p>填写账号信息，下一步可以为自己创建一个工作空间。</p>
        </header>
        <label>
          <span>显示名称</span>
          <input v-model.trim="registerAccountForm.displayName" autocomplete="name" autofocus />
        </label>
        <label>
          <span>登录账号</span>
          <input v-model.trim="registerAccountForm.username" autocomplete="username" />
        </label>
        <label>
          <span>登录密码</span>
          <input
            v-model="registerAccountForm.password"
            type="password"
            autocomplete="new-password"
            placeholder="至少 8 个字符"
          />
        </label>
        <label>
          <span>确认密码</span>
          <input
            v-model="registerAccountForm.confirmPassword"
            type="password"
            autocomplete="new-password"
          />
        </label>
        <button class="auth-submit">提交账号信息</button>
        <div class="auth-alternative">
          <span>已有账号？</span>
          <button type="button" @click="showLogin">返回登录</button>
        </div>
      </form>

      <form v-else class="auth-card" @submit.prevent="submitRegistration">
        <header>
          <span class="auth-step">创建工作空间</span>
          <h2>完成账号注册</h2>
          <p>你将成为该工作空间的所有者，创建成功后会自动登录。</p>
        </header>
        <label>
          <span>工作空间名称</span>
          <input v-model.trim="registerWorkspaceForm.name" autocomplete="organization" autofocus />
        </label>
        <label>
          <span>工作空间编码</span>
          <input
            v-model.trim="registerWorkspaceForm.code"
            autocomplete="off"
            placeholder="例如：product-team"
          />
        </label>
        <label>
          <span>工作空间描述（选填）</span>
          <input v-model.trim="registerWorkspaceForm.description" autocomplete="off" />
        </label>
        <button class="auth-submit" :disabled="authSubmitting">
          {{ authSubmitting ? "正在创建…" : "创建并进入工作空间" }}
        </button>
        <div class="auth-alternative">
          <button type="button" @click="backToRegisterAccount">返回修改账号信息</button>
        </div>
      </form>
    </section>
  </main>

  <div v-else class="shell" v-loading="loading">
    <aside class="rail">
      <div class="brand-mark"><b>IF</b><span>IMPACT FLOW</span></div>
      <div class="rail-workspace">
        <span class="rail-workspace-label">工作空间：</span>
        <WorkspaceSwitcher />
      </div>
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
          :class="{ active: activeView === 'logs' }"
          @click="openLogsView()"
        >
          <el-icon><Document /></el-icon>
          <span>日志管理</span>
        </button>
        <button
          v-if="canManageMembers"
          class="rail-button"
          :class="{ active: activeView === 'members' }"
          @click="openMembers"
        >
          <el-icon><User /></el-icon>
          <span>成员管理</span>
        </button>
        <button
          class="rail-button"
          :class="{ active: activeView === 'base-config' }"
          @click="openBaseConfigView"
        >
          <el-icon><Setting /></el-icon>
          <span>基础配置</span>
        </button>
      </nav>
      <div class="rail-status" title="API 服务状态">
        <span></span>
      </div>
      <div class="rail-account">
        <button
          class="rail-avatar rail-avatar-button"
          :class="{ active: activeView === 'workspace-settings' }"
          type="button"
          title="工作空间设置"
          aria-label="打开工作空间设置"
          @click="openWorkspaceSettings('profile')"
        >
          {{ currentSession.user.displayName.slice(0, 1) }}
        </button>
        <div class="rail-user-copy">
          <strong>{{ currentSession.user.displayName }}</strong>
          <span>@{{ currentSession.user.username }}</span>
        </div>
        <button
          class="rail-logout-button"
          type="button"
          title="退出登录"
          aria-label="退出登录"
          @click="logout"
        >
          <el-icon><SwitchButton /></el-icon>
        </button>
      </div>
    </aside>

    <main class="workspace">
      <div v-if="isCurrentWorkspaceArchived" class="archived-banner">
        <strong>工作空间已归档</strong>
        <span>当前为只读状态。所有者可前往「工作空间设置 → 危险操作」恢复。</span>
        <button @click="openWorkspaceSettings('danger')">去恢复</button>
      </div>
      <RouterView />
    </main>

    <InspectionLogsDialog />

    <ProjectDialog />

    <AiConfigDialog />

    <CreateWorkspaceDialog />

  </div>
</template>
