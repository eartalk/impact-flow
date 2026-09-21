<script setup lang="ts">
import { computed } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../workspace-context";

const {
  workspaceSettingsTab,
  changeWorkspaceSettingsTab,
  savingWorkspaceSettings,
  workspaceSettingsForm,
  currentWorkspace,
  canManageWorkspace,
  saveWorkspaceSettings,
  loadAuditLogs,
  auditLogs,
  auditLoading,
  auditFilters,
  auditPage,
  auditTotal,
  auditTotalPages,
  auditActionOptions,
  auditActionLabel,
  auditDetailText,
  changeAuditPage,
  resetAuditFilters,
  members,
  openMembers,
  formatLogTime,
  roleLabel,
  isCurrentWorkspaceArchived,
  archivingWorkspace,
  restoringWorkspace,
  archiveConfirmName,
  archiveWorkspace,
  restoreWorkspace,
} = useWorkspaceContext();

const canSubmit = computed(
  () => workspaceSettingsForm.name.trim().length > 0 && !savingWorkspaceSettings.value,
);

const archiveNameMatches = computed(
  () => archiveConfirmName.value.trim() === (currentWorkspace.value?.name ?? ""),
);

/** 审计日志按天展示，formatLogTime 只到分秒，这里补上年份 */
function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
</script>

