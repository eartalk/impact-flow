<script setup lang="ts">
import { ArrowRight, Refresh } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { useWorkspaceContext } from "../workspace-context";

const { projects, loading, logsTab, logsLoading, logsProjectId, logsStatus, logsPage, logsTotal, logsTotalPages, analysisLogs, deliveryLogs, shortCommit, logsStatusOptions, formatLogTime, loadLogs, changeLogsTab, onLogsFilterChange, changeLogsPage, formatDuration, analysisLogStatusLabel, deliveryStatusLabel } = useWorkspaceContext();
</script>

<template>
<section class="base-config-section logs-section">
          <header class="base-config-section-header">
            <div>
              <h2>日志管理</h2>
              <p>
                统一查看变更分析、AI 分析与消息推送的执行记录，可按服务与结果筛选。
              </p>
            </div>
          </header>

          <div class="logs-tabs" role="tablist">
            <button
              role="tab"
              :aria-selected="logsTab === 'CHANGE_ANALYSIS'"
              :class="{ active: logsTab === 'CHANGE_ANALYSIS' }"
              @click="changeLogsTab('CHANGE_ANALYSIS')"
            >
              变更分析日志
            </button>
            <button
              role="tab"
              :aria-selected="logsTab === 'AI_ANALYSIS'"
              :class="{ active: logsTab === 'AI_ANALYSIS' }"
              @click="changeLogsTab('AI_ANALYSIS')"
            >
              AI 分析日志
            </button>
            <button
              role="tab"
              :aria-selected="logsTab === 'NOTIFICATION'"
              :class="{ active: logsTab === 'NOTIFICATION' }"
              @click="changeLogsTab('NOTIFICATION')"
            >
              消息推送日志
            </button>
          </div>

          <div class="logs-filters">
            <el-select
              v-model="logsProjectId"
              placeholder="全部服务"
              clearable
              @change="onLogsFilterChange"
            >
              <el-option
                v-for="project in projects"
                :key="project.id"
                :label="project.name"
                :value="project.id"
              />
            </el-select>
            <el-select
              v-model="logsStatus"
              placeholder="全部结果"
              clearable
              @change="onLogsFilterChange"
            >
              <el-option
                v-for="option in logsStatusOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <button
              class="dialog-secondary"
              type="button"
              :disabled="logsLoading"
              @click="loadLogs()"
            >
              <el-icon :class="{ spinning: logsLoading }"><Refresh /></el-icon>
              刷新
            </button>
            <span class="logs-filter-count">共 {{ logsTotal }} 条</span>
          </div>

          <div
            v-if="logsTab !== 'NOTIFICATION'"
            class="analysis-log-table"
            v-loading="logsLoading"
          >
            <div
              class="analysis-log-row analysis-log-head"
              :class="{ 'is-ai': logsTab === 'AI_ANALYSIS' }"
            >
              <span>开始时间</span>
              <span>服务</span>
              <span>版本区间</span>
              <span>结果</span>
              <span v-if="logsTab === 'AI_ANALYSIS'">模型</span>
              <span v-if="logsTab === 'AI_ANALYSIS'">Token</span>
              <span>耗时</span>
              <span>详情</span>
            </div>
            <div v-if="analysisLogs.length" class="analysis-log-body">
              <div
                v-for="log in analysisLogs"
                :key="log.id"
                class="analysis-log-row"
                :class="{ 'is-ai': logsTab === 'AI_ANALYSIS' }"
              >
                <time>{{ formatLogTime(log.startedAt) }}</time>
                <span class="analysis-log-project" :title="log.projectName">
                  {{ log.projectName }}
                </span>
                <div class="analysis-log-commits">
                  <code :title="log.baseCommit">{{
                    shortCommit(log.baseCommit)
                  }}</code>
                  <el-icon><ArrowRight /></el-icon>
                  <code :title="log.targetCommit">{{
                    shortCommit(log.targetCommit)
                  }}</code>
                </div>
                <el-tooltip
                  placement="top"
                  :disabled="!log.errorMessage"
                  :content="log.errorMessage ?? ''"
                >
                  <span class="log-status" :class="log.status.toLowerCase()">
                    <i></i>{{ analysisLogStatusLabel(log.status) }}
                  </span>
                </el-tooltip>
                <code
                  v-if="logsTab === 'AI_ANALYSIS'"
                  class="analysis-log-model"
                  :title="log.model ?? ''"
                  >{{ log.model ?? "—" }}</code
                >
                <span
                  v-if="logsTab === 'AI_ANALYSIS'"
                  class="analysis-log-token"
                  >{{ log.tokenUsage?.total ?? "—" }}</span
                >
                <span>{{ formatDuration(log.durationMs) }}</span>
                <button
                  v-if="log.errorMessage"
                  class="inspection-detail-action"
                  @click="
                    ElMessageBox.alert(
                      log.errorMessage,
                      `${log.projectName} · ${
                        log.type === 'AI_ANALYSIS'
                          ? 'AI 分析失败'
                          : '变更分析失败'
                      }`,
                      { confirmButtonText: '关闭' },
                    )
                  "
                >
                  查看
                </button>
                <span v-else class="inspection-detail-empty">—</span>
              </div>
            </div>
            <div v-else-if="!logsLoading" class="inspection-log-empty">
              暂无{{ logsTab === "AI_ANALYSIS" ? "AI 分析" : "变更分析" }}日志
            </div>
          </div>

          <div v-else class="analysis-log-table" v-loading="logsLoading">
            <div class="delivery-log-row delivery-log-head">
              <span>投递时间</span>
              <span>服务</span>
              <span>提交</span>
              <span>渠道</span>
              <span>尝试</span>
              <span>结果</span>
              <span>失败原因</span>
            </div>
            <div v-if="deliveryLogs.length" class="analysis-log-body">
              <div
                v-for="log in deliveryLogs"
                :key="log.id"
                class="delivery-log-row"
                :class="{ failed: log.status === 'FAILED' }"
              >
                <time>{{ formatLogTime(log.createdAt) }}</time>
                <span class="delivery-log-project" :title="log.projectName ?? ''">
                  {{ log.projectName ?? "未知服务" }}
                </span>
                <code :title="log.targetCommit">{{ log.shortCommit }}</code>
                <span>{{ log.channel }}</span>
                <span class="delivery-log-attempt">第 {{ log.attempt }} 次</span>
                <span class="log-status" :class="log.status.toLowerCase()">
                  <i></i>{{ deliveryStatusLabel(log.status) }}
                </span>
                <el-tooltip
                  placement="top"
                  :disabled="!log.errorMessage"
                  :content="log.errorMessage ?? ''"
                >
                  <span class="delivery-log-error">
                    {{
                      log.errorMessage
                        ? (log.errorCode ? `[${log.errorCode}] ` : "") +
                          log.errorMessage
                        : "—"
                    }}
                  </span>
                </el-tooltip>
              </div>
            </div>
            <div v-else-if="!logsLoading" class="inspection-log-empty">
              暂无消息推送日志
            </div>
          </div>

          <div class="inspection-log-footer">
            <span>
              第 {{ logsPage }} / {{ logsTotalPages }} 页，共 {{ logsTotal }} 条
            </span>
            <div>
              <button
                :disabled="logsPage <= 1 || logsLoading"
                @click="changeLogsPage(logsPage - 1)"
              >
                上一页
              </button>
              <button
                :disabled="logsPage >= logsTotalPages || logsLoading"
                @click="changeLogsPage(logsPage + 1)"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
</template>
