<script setup lang="ts">
import type { AnalysisTask } from "@impact-flow/contracts";
defineProps<{ task: AnalysisTask }>();

const relevanceLabel = {
  BUSINESS_RELEVANT: "业务分析",
  TECHNICAL_VALIDATION: "技术验证",
  IGNORED: "已忽略",
  NEEDS_REVIEW: "待确认",
} as const;
</script>

<template>
  <details class="evidence-panel">
    <summary>
      <span class="summary-copy">
        <b>WHY</b>
        <strong>评定依据</strong>
        <small>代码变更、固定版本与文件证据</small>
      </span>
      <span class="summary-action">
        <span class="closed-label">展开依据</span>
        <span class="open-label">收起依据</span>
        <i aria-hidden="true"></i>
      </span>
    </summary>

    <div class="evidence-content">
      <section
        v-if="task.analysisContext?.relevance"
        class="relevance-evidence"
      >
        <div class="relevance-heading">
          <strong>变更相关性过滤</strong>
          <small>{{ task.analysisContext.relevance.policyVersion }}</small>
        </div>
        <div class="relevance-stats">
          <span class="business"
            >{{
              task.analysisContext.relevance.businessRelevant
            }}
            业务分析</span
          >
          <span class="technical"
            >{{
              task.analysisContext.relevance.technicalValidation
            }}
            技术验证</span
          >
          <span class="ignored"
            >{{ task.analysisContext.relevance.ignored }} 已忽略</span
          >
          <span class="review"
            >{{ task.analysisContext.relevance.needsReview }} 待确认</span
          >
        </div>
        <div class="relevance-list">
          <article
            v-for="decision in task.analysisContext.relevance.decisions"
            :key="`${decision.filePath}:${decision.rule}`"
            :data-classification="decision.classification"
          >
            <b>{{ relevanceLabel[decision.classification] }}</b>
            <code>{{ decision.filePath }}</code>
            <span>{{ decision.reason }}</span>
          </article>
        </div>
      </section>

      <section class="semantic-evidence">
        <strong>语义变更</strong>
        <div class="semantic-list">
          <article v-for="unit in task.changeUnits ?? []" :key="unit.id">
            <b>{{ unit.changeKind }}</b>
            <h4>{{ unit.title }}</h4>
            <p>{{ unit.summary }}</p>
            <code
              >{{ unit.filePath
              }}{{ unit.startLine ? `:${unit.startLine}` : "" }}</code
            >
          </article>
          <p v-if="!task.changeUnits?.length" class="muted">
            本次结果来自文件级分析，没有可展示的 Symbol 变更。
          </p>
        </div>
      </section>

      <section v-if="task.analysisContext">
        <strong>固定版本上下文</strong>
        <p
          v-for="repo in task.analysisContext.repositories"
          :key="repo.projectId"
          class="repo-line"
        >
          <span>{{ repo.projectName }}</span
          ><code>{{ repo.commit.slice(0, 8) }}</code>
        </p>
        <small>{{ task.analysisContext.analyzerVersion }}</small>
      </section>

      <section v-if="task.files?.length">
        <strong>变更文件</strong>
        <code
          v-for="file in task.files.slice(0, 12)"
          :key="file.path"
          class="file-line"
          >{{ file.path }}</code
        >
      </section>
    </div>
  </details>
</template>

