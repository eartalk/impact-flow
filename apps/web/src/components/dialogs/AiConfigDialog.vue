<script setup lang="ts">
import { useWorkspaceContext } from "../../workspace-context";

const { aiConfigDialogVisible, editingAiConfigId, savingAiConfig, form, aiForm, saveAiConfig } = useWorkspaceContext();
</script>

<template>
<el-dialog
      v-model="aiConfigDialogVisible"
      :title="editingAiConfigId ? '编辑 AI 配置' : '添加 AI 配置'"
      width="620px"
      class="ai-config-dialog"
    >
      <el-form label-position="top" @submit.prevent="saveAiConfig">
        <div class="form-row">
          <el-form-item label="配置名称">
            <el-input
              v-model="aiForm.name"
              placeholder="例如：DeepSeek 生产接口"
            />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input
              v-model="aiForm.model"
              placeholder="例如：deepseek-chat"
            />
          </el-form-item>
        </div>
        <el-form-item label="接口协议">
          <el-radio-group v-model="aiForm.apiFormat">
            <el-radio-button value="OPENAI"
              >OpenAI Chat Completions</el-radio-button
            >
            <el-radio-button value="ANTHROPIC"
              >Anthropic Messages</el-radio-button
            >
          </el-radio-group>
        </el-form-item>
        <el-form-item label="API 地址">
          <el-input
            v-model="aiForm.baseUrl"
            placeholder="https://api.example.com/v1"
          />
        </el-form-item>
        <el-form-item
          :label="editingAiConfigId ? 'API Key（留空则不修改）' : 'API Key'"
        >
          <el-input
            v-model="aiForm.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="sk-..."
          />
        </el-form-item>
        <div class="form-row ai-number-row">
          <el-form-item label="超时时间（毫秒）">
            <el-input-number
              v-model="aiForm.timeoutMs"
              :min="1000"
              :max="300000"
              :step="1000"
            />
          </el-form-item>
          <el-form-item label="最多文件数">
            <el-input-number v-model="aiForm.maxFiles" :min="1" :max="500" />
          </el-form-item>
          <el-form-item label="最多 Symbol 数">
            <el-input-number v-model="aiForm.maxSymbols" :min="1" :max="500" />
          </el-form-item>
        </div>
        <div class="ai-config-switches">
          <el-checkbox v-model="aiForm.enabled">启用此配置</el-checkbox>
          <el-checkbox v-model="aiForm.isDefault">设为默认分析配置</el-checkbox>
        </div>
      </el-form>
      <template #footer>
        <button class="dialog-secondary" @click="aiConfigDialogVisible = false">
          取消
        </button>
        <button
          class="dialog-primary"
          :disabled="savingAiConfig"
          @click="saveAiConfig"
        >
          {{
            savingAiConfig
              ? "保存中…"
              : editingAiConfigId
                ? "保存修改"
                : "确认添加"
          }}
        </button>
      </template>
    </el-dialog>
</template>
