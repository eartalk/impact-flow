<script setup lang="ts">
import { useWorkspaceContext } from "../../workspace-context";

const { dialogVisible, editingProjectId, savingProject, form, saveProject } = useWorkspaceContext();
</script>

<template>
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
</template>
