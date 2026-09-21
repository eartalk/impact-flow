<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspaceContext } from "../../workspace-context";

const {
  membersLoading,
  members,
  memberCreating,
  memberForm,
  memberFormValid,
  removingMemberId,
  canManageMembers,
  currentSession,
  disablingMemberId,
  resetPasswordVisible,
  resetPasswordForm,
  resettingPassword,
  formatLogTime,
  createMember,
  removeMember,
  disableMember,
  restoreMember,
  openResetPassword,
  submitResetPassword,
  roleLabel,
} = useWorkspaceContext();

const createMemberDialogVisible = ref(false);
const memberKeyword = ref("");
const memberRoleFilter = ref("");
const memberStatusFilter = ref("");

const filteredMembers = computed(() => {
  const keyword = memberKeyword.value.trim().toLowerCase();
  return members.value.filter((member) => {
    const matchesKeyword = !keyword ||
      member.displayName.toLowerCase().includes(keyword) ||
      member.username.toLowerCase().includes(keyword);
    const matchesRole = !memberRoleFilter.value || member.role === memberRoleFilter.value;
    const matchesStatus = !memberStatusFilter.value || member.status === memberStatusFilter.value;
    return matchesKeyword && matchesRole && matchesStatus;
  });
});

function isSelf(userId: string) {
  return currentSession.value?.user.id === userId;
}

async function submitCreateMember() {
  if (await createMember()) createMemberDialogVisible.value = false;
}

</script>

<template>
  <section class="member-management-section">
    <header class="member-management-header">
      <div>
        <h2>成员管理</h2>
        <p>管理成员账号、角色和访问状态。</p>
      </div>
      <button
        v-if="canManageMembers"
        class="dialog-primary member-create-button"
        type="button"
        @click="createMemberDialogVisible = true"
      >
        新建成员
      </button>
    </header>

    <div class="member-manager" v-loading="membersLoading">
      <div class="member-filter-bar">
        <el-input
          v-model="memberKeyword"
          clearable
          placeholder="搜索成员名称或账号"
          aria-label="搜索成员名称或账号"
        />
        <el-select v-model="memberRoleFilter" placeholder="全部角色" clearable>
          <el-option label="所有者" value="OWNER" />
          <el-option label="管理员" value="ADMIN" />
          <el-option label="成员" value="MEMBER" />
          <el-option label="只读" value="VIEWER" />
        </el-select>
        <el-select v-model="memberStatusFilter" placeholder="全部状态" clearable>
          <el-option label="正常" value="ACTIVE" />
          <el-option label="已停用" value="DISABLED" />
        </el-select>
        <span class="member-filter-count">
          共 {{ filteredMembers.length }} 位成员
        </span>
      </div>

      <div class="member-list">
        <div class="member-list-head">
          <span>成员</span><span>账号</span><span>角色</span><span>加入时间</span>
          <span v-if="canManageMembers">操作</span>
        </div>
        <div v-for="member in filteredMembers" :key="member.userId" class="member-list-row">
          <strong>
            {{ member.displayName }}
            <i v-if="member.status === 'DISABLED'" class="member-disabled">已停用</i>
          </strong>
          <span class="member-username">{{ member.username }}</span>
          <span class="member-role">{{ roleLabel(member.role) }}</span>
          <time>{{ formatLogTime(member.joinedAt) }}</time>
          <span v-if="canManageMembers" class="member-row-actions">
            <em v-if="member.role === 'OWNER'">所有者</em>
            <template v-else-if="isSelf(member.userId)">
              <em>当前账号</em>
            </template>
            <template v-else>
              <button
                v-if="member.status === 'ACTIVE'"
                class="warning"
                :disabled="disablingMemberId === member.userId"
                @click="disableMember(member)"
              >
                {{ disablingMemberId === member.userId ? "停用中…" : "停用" }}
              </button>
              <button v-else @click="restoreMember(member)">恢复</button>
              <button @click="openResetPassword(member)">重置密码</button>
              <button
                class="danger"
                :disabled="removingMemberId === member.userId"
                @click="removeMember(member)"
              >
                {{ removingMemberId === member.userId ? "移除中…" : "移除" }}
              </button>
            </template>
          </span>
        </div>
        <div v-if="!filteredMembers.length && !membersLoading" class="member-list-empty">
          没有符合筛选条件的成员
        </div>
      </div>
    </div>
  </section>

  <el-dialog
    v-model="createMemberDialogVisible"
    title="新建成员"
    width="520px"
    :close-on-click-modal="false"
  >
    <p class="member-create-hint">创建一个系统账号并直接加入当前工作空间。</p>
    <el-form label-position="top" @submit.prevent="submitCreateMember">
      <el-form-item label="显示名称">
        <el-input v-model="memberForm.displayName" placeholder="成员姓名或昵称" />
      </el-form-item>
      <el-form-item label="登录账号">
        <el-input v-model="memberForm.username" placeholder="至少 3 位，支持字母、数字及 . _ @ -" />
      </el-form-item>
      <el-form-item label="初始密码">
        <el-input
          v-model="memberForm.password"
          type="password"
          show-password
          placeholder="至少 8 位"
        />
      </el-form-item>
      <el-form-item label="成员角色">
        <el-select v-model="memberForm.role" style="width: 100%">
          <el-option label="管理员" value="ADMIN" />
          <el-option label="成员" value="MEMBER" />
          <el-option label="只读" value="VIEWER" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <button class="dialog-secondary" type="button" @click="createMemberDialogVisible = false">
        取消
      </button>
      <button
        class="dialog-primary"
        type="button"
        :disabled="memberCreating || !memberFormValid"
        @click="submitCreateMember"
      >
        {{ memberCreating ? "创建中…" : "新建成员" }}
      </button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="resetPasswordVisible"
    title="重置密码"
    width="440px"
    :close-on-click-modal="false"
  >
    <p class="member-create-hint">
      重置后对方需用新密码重新登录，其现有会话会被撤销。
    </p>
    <el-form label-position="top" @submit.prevent="submitResetPassword">
      <el-form-item label="新密码">
        <el-input
          v-model="resetPasswordForm.password"
          type="password"
          show-password
          placeholder="至少 8 位"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <button
        class="dialog-secondary"
        type="button"
        :disabled="resettingPassword"
        @click="resetPasswordVisible = false"
      >
        取消
      </button>
      <button
        class="dialog-primary"
        type="button"
        :disabled="resettingPassword || resetPasswordForm.password.length < 8"
        @click="submitResetPassword"
      >
        {{ resettingPassword ? "重置中…" : "确认重置" }}
      </button>
    </template>
  </el-dialog>
</template>
