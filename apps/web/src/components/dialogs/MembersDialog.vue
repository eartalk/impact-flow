<script setup lang="ts">
import { useWorkspaceContext } from "../../workspace-context";

const { loading, membersVisible, membersLoading, members, memberCreating, memberForm, memberFormValid, formatLogTime, createMember } = useWorkspaceContext();
</script>

<template>
<el-dialog v-model="membersVisible" title="工作空间成员" width="720px">
      <div class="member-manager" v-loading="membersLoading">
        <p class="member-create-hint">
          账号至少 3 位，仅支持字母、数字及 . _ @ -；初始密码至少 8 位。
        </p>
        <div class="member-create-row">
          <el-input v-model="memberForm.displayName" placeholder="显示名称" />
          <el-input v-model="memberForm.username" placeholder="登录账号" />
          <el-input
            v-model="memberForm.password"
            type="password"
            show-password
            placeholder="初始密码（至少 8 位）"
          />
          <el-select v-model="memberForm.role" aria-label="成员角色">
            <el-option label="管理员" value="ADMIN" />
            <el-option label="成员" value="MEMBER" />
            <el-option label="只读" value="VIEWER" />
          </el-select>
          <button
            class="dialog-primary"
            :disabled="memberCreating || !memberFormValid"
            @click="createMember"
          >
            {{ memberCreating ? "创建中…" : "添加成员" }}
          </button>
        </div>
        <div class="member-list">
          <div class="member-list-head">
            <span>成员</span><span>账号</span><span>角色</span><span>加入时间</span>
          </div>
          <div v-for="member in members" :key="member.userId" class="member-list-row">
            <strong>{{ member.displayName }}</strong>
            <code>{{ member.username }}</code>
            <span class="member-role">{{ member.role }}</span>
            <time>{{ formatLogTime(member.joinedAt) }}</time>
          </div>
        </div>
      </div>
    </el-dialog>
</template>
