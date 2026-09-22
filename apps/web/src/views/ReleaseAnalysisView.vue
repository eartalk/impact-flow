<script setup lang="ts">
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  DataAnalysis,
  Refresh,
  Tickets,
} from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../workspace-context";
import AnalysisTaskProgress from "../components/analysis/AnalysisTaskProgress.vue";
import { summarizeBusinessImpacts } from "../utils/business-impact-summary";

const {
  projects,
  loading,
  detectingProjectId,
  rerunningProjectId,
  startingAiProjectId,
  detailLoadingProjectId,
  checkingAll,
  analysisPollingError,
  analysisPollingFailedAt,
  analysisPolling,
  shortCommit,
  formatCheckedAt,
  openCreateProject,
  analysisFor,
  analysisIsActive,
  aiAnalysisIsActive,
  analysisStatusLabel,
  riskLabel,
  confidenceLabel,
  symbolKindLabel,
  symbolChangeLabel,
  analysisDetail,
  isExpanded,
  isDetailSectionExpanded,
  toggleDetailSection,
  toggleAnalysis,
  currentVersion,
  previousVersion,
  intervalVersions,
  pushState,
  openProjectAnalysisLogs,
  openInspectionLogs,
  inspectAllProjects,
  startDetection,
  rerunAnalysis,
  startAiAnalysis,
  refreshAnalysisStatus,
} = useWorkspaceContext();

const impactRelationLabel = (value?: string) =>
  ({
    DIRECT: "直接变更",
    UPSTREAM: "上游受影响",
    CROSS_REPOSITORY: "跨仓库影响",
    RELATED: "关联影响",
    UNKNOWN: "影响待确认",
  })[value ?? ""] ?? "历史分析";

const coverageStatusLabel = (value?: string) =>
  ({
    CONFIRMED: "已确认",
    RECOMMENDED: "建议关注",
    NEEDS_REVIEW: "待人工确认",
  })[value ?? ""] ?? "建议关注";

const targetTypeLabel = (value?: string) =>
  ({
    PAGE: "页面",
    API: "接口",
    JOB: "任务",
    MODULE: "模块",
    DATA: "数据",
    CONFIG: "配置",
    SYMBOL: "代码入口",
    FILE: "文件",
  })[value ?? ""] ?? "范围";

const boundaryTypeLabel = (value?: string) =>
  ({
    HTTP: "业务接口",
    PAGE: "业务页面",
    JOB: "后台任务",
    MESSAGE: "消息入口",
    DATA: "数据边界",
    TECHNICAL: "仅技术链路",
    UNKNOWN: "边界待确认",
  })[value ?? ""] ?? "历史结果";

const confidenceText = (value?: string) =>
  ({
    HIGH: "已确认",
    MEDIUM: "推断",
    LOW: "待确认",
  })[value ?? ""] ?? "未标注";

const businessCoverage = (projectId: string) => {
  const task = analysisDetail(projectId);
  const scopes = task?.regressionSuggestions ?? [];
  const allKeys = new Set(
    scopes.flatMap((item) => item.sourceSymbolKeys ?? []),
  );
  const businessKeys = new Set(
    scopes
      .filter(
        (item) =>
          !["TECHNICAL", "UNKNOWN"].includes(item.boundaryType ?? "UNKNOWN"),
      )
      .flatMap((item) => item.sourceSymbolKeys ?? []),
  );
  const symbolTotal = task?.symbolChanges?.length ?? 0;
  return {
    symbolTotal,
    technicalCovered: allKeys.size,
    businessCovered: businessKeys.size,
    businessScopes: scopes.filter(
      (item) =>
        !["TECHNICAL", "UNKNOWN"].includes(item.boundaryType ?? "UNKNOWN"),
    ).length,
    inferred: scopes.filter((item) => item.businessConfidence === "MEDIUM")
      .length,
    pending: scopes.filter(
      (item) =>
        item.businessConfidence === "LOW" ||
        item.coverageStatus === "NEEDS_REVIEW",
    ).length,
  };
};

