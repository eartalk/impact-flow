<script setup lang="ts">
import { ArrowDown, ArrowRight, ArrowUp, DataAnalysis, Refresh, Tickets } from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../workspace-context";
import AnalysisTaskProgress from "../components/analysis/AnalysisTaskProgress.vue";

const { projects, loading, detectingProjectId, rerunningProjectId, startingAiProjectId, detailLoadingProjectId, checkingAll, shortCommit, formatCheckedAt, openCreateProject, analysisFor, analysisIsActive, aiAnalysisIsActive, analysisStatusLabel, riskLabel, confidenceLabel, symbolKindLabel, symbolChangeLabel, analysisDetail, isExpanded, isDetailSectionExpanded, toggleDetailSection, toggleAnalysis, currentVersion, previousVersion, intervalVersions, pushState, openProjectAnalysisLogs, openInspectionLogs, inspectAllProjects, startDetection, rerunAnalysis, startAiAnalysis } = useWorkspaceContext();
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
                <el-icon :class="{ spinning: checkingAll }"
                  ><Refresh
                /></el-icon>
                {{ checkingAll ? "巡检中…" : "立即巡检" }}
              </button>
            </div>
          </div>
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
                      <p>间隔版本明细</p>
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
                    <small v-if="project.lastCheckedAt">次</small>
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
                      {{
                        analysisStatusLabel(analysisDetail(project.id)?.status)
                      }}
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
                  v-if="['READY', 'RUNNING', 'FAILED'].includes(analysisDetail(project.id)?.status ?? '')"
                  :task="analysisDetail(project.id)!"
                />

                <template v-else>
                  <div class="result-metrics">
                    <div>
                      <span>提交</span>
                      <strong>{{
                        analysisDetail(project.id)?.commitCount
                      }}</strong>
                    </div>
                    <div>
                      <span>文件</span>
                      <strong>{{
                        analysisDetail(project.id)?.changedFileCount
                      }}</strong>
                    </div>
                    <div class="positive">
                      <span>新增行</span>
                      <strong
                        >+{{ analysisDetail(project.id)?.additions }}</strong
                      >
                    </div>
                    <div class="negative">
                      <span>删除行</span>
                      <strong
                        >-{{ analysisDetail(project.id)?.deletions }}</strong
                      >
                    </div>
                  </div>

                  <section
                    v-if="analysisDetail(project.id)?.riskLevel"
                    class="impact-analysis"
                  >
                    <div class="impact-overview">
                      <span
                        class="risk-badge"
                        :class="
                          analysisDetail(project.id)?.riskLevel?.toLowerCase()
                        "
                      >
                        {{
                          riskLabel(
                            analysisDetail(project.id)?.riskLevel ?? null,
                          )
                        }}
                      </span>
                      <div>
                        <strong>变更影响评估</strong>
                        <p>{{ analysisDetail(project.id)?.riskSummary }}</p>
                      </div>
                    </div>
                    <div class="impact-columns">
                      <div>
                        <h4>影响模块</h4>
                        <div class="impact-module-list">
                          <article
                            v-for="module in analysisDetail(project.id)
                              ?.impactedModules"
                            :key="module.name"
                          >
                            <strong>{{ module.name }}</strong>
                            <span>{{ module.reason }}</span>
                          </article>
                        </div>
                      </div>
                      <div>
                        <h4>回归建议</h4>
                        <ol class="regression-list">
                          <li
                            v-for="suggestion in analysisDetail(project.id)
                              ?.regressionSuggestions"
                            :key="suggestion.title"
                          >
                            <span>{{ suggestion.priority }}</span>
                            <div>
                              <strong>{{ suggestion.title }}</strong>
                              <p>{{ suggestion.scope }}</p>
                            </div>
                          </li>
                        </ol>
                      </div>
                    </div>
                  </section>

                  <section
                    v-if="
                      analysisDetail(project.id)?.aiAnalysis &&
                      analysisDetail(project.id)?.aiAnalysis?.status !==
                        'DISABLED'
                    "
                    class="ai-analysis"
                    :class="
                      analysisDetail(
                        project.id,
                      )?.aiAnalysis?.status.toLowerCase()
                    "
                  >
                    <header class="ai-analysis-header">
                      <span class="ai-analysis-icon"><DataAnalysis /></span>
                      <div>
                        <strong>AI 分析</strong>
                        <p v-if="analysisDetail(project.id)?.aiAnalysis?.model">
                          {{ analysisDetail(project.id)?.aiAnalysis?.model }} ·
                          AI 结论不覆盖规则结果
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
                            analysisDetail(project.id)?.aiAnalysis?.riskLevel ??
                              null,
                          )
                        }}
                      </span>
                    </header>
                    <div
                      v-if="
                        analysisDetail(project.id)?.aiAnalysis?.status ===
                        'RUNNING'
                      "
                      class="analysis-running-state ai-running-state"
                    >
                      <span class="analysis-running-indicator"></span>
                      <div>
                        <strong>
                          {{ analysisDetail(project.id)?.aiNextAttemptAt ? "AI 分析等待自动重试" : "AI 正在分析变更分析结果" }}
                        </strong>
                        <p>
                          第 {{ Math.max(1, analysisDetail(project.id)?.aiAttemptCount ?? 0) }} / {{ analysisDetail(project.id)?.aiMaxAttempts ?? 3 }} 次执行
                          <template v-if="analysisDetail(project.id)?.aiNextAttemptAt">
                            · {{ formatCheckedAt(analysisDetail(project.id)?.aiNextAttemptAt ?? null) }} 重试
                          </template>
                        </p>
                        <p
                          v-if="analysisDetail(project.id)?.aiAnalysis?.errorMessage"
                          class="ai-retry-error"
                          role="alert"
                        >
                          上次失败：{{ analysisDetail(project.id)?.aiAnalysis?.errorMessage }}
                        </p>
                      </div>
                    </div>
                    <div
                      v-else-if="
                        analysisDetail(project.id)?.aiAnalysis?.status ===
                        'SUCCESS'
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
                              v-for="finding in analysisDetail(project.id)
                                ?.aiAnalysis?.keyFindings"
                              :key="finding"
                            >
                              {{ finding }}
                            </li>
                          </ul>
                        </div>
                        <div class="ai-regression-scopes">
                          <h4>可执行回归范围</h4>
                          <article
                              v-for="suggestion in analysisDetail(project.id)
                                ?.aiAnalysis?.regressionSuggestions"
                              :key="suggestion.title"
                            >
                              <header>
                                <span>{{ suggestion.priority }}</span>
                                <strong>{{ suggestion.title }}</strong>
                                <em
                                  :class="suggestion.confidence?.toLowerCase()"
                                >{{ confidenceLabel(suggestion.confidence) }}</em>
                              </header>
                              <p class="ai-scope-summary">{{ suggestion.scope }}</p>

                              <div
                                v-if="suggestion.entryPoints?.length"
                                class="ai-entry-points"
                              >
                                <span
                                  v-for="entry in suggestion.entryPoints"
                                  :key="entry"
                                >{{ entry }}</span>
                              </div>

                              <div
                                v-if="
                                  suggestion.scenarios?.length ||
                                  suggestion.steps?.length ||
                                  suggestion.expectedResults?.length
                                "
                                class="ai-scope-grid"
                              >
                                <section v-if="suggestion.scenarios?.length">
                                  <h5>回归场景</h5>
                                  <ul>
                                    <li
                                      v-for="scenario in suggestion.scenarios"
                                      :key="scenario"
                                    >{{ scenario }}</li>
                                  </ul>
                                </section>
                                <section v-if="suggestion.steps?.length">
                                  <h5>执行步骤</h5>
                                  <ol>
                                    <li
                                      v-for="step in suggestion.steps"
                                      :key="step"
                                    >{{ step }}</li>
                                  </ol>
                                </section>
                                <section v-if="suggestion.expectedResults?.length">
                                  <h5>预期结果</h5>
                                  <ul>
                                    <li
                                      v-for="expected in suggestion.expectedResults"
                                      :key="expected"
                                    >{{ expected }}</li>
                                  </ul>
                                </section>
                              </div>

                              <footer v-if="suggestion.evidence?.length">
                                <strong>判断依据</strong>
                                <code
                                  v-for="evidence in suggestion.evidence"
                                  :key="evidence"
                                >{{ evidence }}</code>
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
                            v-if="
                              isDetailSectionExpanded(project.id, 'symbols')
                            "
                          />
                          <ArrowDown v-else />
                        </el-icon>
                      </button>
                    </header>

                    <template
                      v-if="isDetailSectionExpanded(project.id, 'symbols')"
                    >
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
                            analysisDetail(project.id)?.symbolImpacts?.length ??
                            0
                          }}</span>
                        </h4>
                        <div
                          v-if="
                            analysisDetail(project.id)?.symbolImpacts?.length
                          "
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
                                    node.projectId &&
                                    node.projectId !== project.id
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
                        本次 TypeScript
                        变更没有落在可识别的类、方法、函数或类型上。
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
                        :aria-expanded="
                          isDetailSectionExpanded(project.id, 'files')
                        "
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
                            v-if="
                              isDetailSectionExpanded(project.id, 'files')
                            "
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