<style scoped>
.evidence-panel {
  background: #f7f9fb;
  color: #425466;
  border-top: 1px solid #dfe5ea;
}
.evidence-panel > summary {
  min-height: 50px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: background 150ms ease;
}
.evidence-panel > summary::-webkit-details-marker {
  display: none;
}
.evidence-panel > summary:hover {
  background: #f1f5f8;
}
.summary-copy {
  min-width: 0;
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 8px;
}
.summary-copy > b {
  color: #467db9;
  font: 700 9px/1.3 var(--font-mono);
  letter-spacing: 0.08em;
}
.summary-copy > strong {
  color: #344353;
  font: 600 12px/1.4 var(--font-ui);
}
.summary-copy > small {
  padding-left: 8px;
  color: #8995a1;
  font-size: 9px;
  border-left: 1px solid #d9e0e6;
}
.summary-action {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #66798b;
  font-size: 9px;
  white-space: nowrap;
}
.summary-action i {
  width: 7px;
  height: 7px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 160ms ease;
}
.open-label {
  display: none;
}
.evidence-panel[open] .closed-label {
  display: none;
}
.evidence-panel[open] .open-label {
  display: inline;
}
.evidence-panel[open] .summary-action i {
  transform: rotate(225deg) translate(-1px, -1px);
}
.evidence-content {
  padding: 0 14px 14px;
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 14px;
  border-top: 1px solid #e5eaee;
}
.evidence-content section {
  min-width: 0;
  padding-top: 12px;
}
.evidence-content section + section {
  padding-left: 14px;
  border-left: 1px solid #e0e6ec;
}
.evidence-content section > strong {
  display: block;
  margin-bottom: 8px;
  color: #687787;
  font-size: 10px;
}
.evidence-content .relevance-evidence {
  grid-column: 1/-1;
  padding: 12px 0 2px;
  border-left: 0;
}
.relevance-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.relevance-heading strong {
  color: #526477;
  font-size: 10px;
}
.relevance-heading small {
  color: #96a2ae;
  font: 500 8px/1 var(--font-mono);
}
.relevance-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.relevance-stats span {
  padding: 3px 7px;
  border: 1px solid #dce4ea;
  background: #fff;
  color: #607284;
  font-size: 8px;
}
.relevance-stats .business {
  border-color: #b8d2ea;
  color: #3976ad;
}
.relevance-stats .technical {
  border-color: #d9ccaa;
  color: #8b6b22;
}
.relevance-stats .ignored {
  color: #89949e;
}
.relevance-stats .review {
  border-color: #e0c3bd;
  color: #a15c4d;
}
.relevance-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 12px;
  max-height: 180px;
  overflow: auto;
}
.relevance-list article {
  display: grid;
  grid-template-columns: 52px minmax(120px, 0.7fr) minmax(180px, 1.3fr);
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 5px 7px;
  border: 1px solid #e4e9ed;
  border-left: 2px solid #91acc4;
  background: #fff;
}
.relevance-list article[data-classification="IGNORED"] {
  border-left-color: #b8c0c7;
}
.relevance-list article[data-classification="TECHNICAL_VALIDATION"] {
  border-left-color: #c8a85b;
}
.relevance-list article[data-classification="NEEDS_REVIEW"] {
  border-left-color: #c98776;
}
.relevance-list article b {
  font-size: 8px;
}
.relevance-list article span {
  color: #778491;
  font-size: 8px;
  line-height: 1.45;
}
.semantic-list {
  max-height: 340px;
  padding-right: 6px;
  overflow: auto;
}
.evidence-content article {
  margin-bottom: 9px;
  padding-left: 8px;
  border-left: 2px solid #9bb6cf;
}
.evidence-content article b {
  color: #467db9;
  font: 700 9px/1.3 var(--font-mono);
}
.evidence-content h4 {
  margin: 2px 0;
  color: #405264;
  font-size: 10px;
}
.evidence-content p {
  margin: 2px 0;
  color: #6c7986;
  font-size: 9px;
  line-height: 1.55;
}
.evidence-content code {
  color: #52697e;
  font-size: 9px;
  overflow-wrap: anywhere;
}
.repo-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.file-line {
  display: block;
  margin: 4px 0;
}
.muted {
  color: #84909a;
}
@media (max-width: 900px) {
  .summary-copy {
    grid-template-columns: auto 1fr;
  }
  .summary-copy > small {
    display: none;
  }
  .evidence-content {
    grid-template-columns: 1fr;
  }
  .evidence-content section + section {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid #e0e6ec;
  }
  .relevance-list {
    grid-template-columns: 1fr;
  }
  .relevance-list article {
    grid-template-columns: 52px 1fr;
  }
  .relevance-list article span {
    grid-column: 1/-1;
  }
}
</style>