const businessImpactSummary = (projectId: string) =>
  summarizeBusinessImpacts(analysisDetail(projectId));
</script>

<template>
  <section class="release-overview">
    <div class="release-stat">
      <span>服务总数</span>
      <strong>{{ projects.length }}</strong>
    </div>
    <div class="release-stat">
      <span>存在新推送</span>
      <strong class="accent-count">{{
        projects.filter((project) => pushState(project) === "yes").length
      }}</strong>
    </div>
    <div class="release-hint">
      <span class="pulse-dot"></span>
      <span>系统每 5 分钟自动巡检生产分支</span>
      <div class="inspection-actions">
        <button class="inspection-log-action" @click="openInspectionLogs">
          <el-icon><Tickets /></el-icon>
          巡检日志
        </button>
        <button
          class="inspect-all-action"
          :disabled="checkingAll"
          @click="inspectAllProjects"
        >
          <el-icon :class="{ spinning: checkingAll }"><Refresh /></el-icon>
          {{ checkingAll ? "巡检中…" : "立即巡检" }}
        </button>
      </div>
    </div>
  </section>

  <section
    v-if="analysisPollingError"
    class="analysis-refresh-warning"
    role="alert"
  >
    <div>
      <strong>分析状态刷新失败，当前进度可能不是最新状态</strong>
      <p>
        {{ analysisPollingError }}
        <template v-if="analysisPollingFailedAt">
          · {{ formatCheckedAt(analysisPollingFailedAt) }}
        </template>
      </p>
    </div>
    <button
      type="button"
      :disabled="analysisPolling"
      @click="refreshAnalysisStatus"
    >
      <el-icon :class="{ spinning: analysisPolling }"><Refresh /></el-icon>
      {{ analysisPolling ? "重试中…" : "立即重试" }}
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
      <div
        v-for="(project, index) in projects"
        :key="project.id"
        class="release-record-group"
      >
        <div class="release-record">
          <div class="release-service">
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <div>
              <strong>{{ project.name }}</strong>
              <small>{{ project.code }}</small>
            </div>
          </div>
          <span class="branch-chip">{{ project.productionBranch }}</span>
          <code
            class="version-code current"
            :title="currentVersion(project) ?? '尚未分析'"
          >
            {{ shortCommit(currentVersion(project)) }}
          </code>
          <code
            class="version-code"
            :title="previousVersion(project) ?? '尚未分析'"
          >
            {{ shortCommit(previousVersion(project)) }}
          </code>
          <el-tooltip
            placement="top"
            effect="light"
            popper-class="version-tooltip"
            :disabled="intervalVersions(project).length === 0"
          >
            <template #content>
              <div class="version-tooltip-content">
                <p>间隔合并明细</p>
                <div
                  v-for="version in intervalVersions(project)"
                  :key="version.sha"
                >
                  <code>{{ version.shortSha }}</code>
                  <span>{{ version.subject }}</span>
                </div>
              </div>
            </template>
            <span
              class="interval-count"
              :class="{ active: intervalVersions(project).length > 0 }"
            >
              <strong>{{
                project.lastCheckedAt ? project.pendingCommitCount : "—"
              }}</strong>
              <small v-if="project.lastCheckedAt">次合并</small>
            </span>
          </el-tooltip>
          <div>
            <el-tooltip
              placement="top"
              :disabled="pushState(project) !== 'error'"
              :content="project.checkError ?? ''"
            >
              <span class="push-state" :class="pushState(project)">
                <i></i>
                {{
                  pushState(project) === "yes"
                    ? "是"
                    : pushState(project) === "no"
                      ? "否"
                      : pushState(project) === "checking"
                        ? "巡检中"
                        : pushState(project) === "error"
                          ? "巡检失败"
                          : "待巡检"
                }}
              </span>
            </el-tooltip>
            <small v-if="project.lastCheckedAt" class="checked-at">
              {{ formatCheckedAt(project.lastCheckedAt) }}
            </small>
          </div>
          <AnalysisTaskProgress
            v-if="analysisFor(project.id)"
            :task="analysisFor(project.id)!"
            compact
          />
          <span v-else class="analysis-status-empty">尚未分析</span>
          <div class="release-actions">
            <button
              class="detect-action"
              :disabled="
                detectingProjectId === project.id ||
                analysisIsActive(project.id) ||
                pushState(project) !== 'yes'
              "
              @click="startDetection(project)"
            >
              {{
                detectingProjectId === project.id ||
                analysisIsActive(project.id)
                  ? "分析中…"
                  : "变更分析"
              }}
            </button>
            <button
              class="ai-analysis-action"
              :disabled="
                analysisFor(project.id)?.status !== 'SUCCESS' ||
                analysisIsActive(project.id) ||
                aiAnalysisIsActive(project.id) ||
                startingAiProjectId === project.id
              "
              @click="startAiAnalysis(project)"
            >
              {{
                aiAnalysisIsActive(project.id) ||
                startingAiProjectId === project.id
                  ? "分析中"
                  : "AI 分析"
              }}
            </button>
            <button
              class="analysis-log-action"
              @click="openProjectAnalysisLogs(project)"
            >
              分析日志
            </button>
            <button
              class="expand-action"
              :disabled="!analysisFor(project.id)"
              @click="toggleAnalysis(project)"
            >
              {{ isExpanded(project.id) ? "收起" : "展开" }}
              <el-icon>
                <ArrowUp v-if="isExpanded(project.id)" />
                <ArrowDown v-else />
              </el-icon>
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
              <span class="analysis-status">
                {{ analysisStatusLabel(analysisDetail(project.id)?.status) }}
              </span>
              <strong>变更分析结果</strong>
            </div>
            <div class="result-header-actions">
              <div class="result-commits">
                <code>{{
                  shortCommit(analysisDetail(project.id)?.baseCommit)
                }}</code>
                <el-icon><ArrowRight /></el-icon>
                <code>{{
                  shortCommit(analysisDetail(project.id)?.targetCommit)
                }}</code>
              </div>
              <button
                class="rerun-analysis-action"
                :disabled="
                  analysisIsActive(project.id) ||
                  rerunningProjectId === project.id
                "
                title="使用相同版本区间重新执行变更分析"
                @click="rerunAnalysis(project)"
              >
                <el-icon
                  :class="{
                    spinning:
                      analysisIsActive(project.id) ||
                      rerunningProjectId === project.id,
                  }"
                >
                  <Refresh />
                </el-icon>
                {{
                  analysisIsActive(project.id) ||
                  rerunningProjectId === project.id
                    ? "分析中"
                    : "重新分析"
                }}
              </button>
            </div>
          </div>

          <AnalysisTaskProgress
            v-if="
              ['READY', 'RUNNING', 'FAILED'].includes(
                analysisDetail(project.id)?.status ?? '',
              )
            "
            :task="analysisDetail(project.id)!"
          />

          <template v-else>
            <div class="result-metrics">
              <div>
                <span>提交</span>
                <strong>{{ analysisDetail(project.id)?.commitCount }}</strong>
              </div>
              <div>
                <span>文件</span>
                <strong>{{
                  analysisDetail(project.id)?.changedFileCount
                }}</strong>
              </div>
              <div class="positive">
                <span>新增行</span>
                <strong>+{{ analysisDetail(project.id)?.additions }}</strong>
              </div>
              <div class="negative">
                <span>删除行</span>
                <strong>-{{ analysisDetail(project.id)?.deletions }}</strong>
              </div>
            </div>

            <section
              v-if="analysisDetail(project.id)?.riskLevel"
              class="impact-analysis"
            >
              <div class="impact-overview">
                <span
                  class="risk-badge"
                  :class="analysisDetail(project.id)?.riskLevel?.toLowerCase()"
                >
                  {{ riskLabel(analysisDetail(project.id)?.riskLevel ?? null) }}
                </span>
                <div>
                  <strong>变更影响评估</strong>
                  <p>{{ analysisDetail(project.id)?.riskSummary }}</p>
                </div>
              </div>
              <div class="business-coverage-grid">
                <article>
                  <span>业务入口覆盖</span>
                  <strong>
                    {{ businessCoverage(project.id).businessCovered }}
                    <small
                      >/
                      {{
                        businessCoverage(project.id).symbolTotal || "—"
                      }}
                      Symbol</small
                    >
                  </strong>
                </article>
                <article>
                  <span>业务回归范围</span>
                  <strong
                    >{{ businessCoverage(project.id).businessScopes }}
                    <small>项</small></strong
                  >
                </article>
                <article>
                  <span>业务语义推断</span>
                  <strong
                    >{{ businessCoverage(project.id).inferred }}
                    <small>项</small></strong
                  >
                </article>
                <article
                  :class="{ warning: businessCoverage(project.id).pending > 0 }"
                >
                  <span>待人工确认</span>
                  <strong
                    >{{ businessCoverage(project.id).pending }}
                    <small>项</small></strong
                  >
                </article>
              </div>
              <div class="impact-columns">
                <div class="business-module-summary">
                  <div class="business-module-heading">
                    <div>
                      <h4>影响模块汇总</h4>
                      <p>按产品一级模块归类，下方为具体影响点</p>
                    </div>
                    <strong
                      >{{
                        businessImpactSummary(project.id).modules.length
                      }}
                      个模块</strong
                    >
                  </div>
                  <div class="business-module-source-summary">
                    <span class="change-source">
                      变更分析
                      {{ businessImpactSummary(project.id).changeCount }} 项
                    </span>
                    <span class="ai-source">
                      AI 补充 {{ businessImpactSummary(project.id).aiCount }} 项
                    </span>
                    <span
                      v-if="businessImpactSummary(project.id).pendingCount"
                      class="pending-source"
                    >
                      {{
                        businessImpactSummary(project.id).pendingCount
                      }}
                      个待确认
                    </span>
                  </div>
                  <div class="impact-business-groups">
                    <section
                      v-for="module in businessImpactSummary(project.id).modules"
                      :key="module.key"
                      class="impact-business-group"
                    >
                      <header>
                        <strong>{{ module.name }}</strong>
                        <span>{{ module.items.length }} 个影响点</span>
                      </header>
                      <ul>
                        <li
                          v-for="item in module.items"
                          :key="item.key"
                          :class="{ 'needs-review': item.needsReview }"
                        >
                          <div class="business-impact-title">
                            <strong>{{ item.name }}</strong>
                            <em>{{ item.priority }}</em>
                          </div>
                          <div class="business-impact-sources">
                            <small v-if="item.changeCount" class="change-source">
                              变更 {{ item.changeCount }}
                            </small>
                            <small v-if="item.aiCount" class="ai-source">
                              AI {{ item.aiCount }}
                            </small>
                            <small v-if="item.needsReview" class="pending-source">
                              待确认
                            </small>
                          </div>
                        </li>
                      </ul>
                    </section>
                    <p
                      v-if="!businessImpactSummary(project.id).modules.length"
                      class="business-module-empty"
                    >
                      尚未识别到业务模块
                    </p>
                  </div>
                </div>
                <div class="regression-scope-panel">
                  <div class="regression-scope-heading">
                    <div>
                      <h4>业务回归范围</h4>
                      <p>按业务入口聚合；代码方法和调用链收纳为技术证据</p>
                    </div>
                    <div class="scope-summary-counts">
                      <span class="confirmed"
                        >{{
                          businessCoverage(project.id).businessScopes
                        }}
                        业务入口</span
                      >
                      <span
                        v-if="businessCoverage(project.id).pending"
                        class="needs-review"
                        >{{ businessCoverage(project.id).pending }} 待确认</span
                      >
                    </div>
                  </div>
                  <ol class="regression-list scope-map-list">
                    <li
                      v-for="suggestion in analysisDetail(project.id)
                        ?.regressionSuggestions"
                      :key="`${suggestion.title}-${suggestion.scope}`"
                      :class="suggestion.coverageStatus?.toLowerCase()"
                    >
                      <span class="scope-priority">{{
                        suggestion.priority
                      }}</span>
                      <div class="scope-map-content">
                        <div class="scope-map-title">
                          <strong>{{
                            suggestion.businessScenario || suggestion.title
                          }}</strong>
                          <span
                            v-if="suggestion.businessDomain"
                            class="business-domain"
                          >
                            {{ suggestion.businessDomain }}
                          </span>
                          <span>{{
                            boundaryTypeLabel(suggestion.boundaryType)
                          }}</span>
                          <span class="relation">{{
                            impactRelationLabel(suggestion.impactRelation)
                          }}</span>
                          <span
                            class="coverage-status"
                            :class="suggestion.coverageStatus?.toLowerCase()"
                            >{{
                              coverageStatusLabel(suggestion.coverageStatus)
                            }}</span
                          >
                        </div>
                        <p>{{ suggestion.scope }}</p>
                        <div class="scope-confidence-row">
                          <span
                            :class="
                              suggestion.technicalConfidence?.toLowerCase()
                            "
                          >
                            技术关系：{{
                              confidenceText(
                                suggestion.technicalConfidence ||
                                  suggestion.confidence,
                              )
                            }}
                          </span>
                          <span
                            :class="
                              suggestion.businessConfidence?.toLowerCase()
                            "
                          >
                            业务归属：{{
                              confidenceText(suggestion.businessConfidence)
                            }}
                          </span>
                          <span v-if="suggestion.sourceSymbolKeys?.length">
                            覆盖 {{ suggestion.sourceSymbolKeys.length }} 个变更
                            Symbol
                          </span>
                        </div>
                        <div
                          v-if="suggestion.entryPoints?.length"
                          class="scope-entry-points"
                        >
                          <code
                            v-for="entry in suggestion.entryPoints"
                            :key="entry"
                            >{{ entry }}</code
                          >
                        </div>
                        <details
                          v-if="suggestion.evidence?.length"
                          class="scope-evidence"
                        >
                          <summary>
                            展开 {{ suggestion.evidence.length }} 条技术证据
                          </summary>
                          <code
                            v-for="evidence in suggestion.evidence"
                            :key="evidence"
                            >{{ evidence }}</code
                          >
                        </details>
                      </div>
                    </li>
                  </ol>
                </div>
              </div>
            </section>

            <section
              v-if="
                analysisDetail(project.id)?.aiAnalysis &&
                analysisDetail(project.id)?.aiAnalysis?.status !== 'DISABLED'
              "
              class="ai-analysis"
              :class="
                analysisDetail(project.id)?.aiAnalysis?.status.toLowerCase()
              "
            >
              <header class="ai-analysis-header">
                <span class="ai-analysis-icon"><DataAnalysis /></span>
                <div>
                  <strong>AI 补充影响分析</strong>
                  <p v-if="analysisDetail(project.id)?.aiAnalysis?.model">
                    {{ analysisDetail(project.id)?.aiAnalysis?.model }} ·
                    用于补充业务语义和静态分析盲区，不覆盖确定性证据
                  </p>
                </div>
                <span
                  v-if="analysisDetail(project.id)?.aiAnalysis?.riskLevel"
                  class="risk-badge"
                  :class="
                    analysisDetail(
                      project.id,
                    )?.aiAnalysis?.riskLevel?.toLowerCase()
                  "
                >
                  {{
                    riskLabel(
                      analysisDetail(project.id)?.aiAnalysis?.riskLevel ?? null,
                    )
                  }}
                </span>
              </header>
              <div
                v-if="
                  analysisDetail(project.id)?.aiAnalysis?.status === 'RUNNING'
                "
                class="analysis-running-state ai-running-state"
              >
                <span class="analysis-running-indicator"></span>
                <div>
                  <strong>
                    {{
                      analysisDetail(project.id)?.aiNextAttemptAt
                        ? "AI 分析等待自动重试"
                        : "AI 正在分析变更分析结果"
                    }}
                  </strong>
                  <p>
                    第
                    {{
                      Math.max(
                        1,
                        analysisDetail(project.id)?.aiAttemptCount ?? 0,
                      )
                    }}
                    /
                    {{ analysisDetail(project.id)?.aiMaxAttempts ?? 3 }} 次执行
                    <template
                      v-if="analysisDetail(project.id)?.aiNextAttemptAt"
                    >
                      ·
                      {{
                        formatCheckedAt(
                          analysisDetail(project.id)?.aiNextAttemptAt ?? null,
                        )
                      }}
                      重试
                    </template>
                  </p>
                  <p
                    v-if="analysisDetail(project.id)?.aiAnalysis?.errorMessage"
                    class="ai-retry-error"
                    role="alert"
                  >
                    上次失败：{{
                      analysisDetail(project.id)?.aiAnalysis?.errorMessage
                    }}
                  </p>
                </div>
              </div>
              <div
                v-else-if="
                  analysisDetail(project.id)?.aiAnalysis?.status === 'SUCCESS'
                "
                class="ai-analysis-content"
              >
                <p class="ai-analysis-summary">
                  {{ analysisDetail(project.id)?.aiAnalysis?.summary }}
                </p>
                <div class="ai-analysis-columns">
                  <div class="ai-findings-panel">
                    <h4>关键发现</h4>
                    <ul class="ai-finding-list">
                      <li
                        v-for="finding in analysisDetail(project.id)?.aiAnalysis
                          ?.keyFindings"
                        :key="finding"
                      >
                        {{ finding }}
                      </li>
                    </ul>
                  </div>
                  <div class="ai-regression-scopes">
                    <h4>AI 补充的回归范围</h4>
                    <article
                      v-for="suggestion in analysisDetail(project.id)
                        ?.aiAnalysis?.regressionSuggestions"
                      :key="suggestion.title"
                    >
                      <header>
                        <span>{{ suggestion.priority }}</span>
                        <strong>{{
                          suggestion.businessScenario || suggestion.title
                        }}</strong>
                        <em class="scope-type">{{
                          boundaryTypeLabel(suggestion.boundaryType) ||
                          targetTypeLabel(suggestion.targetType)
                        }}</em>
                        <em class="scope-relation">{{
                          impactRelationLabel(suggestion.impactRelation)
                        }}</em>
                        <em
                          :class="
                            (
                              suggestion.businessConfidence ||
                              suggestion.confidence
                            )?.toLowerCase()
                          "
                          >业务{{
                            confidenceText(
                              suggestion.businessConfidence ||
                                suggestion.confidence,
                            )
                          }}</em
                        >
                      </header>
                      <p class="ai-scope-summary">{{ suggestion.scope }}</p>

                      <div
                        v-if="suggestion.entryPoints?.length"
                        class="ai-entry-points"
                      >
                        <span
                          v-for="entry in suggestion.entryPoints"
                          :key="entry"
                          >{{ entry }}</span
                        >
                      </div>

                      <footer v-if="suggestion.evidence?.length">
                        <strong>影响证据</strong>
                        <code
                          v-for="evidence in suggestion.evidence"
                          :key="evidence"
                          >{{ evidence }}</code
                        >
                      </footer>
                    </article>
                  </div>
                </div>
              </div>
              <p v-else class="ai-analysis-error">
                AI 分析未完成：{{
                  analysisDetail(project.id)?.aiAnalysis?.errorMessage
                }}
              </p>
            </section>

            <section
              v-if="analysisDetail(project.id)?.symbolSummary"
              class="symbol-analysis"
            >
              <header class="symbol-analysis-header">
                <span class="symbol-analysis-icon"><DataAnalysis /></span>
                <div>
                  <strong>TypeScript Symbol 影响</strong>
                  <p>{{ analysisDetail(project.id)?.symbolSummary }}</p>
                </div>
                <button
                  class="detail-toggle"
                  type="button"
                  :aria-expanded="
                    isDetailSectionExpanded(project.id, 'symbols')
                  "
                  :aria-label="
                    isDetailSectionExpanded(project.id, 'symbols')
                      ? '收起 TypeScript Symbol 影响'
                      : '展开 TypeScript Symbol 影响'
                  "
                  :title="
                    isDetailSectionExpanded(project.id, 'symbols')
                      ? '收起'
                      : '展开'
                  "
                  @click="toggleDetailSection(project.id, 'symbols')"
                >
                  <el-icon>
                    <ArrowUp
                      v-if="isDetailSectionExpanded(project.id, 'symbols')"
                    />
                    <ArrowDown v-else />
                  </el-icon>
                </button>
              </header>

              <template v-if="isDetailSectionExpanded(project.id, 'symbols')">
                <div
                  v-if="analysisDetail(project.id)?.symbolChanges?.length"
                  class="symbol-analysis-grid"
                >
                  <div class="symbol-change-panel">
                    <h4>
                      变更 Symbol
                      <span>{{
                        analysisDetail(project.id)?.symbolChanges?.length
                      }}</span>
                    </h4>
                    <div class="symbol-change-list">
                      <article
                        v-for="symbol in analysisDetail(
                          project.id,
                        )?.symbolChanges?.slice(0, 12)"
                        :key="`${symbol.changeType}-${symbol.key}`"
                      >
                        <span
                          class="symbol-change-type"
                          :class="symbol.changeType.toLowerCase()"
                        >
                          {{ symbolChangeLabel(symbol.changeType) }}
                        </span>
                        <div>
                          <strong>
                            <em
                              v-if="
                                symbol.projectId &&
                                symbol.projectId !== project.id
                              "
                              class="symbol-project-badge"
                              >{{ symbol.projectName }}</em
                            >
                            {{ symbol.qualifiedName }}
                          </strong>
                          <p>
                            {{ symbolKindLabel(symbol.kind) }} ·
                            {{ symbol.filePath }}:{{ symbol.startLine }}
                          </p>
                          <div
                            v-if="symbol.httpRoutes?.length"
                            class="symbol-http-routes"
                          >
                            <span
                              v-for="route in symbol.httpRoutes"
                              :key="`${symbol.key}-${route.role}-${route.method}-${route.path}`"
                              class="symbol-http-route"
                              :class="route.role.toLowerCase()"
                            >
                              {{ route.method }} {{ route.path }}
                            </span>
                          </div>
                        </div>
                        <span
                          class="symbol-risk"
                          :class="symbol.riskLevel.toLowerCase()"
                        >
                          {{ riskLabel(symbol.riskLevel) }}
                        </span>
                      </article>
                    </div>
                  </div>

                  <div class="symbol-chain-panel">
                    <h4>
                      上游调用链
                      <span>{{
                        analysisDetail(project.id)?.symbolImpacts?.length ?? 0
                      }}</span>
                    </h4>
                    <div
                      v-if="analysisDetail(project.id)?.symbolImpacts?.length"
                      class="symbol-chain-list"
                    >
                      <article
                        v-for="impact in analysisDetail(
                          project.id,
                        )?.symbolImpacts?.slice(0, 10)"
                        :key="`${impact.changedSymbolKey}-${impact.impactedSymbol.key}`"
                        :title="impact.reason"
                      >
                        <div class="symbol-chain-depth">
                          {{ impact.depth }} 层
                        </div>
                        <div class="symbol-chain-path">
                          <template
                            v-for="(node, index) in impact.callChain"
                            :key="node.key"
                          >
                            <em
                              v-if="
                                node.projectId && node.projectId !== project.id
                              "
                              class="symbol-project-badge"
                              >{{ node.projectName }}</em
                            >
                            <code>{{ node.qualifiedName }}</code>
                            <span
                              v-for="route in node.httpRoutes"
                              :key="`${node.key}-${route.role}-${route.method}-${route.path}`"
                              class="symbol-http-route"
                              :class="route.role.toLowerCase()"
                            >
                              {{ route.method }} {{ route.path }}
                            </span>
                            <ArrowRight
                              v-if="index < impact.callChain.length - 1"
                            />
                          </template>
                        </div>
                      </article>
                    </div>
                    <div v-else class="symbol-chain-empty">
                      未发现项目内的上游静态调用
                    </div>
                  </div>
                </div>
                <div v-else class="symbol-analysis-empty">
                  本次 TypeScript 变更没有落在可识别的类、方法、函数或类型上。
                </div>
              </template>
            </section>

            <section
              v-if="analysisDetail(project.id)?.files?.length"
              class="detail-disclosure"
            >
              <header class="detail-disclosure-header">
                <div>
                  <strong>具体变动文件</strong>
                  <p>
                    共 {{ analysisDetail(project.id)?.files?.length ?? 0 }}
                    个文件，需要时展开查看路径和增删行数
                  </p>
                </div>
                <button
                  class="detail-toggle"
                  type="button"
                  :aria-expanded="isDetailSectionExpanded(project.id, 'files')"
                  :aria-label="
                    isDetailSectionExpanded(project.id, 'files')
                      ? '收起具体变动文件'
                      : '展开具体变动文件'
                  "
                  :title="
                    isDetailSectionExpanded(project.id, 'files')
                      ? '收起'
                      : '展开'
                  "
                  @click="toggleDetailSection(project.id, 'files')"
                >
                  <el-icon>
                    <ArrowUp
                      v-if="isDetailSectionExpanded(project.id, 'files')"
                    />
                    <ArrowDown v-else />
                  </el-icon>
                </button>
              </header>
              <div
                v-if="isDetailSectionExpanded(project.id, 'files')"
                class="file-table detail-file-table"
              >
                <div class="file-row file-head">
                  <span>状态</span><span>文件</span><span>变更行</span>
                </div>
                <div
                  v-for="file in analysisDetail(project.id)?.files"
                  :key="`${file.changeType}-${file.path}`"
                  class="file-row"
                >
                  <span
                    class="change-badge"
                    :class="file.changeType.toLowerCase()"
                  >
                    {{ file.changeType }}
                  </span>
                  <div>
                    <code>{{ file.path }}</code>
                    <small v-if="file.oldPath">
                      原路径：{{ file.oldPath }}
                    </small>
                  </div>
                  <span class="line-count">
                    <b>+{{ file.additions }}</b>
                    <i>-{{ file.deletions }}</i>
                  </span>
                </div>
              </div>
            </section>

            <div
              v-else-if="analysisDetail(project.id)?.status !== 'RUNNING'"
              class="no-file-change"
            >
              本次分析没有文件变更
            </div>
          </template>
        </section>
      </div>
    </div>

    <div v-else class="release-empty">
      <span>NO SERVICES</span>
      <h2>还没有可以分析的服务</h2>
      <p>先添加服务和生产分支，发布分析列表会自动生成。</p>
      <button class="primary-action" @click="openCreateProject">
        添加服务
      </button>
    </div>
  </section>
</template>
