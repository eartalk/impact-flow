<script setup lang="ts">
import { defineAsyncComponent, provide } from "vue";
import { Collection, DataAnalysis, Document, Setting, User } from "@element-plus/icons-vue";
import { useWorkspaceController } from "./composables/useWorkspaceController";
import { WorkspaceContextKey } from "./workspace-context";
import InspectionLogsDialog from "./components/dialogs/InspectionLogsDialog.vue";
import ProjectDialog from "./components/dialogs/ProjectDialog.vue";
import AiConfigDialog from "./components/dialogs/AiConfigDialog.vue";
import MembersDialog from "./components/dialogs/MembersDialog.vue";

const ReleaseAnalysisView = defineAsyncComponent(
  () => import("./views/ReleaseAnalysisView.vue"),
);
const ServicesView = defineAsyncComponent(
  () => import("./views/ServicesView.vue"),
);
const LogsView = defineAsyncComponent(() => import("./views/LogsView.vue"));
const SettingsView = defineAsyncComponent(
  () => import("./views/SettingsView.vue"),
);

const workspace = useWorkspaceController();
provide(WorkspaceContextKey, workspace);
const {
  activeView,
  authLoading,
  authSubmitting,
  bootstrapRequired,
  bootstrapForm,
  canManageMembers,
  currentSession,
  loading,
  loginForm,
  logout,
  openBaseConfigView,
  openLogsView,
  openMembers,
  submitAuth,
} = workspace;
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
        <p>持续巡检生产分支，串联代码影响、调用链与 AI 回归建议。</p>
      </div>
      <div class="auth-signal" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    </section>

    <section class="auth-panel">
      <form class="auth-card" @submit.prevent="submitAuth">
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
      </form>
    </section>
  </main>

  <div v-else class="shell" v-loading="loading">
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
          :class="{ active: activeView === 'logs' }"
          @click="openLogsView()"
        >
          <el-icon><Document /></el-icon>
          <span>日志管理</span>
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
      <div class="rail-account">
        <div class="rail-avatar">{{ currentSession.user.displayName.slice(0, 1) }}</div>
        <div>
          <strong>{{ currentSession.user.displayName }}</strong>
          <span>{{ currentSession.workspace.name }}</span>
        </div>
        <button
          v-if="canManageMembers"
          title="成员管理"
          aria-label="成员管理"
          @click="openMembers"
        ><el-icon><User /></el-icon></button>
        <button title="退出登录" aria-label="退出登录" @click="logout">↗</button>
      </div>
      <div class="rail-status" title="API 服务状态">
        <span></span>
      </div>
    </aside>

    <main class="workspace">
      <ReleaseAnalysisView v-if="activeView === 'analysis'" />
      <ServicesView v-else-if="activeView === 'services'" />
      <LogsView v-else-if="activeView === 'logs'" />
      <SettingsView v-else />
    </main>

    <InspectionLogsDialog />

    <ProjectDialog />

    <AiConfigDialog />

    <MembersDialog />
  </div>
</template>
