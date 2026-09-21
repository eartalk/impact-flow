<script setup lang="ts">
import { computed } from "vue";
import { ArrowDown, Loading } from "@element-plus/icons-vue";
import type { WorkspaceOverview, WorkspaceRole } from "@impact-flow/contracts";
import { useWorkspaceContext } from "../../workspace-context";

const {
  workspaces,
  workspaceCreationPolicy,
  currentSession,
  currentWorkspace,
  switchingWorkspaceId,
  switchWorkspace,
  openCreateWorkspace,
} = useWorkspaceContext();

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "所有者",
  ADMIN: "管理员",
  MEMBER: "成员",
  VIEWER: "只读",
};

const currentName = computed(
  () => currentWorkspace.value?.name ?? currentSession.value?.workspace.name ?? "",
);

const archived = computed(() => currentWorkspace.value?.status === "ARCHIVED");

type Command = { type: "switch"; workspace: WorkspaceOverview } | "create";

function onCommand(command: Command) {
  if (command === "create") {
    openCreateWorkspace();
    return;
  }
  void switchWorkspace(command.workspace);
}
</script>

<template>
  <el-dropdown
    trigger="click"
    placement="top-start"
    :hide-on-click="true"
    @command="onCommand"
  >
    <button
      class="workspace-trigger"
      type="button"
      :disabled="!!switchingWorkspaceId"
      :title="archived ? '当前工作空间已归档，请切换' : '切换工作空间'"
    >
      <span class="workspace-trigger-label">
        {{ switchingWorkspaceId ? "正在切换…" : currentName }}
      </span>
      <el-icon :class="{ spinning: !!switchingWorkspaceId }">
        <Loading v-if="switchingWorkspaceId" />
        <ArrowDown v-else />
      </el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu class="workspace-menu">
        <el-dropdown-item
          v-for="item in workspaces"
          :key="item.id"
          :command="{ type: 'switch', workspace: item }"
          :disabled="
            item.id === currentSession?.workspace.id ||
            (item.status === 'ARCHIVED' && item.role !== 'OWNER')
          "
        >
          <span class="workspace-option">
            <span class="workspace-option-main">
              <b>{{ item.name }}</b>
              <i v-if="item.id === currentSession?.workspace.id">当前</i>
              <i v-else-if="item.status === 'ARCHIVED'" class="archived">
                {{ item.role === 'OWNER' ? '已归档 · 可进入' : '已归档' }}
              </i>
            </span>
            <small>
              {{ ROLE_LABELS[item.role] }} · {{ item.projectCount }} 个服务 ·
              {{ item.memberCount }} 位成员
            </small>
          </span>
        </el-dropdown-item>

      <el-dropdown-item
        v-if="workspaceCreationPolicy.allowed"
        divided
        command="create"
      >
        + 创建工作空间
      </el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
</template>
