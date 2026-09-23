<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUp, Refresh, Tickets } from '@element-plus/icons-vue';
import { useWorkspaceContext } from '../workspace-context';
import AnalysisTaskProgress from '../components/analysis/AnalysisTaskProgress.vue';
import RegressionPlanPanel from '../components/analysis/RegressionPlanPanel.vue';
import AnalysisEvidencePanel from '../components/analysis/AnalysisEvidencePanel.vue';

const {
  projects,
  checkingAll,
  detectingProjectId,
  rerunningProjectId,
  detailLoadingProjectId,
  analysisPollingError,
  analysisPollingFailedAt,
  analysisPolling,
  analysisFor,
  analysisDetail,
  analysisIsActive,
  analysisStatusLabel,
  currentVersion,
  previousVersion,
  intervalVersions,
  shortCommit,
  formatCheckedAt,
  pushState,
  isExpanded,
  toggleAnalysis,
  inspectAllProjects,
  openInspectionLogs,
  openCreateProject,
  startDetection,
  rerunAnalysis,
  updateRegressionFeedback,
  refreshAnalysisStatus,
} = useWorkspaceContext();
</script>

<template>
  <section class="release-overview">
    <div class="release-stat">
      <span>服务总数</span>
      <strong>{{ projects.length }}</strong>
    </div>
    <div class="release-stat">
      <span>存在新推送</span>
      <strong class="accent-count">{{ projects.filter((project) => pushState(project) === 'yes').length }}</strong>
    </div>
    <div class="release-hint">
      <span class="pulse-dot"></span>
      <span>系统每 5 分钟自动巡检生产分支</span>
      <div class="inspection-actions">
        <button class="inspection-log-action" type="button" @click="openInspectionLogs">
          <el-icon><Tickets /></el-icon>巡检日志
        </button>
        <button class="inspect-all-action" type="button" :disabled="checkingAll" @click="inspectAllProjects">
          <el-icon :class="{ spinning: checkingAll }"><Refresh /></el-icon>
          {{ checkingAll ? '巡检中…' : '立即巡检' }}
        </button>
      </div>
    </div>
  </section>

  <section v-if="analysisPollingError" class="analysis-refresh-warning" role="alert">
    <div>
      <strong>分析状态刷新失败，当前进度可能不是最新状态</strong>
      <p>
        {{ analysisPollingError }}
        <template v-if="analysisPollingFailedAt"> · {{ formatCheckedAt(analysisPollingFailedAt) }}</template>
      </p>
    </div>
    <button type="button" :disabled="analysisPolling" @click="refreshAnalysisStatus">
      <el-icon :class="{ spinning: analysisPolling }"><Refresh /></el-icon>
      {{ analysisPolling ? '重试中…' : '立即重试' }}
    </button>
  </section>

  <section class="release-panel">
    <div class="release-table-head">
      <span>服务名称</span>
      <span>分支</span>
      <span>当前版本号</span>
      <span>上一分析版本号</span>
      <span>间隔版本</span>
      <span>是否存在新推送</span>
      <span>分析状态</span>
      <span>操作</span>
    </div>

    <div v-if="projects.length" class="release-table-body">
      <div v-for="(project, index) in projects" :key="project.id" class="release-record-group">
        <div class="release-record">
          <div class="release-service">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div><strong>{{ project.name }}</strong><small>{{ project.code }}</small></div>
          </div>
          <span class="branch-chip">{{ project.productionBranch }}</span>
          <code class="version-code current" :title="currentVersion(project) ?? '尚未分析'">
            {{ shortCommit(currentVersion(project)) }}
          </code>
          <code class="version-code" :title="previousVersion(project) ?? '尚未分析'">
            {{ shortCommit(previousVersion(project)) }}
          </code>
          <el-tooltip placement="top" effect="light" popper-class="version-tooltip" :disabled="intervalVersions(project).length === 0">
            <template #content>
              <div class="version-tooltip-content">
                <p>间隔合并明细</p>
                <div v-for="version in intervalVersions(project)" :key="version.sha">
                  <code>{{ version.shortSha }}</code><span>{{ version.subject }}</span>
                </div>
              </div>
            </template>
            <span class="interval-count" :class="{ active: intervalVersions(project).length > 0 }">
              <strong>{{ project.lastCheckedAt ? project.pendingCommitCount : '—' }}</strong>
              <small v-if="project.lastCheckedAt">次合并</small>
            </span>
          </el-tooltip>
          <div>
            <el-tooltip placement="top" :disabled="pushState(project) !== 'error'" :content="project.checkError ?? ''">
              <span class="push-state" :class="pushState(project)">
                <i></i>{{ pushState(project) === 'yes' ? '是' : pushState(project) === 'no' ? '否' : pushState(project) === 'checking' ? '巡检中' : pushState(project) === 'error' ? '巡检失败' : '待巡检' }}
              </span>
            </el-tooltip>
            <small v-if="project.lastCheckedAt" class="checked-at">{{ formatCheckedAt(project.lastCheckedAt) }}</small>
          </div>
          <AnalysisTaskProgress v-if="analysisFor(project.id)" :task="analysisFor(project.id)!" compact />
          <span v-else class="analysis-status-empty">尚未分析</span>
          <div class="release-actions">
            <button
              class="detect-action"
              type="button"
              :disabled="detectingProjectId === project.id || analysisIsActive(project.id) || pushState(project) !== 'yes'"
              @click="startDetection(project)"
            >{{ detectingProjectId === project.id || analysisIsActive(project.id) ? '分析中…' : '回归分析' }}</button>
            <button
              v-if="analysisFor(project.id)?.status === 'FAILED'"
              class="rerun-analysis-action table-rerun"
              type="button"
              :disabled="rerunningProjectId === project.id"
              @click="rerunAnalysis(project)"
            >重新分析</button>
            <button class="expand-action" type="button" :disabled="!analysisFor(project.id)" @click="toggleAnalysis(project)">
              {{ isExpanded(project.id) ? '收起' : '展开' }}
              <el-icon><ArrowUp v-if="isExpanded(project.id)" /><ArrowDown v-else /></el-icon>
            </button>
          </div>
        </div>

        <section
          v-if="isExpanded(project.id) && analysisDetail(project.id)"
          class="row-analysis"
          v-loading="detailLoadingProjectId === project.id"
        >
          <div class="result-header">
            <div>
              <span class="analysis-status">{{ analysisStatusLabel(analysisDetail(project.id)?.status) }}</span>
              <strong>回归分析结果</strong>
            </div>
            <div class="result-header-actions">
              <div class="result-commits">
                <code>{{ shortCommit(analysisDetail(project.id)?.baseCommit) }}</code>
                <el-icon><ArrowRight /></el-icon>
                <code>{{ shortCommit(analysisDetail(project.id)?.targetCommit) }}</code>
              </div>
              <button
                class="rerun-analysis-action"
                type="button"
                :disabled="analysisIsActive(project.id) || rerunningProjectId === project.id"
                @click="rerunAnalysis(project)"
              >
                <el-icon :class="{ spinning: analysisIsActive(project.id) || rerunningProjectId === project.id }"><Refresh /></el-icon>
                {{ analysisIsActive(project.id) || rerunningProjectId === project.id ? '分析中' : '重新分析' }}
              </button>
            </div>
          </div>

          <AnalysisTaskProgress
            v-if="['READY', 'RUNNING', 'FAILED'].includes(analysisDetail(project.id)?.status ?? '')"
            :task="analysisDetail(project.id)!"
          />
          <template v-else>
            <div class="result-metrics">
              <div><span>提交</span><strong>{{ analysisDetail(project.id)?.commitCount }}</strong></div>
              <div><span>文件</span><strong>{{ analysisDetail(project.id)?.changedFileCount }}</strong></div>
              <div class="positive"><span>新增行</span><strong>+{{ analysisDetail(project.id)?.additions }}</strong></div>
              <div class="negative"><span>删除行</span><strong>-{{ analysisDetail(project.id)?.deletions }}</strong></div>
            </div>
            <div class="final-plan-stack">
              <RegressionPlanPanel
                :task="analysisDetail(project.id)!"
                @feedback="(targetId, decision) => updateRegressionFeedback(project.id, analysisDetail(project.id)!.id, targetId, decision)"
              />
              <AnalysisEvidencePanel :task="analysisDetail(project.id)!" />
            </div>
          </template>
        </section>
      </div>
    </div>

    <div v-else class="release-empty">
      <strong>还没有接入服务</strong>
      <p>先接入代码仓库，系统才能巡检生产分支并生成回归计划。</p>
      <button class="detect-action" type="button" @click="openCreateProject">接入服务</button>
    </div>
  </section>
</template>

<style scoped>
.final-plan-stack { display: grid; grid-template-columns: minmax(0, 1fr); }
.final-plan-stack > :deep(*) { min-width: 0; }
.table-rerun { height: 32px; white-space: nowrap; }
.release-empty { padding: 72px 24px; text-align: center; color: #6f7b87; }
.release-empty strong { display: block; margin-bottom: 8px; color: #344353; font-size: 15px; }
.release-empty p { margin: 0 0 18px; font-size: 12px; }
</style>