<template>
  <section class="base-config-section workspace-settings-section">
    <header class="base-config-section-header">
      <div>
        <h2>工作空间设置</h2>
        <p>管理当前工作空间的基本信息，并查看成员与配置的变更记录。</p>
      </div>
    </header>

    <div class="logs-tabs" role="tablist">
      <button
        role="tab"
        :aria-selected="workspaceSettingsTab === 'profile'"
        :class="{ active: workspaceSettingsTab === 'profile' }"
        @click="changeWorkspaceSettingsTab('profile')"
      >
        基本信息
      </button>
      <button
        v-if="canManageWorkspace"
        role="tab"
        :aria-selected="workspaceSettingsTab === 'audit'"
        :class="{ active: workspaceSettingsTab === 'audit' }"
        @click="changeWorkspaceSettingsTab('audit')"
      >
        审计日志
      </button>
      <button
        v-if="canManageWorkspace"
        role="tab"
        :aria-selected="workspaceSettingsTab === 'danger'"
        :class="{ active: workspaceSettingsTab === 'danger' }"
        @click="changeWorkspaceSettingsTab('danger')"
      >
        危险操作
      </button>
    </div>

    <div v-if="workspaceSettingsTab === 'profile'" class="workspace-profile">
      <div class="workspace-profile-form">
        <el-form label-position="top" @submit.prevent="saveWorkspaceSettings">
          <el-form-item label="工作空间名称">
            <el-input
              v-model="workspaceSettingsForm.name"
              maxlength="100"
              :disabled="!canManageWorkspace"
            />
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="workspaceSettingsForm.description"
              type="textarea"
              :rows="3"
              maxlength="500"
              placeholder="留空表示清除描述"
              :disabled="!canManageWorkspace"
            />
          </el-form-item>
        </el-form>
        <div v-if="canManageWorkspace" class="workspace-profile-actions">
          <span v-if="!canSubmit" class="workspace-profile-hint">名称不能为空</span>
          <button
            class="dialog-primary"
            type="button"
            :disabled="!canSubmit"
            @click="saveWorkspaceSettings"
          >
            {{ savingWorkspaceSettings ? "保存中…" : "保存修改" }}
          </button>
        </div>
        <p v-else class="workspace-profile-hint">
          只有所有者与管理员可以修改工作空间信息。
        </p>
      </div>

      <div class="workspace-profile-side">
        <dl v-if="currentWorkspace" class="workspace-settings-meta">
          <div><dt>编码</dt><dd>{{ currentWorkspace.code }}</dd></div>
          <div><dt>状态</dt><dd>{{ currentWorkspace.status === "ACTIVE" ? "正常" : "已归档" }}</dd></div>
          <div><dt>服务数量</dt><dd>{{ currentWorkspace.projectCount }}</dd></div>
          <div><dt>成员数量</dt><dd>{{ currentWorkspace.memberCount }}</dd></div>
          <div>
            <dt>创建时间</dt>
            <dd>{{ formatLogTime(currentWorkspace.createdAt) }}</dd>
          </div>
        </dl>

        <div v-if="canManageWorkspace" class="workspace-members-preview">
          <div class="workspace-members-head">
            <h3>成员</h3>
            <button class="workspace-members-action" @click="openMembers">管理成员</button>
          </div>
          <ul>
            <li v-for="member in members.slice(0, 5)" :key="member.userId">
              <span>{{ member.displayName }}</span>
              <small>{{ roleLabel(member.role) }}</small>
            </li>
            <li v-if="!members.length" class="empty">打开成员管理以加载列表</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-else-if="workspaceSettingsTab === 'audit'" class="audit-panel">
      <div class="logs-filters">
        <el-select
          v-model="auditFilters.action"
          placeholder="全部操作类型"
          clearable
          @change="loadAuditLogs(true)"
        >
          <el-option
            v-for="option in auditActionOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <button
          class="dialog-secondary"
          type="button"
          :disabled="auditLoading"
          @click="loadAuditLogs()"
        >
          <el-icon :class="{ spinning: auditLoading }"><Refresh /></el-icon>
          刷新
        </button>
        <button
          v-if="auditFilters.action"
          class="dialog-secondary"
          type="button"
          :disabled="auditLoading"
          @click="resetAuditFilters"
        >
          清空筛选
        </button>
        <span class="logs-filter-count">共 {{ auditTotal }} 条</span>
      </div>

      <div class="analysis-log-table" v-loading="auditLoading">
        <div class="audit-row audit-head">
          <span>时间</span>
          <span>操作人</span>
          <span>操作</span>
          <span>资源</span>
          <span>详情</span>
        </div>
        <div v-if="auditLogs.length" class="analysis-log-body">
          <div v-for="log in auditLogs" :key="log.id" class="audit-row">
            <time>{{ formatAuditTime(log.createdAt) }}</time>
            <span :title="log.operatorId ?? ''">{{ log.operatorName ?? "系统" }}</span>
            <span
              class="audit-action"
              :class="{ sensitive: log.action === 'MEMBER_REMOVED' }"
            >
              {{ auditActionLabel(log.action) }}
            </span>
            <span class="audit-resource">{{ log.resourceType ?? "—" }}</span>
            <el-tooltip
              placement="top"
              :disabled="!log.detail"
              :content="
                log.detail
                  ? Object.entries(log.detail)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join('\n')
                  : ''
              "
            >
              <span class="audit-detail">{{ auditDetailText(log.detail) }}</span>
            </el-tooltip>
          </div>
        </div>
        <div v-else-if="!auditLoading" class="inspection-log-empty">暂无审计记录</div>
      </div>

      <div class="inspection-log-footer">
        <span>
          第 {{ auditPage }} / {{ auditTotalPages }} 页，共 {{ auditTotal }} 条
        </span>
        <div>
          <button
            :disabled="auditPage <= 1 || auditLoading"
            @click="changeAuditPage(auditPage - 1)"
          >
            上一页
          </button>
          <button
            :disabled="auditPage >= auditTotalPages || auditLoading"
            @click="changeAuditPage(auditPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <div v-else class="workspace-danger">
      <div v-if="!isCurrentWorkspaceArchived" class="danger-card">
        <h3>归档工作空间</h3>
        <p>
          归档后工作空间进入只读状态，未运行的分析任务会被取消，所有成员的写入操作被冻结。
          所有者和管理员仍可进入查看，所有者可以随时恢复。
        </p>
        <div class="danger-confirm">
          <span>输入工作空间名称以确认：</span>
          <el-input
            v-model="archiveConfirmName"
            :placeholder="currentWorkspace?.name ?? ''"
            maxlength="100"
          />
          <button
            class="dialog-danger"
            type="button"
            :disabled="archivingWorkspace || !archiveNameMatches"
            @click="archiveWorkspace"
          >
            {{ archivingWorkspace ? "归档中…" : "归档工作空间" }}
          </button>
        </div>
      </div>

      <div v-else class="danger-card">
        <h3>恢复工作空间</h3>
        <p>
          工作空间当前已归档。恢复后自动化巡检与变更分析将按原配置继续运行，
          已取消的分析任务不会被自动补跑。
        </p>
        <button
          class="dialog-primary"
          type="button"
          :disabled="restoringWorkspace"
          @click="restoreWorkspace"
        >
          {{ restoringWorkspace ? "恢复中…" : "恢复工作空间" }}
        </button>
      </div>
    </div>
  </section>
</template>
