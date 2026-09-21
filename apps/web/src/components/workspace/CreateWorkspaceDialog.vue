<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspaceContext } from "../../workspace-context";

const {
  workspaceDialogVisible,
  savingWorkspace,
  workspaceForm,
  createWorkspace,
} = useWorkspaceContext();

const codeValid = computed(() => /^[a-z0-9][a-z0-9-]{1,99}$/.test(workspaceForm.code));
const canSubmit = computed(
  () => workspaceForm.name.trim().length > 0 && codeValid.value && !savingWorkspace.value,
);

/** 名称自动推导编码，但一旦用户手动改过就不再覆盖 */
const codeTouched = ref(false);
function onNameInput() {
  if (codeTouched.value) return;
  workspaceForm.code = workspaceForm.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function close() {
  if (savingWorkspace.value) return;
  workspaceDialogVisible.value = false;
  codeTouched.value = false;
}
</script>

<template>
  <el-dialog
    v-model="workspaceDialogVisible"
    title="创建工作空间"
    width="480px"
    :close-on-click-modal="false"
    @close="codeTouched = false"
  >
    <p class="workspace-dialog-hint">
      创建后你会成为该工作空间的所有者，并自动切换过去。服务、分析记录、配置与日志都相互隔离。
    </p>

    <el-form label-position="top" @submit.prevent="createWorkspace">
      <el-form-item label="工作空间名称">
        <el-input
          v-model="workspaceForm.name"
          placeholder="例如：测试团队"
          maxlength="100"
          @input="onNameInput"
        />
      </el-form-item>
      <el-form-item label="工作空间编码">
        <el-input
          v-model="workspaceForm.code"
          placeholder="qa-team"
          maxlength="100"
          @input="codeTouched = true"
        />
        <small class="workspace-dialog-hint">
          全局唯一，只能包含小写字母、数字与连字符，创建后不可修改。
        </small>
      </el-form-item>
      <el-form-item label="描述（可选）">
        <el-input
          v-model="workspaceForm.description"
          type="textarea"
          :rows="2"
          maxlength="500"
          placeholder="负责生产版本验收"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <button class="dialog-secondary" type="button" :disabled="savingWorkspace" @click="close">
        取消
      </button>
      <button
        class="dialog-primary"
        type="button"
        :disabled="!canSubmit"
        @click="createWorkspace"
      >
        {{ savingWorkspace ? "创建中…" : "创建并切换" }}
      </button>
    </template>
  </el-dialog>
</template>
