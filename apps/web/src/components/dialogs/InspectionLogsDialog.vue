<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../../workspace-context";

const { projects, loading, inspectionLogVisible, inspectionLogLoading, inspectionLogs, inspectionLogTotal, inspectionLogPage, inspectionLogTotalPages, inspectionLogFilters, shortCommit, formatLogTime, inspectionDuration, loadInspectionLogs, resetInspectionLogFilters, changeInspectionLogPage, showInspectionError } = useWorkspaceContext();
</script>

<template>
<el-dialog
      v-model="inspectionLogVisible"
      width="920px"
      class="inspection-log-dialog"
      append-to-body
    >
      <template #header>
        <div class="inspection-dialog-header">
          <span>巡检日志</span>
          <button
            class="dialog-refresh-action"
            :disabled="inspectionLogLoading"
            title="刷新巡检日志"
            aria-label="刷新巡检日志"
            @click="loadInspectionLogs()"
          >
            <el-icon :class="{ spinning: inspectionLogLoading }"
              ><Refresh
            /></el-icon>
          </button>
        </div>
      </template>

      <div class="inspection-log-filters">
        <el-select
          v-model="inspectionLogFilters.projectId"
          placeholder="全部服务"
          clearable
        >
          <el-option
            v-for="project in projects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>
        <el-select
          v-model="inspectionLogFilters.status"
          placeholder="全部结果"
          clearable
        >
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILED" />
          <el-option label="执行中" value="RUNNING" />
        </el-select>
        <el-select
          v-model="inspectionLogFilters.triggerType"
          placeholder="全部触发方式"
          clearable
        >
          <el-option label="定时巡检" value="SCHEDULED" />
          <el-option label="手动巡检" value="MANUAL" />
        </el-select>
        <button class="log-query-action" @click="loadInspectionLogs(true)">
          查询
        </button>
        <button class="log-reset-action" @click="resetInspectionLogFilters">
          重置
        </button>
      </div>

      <div class="inspection-log-table" v-loading="inspectionLogLoading">
        <div class="inspection-log-head">
          <span>开始时间</span>
          <span>服务</span>
          <span>触发方式</span>
          <span>结果</span>
          <span>检测版本</span>
          <span>耗时</span>
          <span>详情</span>
        </div>
        <div v-if="inspectionLogs.length" class="inspection-log-body">
          <div
            v-for="log in inspectionLogs"
            :key="log.id"
            class="inspection-log-row"
          >
            <time>{{ formatLogTime(log.startedAt) }}</time>
            <div class="inspection-log-service">
              <strong>{{ log.projectName }}</strong>
              <small>{{ log.projectCode }}</small>
            </div>
            <span class="trigger-badge" :class="log.triggerType.toLowerCase()">
              {{ log.triggerType === "SCHEDULED" ? "定时巡检" : "手动巡检" }}
            </span>
            <el-tooltip
              placement="top"
              :disabled="!log.errorMessage"
              :content="log.errorMessage ?? ''"
            >
              <span class="log-status" :class="log.status.toLowerCase()">
                <i></i>
                {{
                  log.status === "SUCCESS"
                    ? `成功 · ${log.pendingCommitCount} 个待分析`
                    : log.status === "FAILED"
                      ? "失败"
                      : "执行中"
                }}
              </span>
            </el-tooltip>
            <code :title="log.detectedCommit ?? ''">
              {{ shortCommit(log.detectedCommit) }}
            </code>
            <span class="inspection-duration">{{
              inspectionDuration(log)
            }}</span>
            <button
              v-if="log.status === 'FAILED'"
              class="inspection-detail-action"
              @click="showInspectionError(log)"
            >
              查看
            </button>
            <span v-else class="inspection-detail-empty">—</span>
          </div>
        </div>
        <div v-else-if="!inspectionLogLoading" class="inspection-log-empty">
          暂无巡检日志，执行一次巡检后会显示在这里
        </div>
      </div>
      <div class="inspection-log-footer">
        <span>
          第 {{ inspectionLogPage }} / {{ inspectionLogTotalPages }} 页，共
          {{ inspectionLogTotal }} 条
        </span>
        <div>
          <button
            :disabled="inspectionLogPage <= 1 || inspectionLogLoading"
            @click="changeInspectionLogPage(inspectionLogPage - 1)"
          >
            上一页
          </button>
          <button
            :disabled="
              inspectionLogPage >= inspectionLogTotalPages ||
              inspectionLogLoading
            "
            @click="changeInspectionLogPage(inspectionLogPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </el-dialog>
</template>
