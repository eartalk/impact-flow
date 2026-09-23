<script setup lang="ts">
import type { AnalysisTask } from '@impact-flow/contracts';
defineProps<{ task: AnalysisTask }>();
</script>

<template>
  <details class="evidence-panel">
    <summary>
      <span class="summary-copy">
        <b>WHY</b>
        <strong>系统为什么这样判断</strong>
        <small>代码变更、固定版本与文件证据</small>
      </span>
      <span class="summary-action">
        <span class="closed-label">展开依据</span>
        <span class="open-label">收起依据</span>
        <i aria-hidden="true"></i>
      </span>
    </summary>

    <div class="evidence-content">
      <section class="semantic-evidence">
        <strong>语义变更</strong>
        <div class="semantic-list">
          <article v-for="unit in task.changeUnits ?? []" :key="unit.id">
            <b>{{ unit.changeKind }}</b>
            <h4>{{ unit.title }}</h4>
            <p>{{ unit.summary }}</p>
            <code>{{ unit.filePath }}{{ unit.startLine ? `:${unit.startLine}` : '' }}</code>
          </article>
          <p v-if="!task.changeUnits?.length" class="muted">
            本次结果来自文件级分析，没有可展示的 Symbol 变更。
          </p>
        </div>
      </section>

      <section v-if="task.analysisContext">
        <strong>固定版本上下文</strong>
        <p v-for="repo in task.analysisContext.repositories" :key="repo.projectId" class="repo-line">
          <span>{{ repo.projectName }}</span><code>{{ repo.commit.slice(0, 8) }}</code>
        </p>
        <small>{{ task.analysisContext.analyzerVersion }}</small>
      </section>

      <section v-if="task.files?.length">
        <strong>变更文件</strong>
        <code v-for="file in task.files.slice(0, 12)" :key="file.path" class="file-line">{{ file.path }}</code>
      </section>
    </div>
  </details>
</template>

<style scoped>
.evidence-panel{background:#f7f9fb;color:#425466;border-top:1px solid #dfe5ea}.evidence-panel>summary{min-height:50px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;list-style:none;user-select:none;transition:background 150ms ease}.evidence-panel>summary::-webkit-details-marker{display:none}.evidence-panel>summary:hover{background:#f1f5f8}.summary-copy{min-width:0;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px}.summary-copy>b{color:#467db9;font:700 9px/1.3 var(--font-mono);letter-spacing:.08em}.summary-copy>strong{color:#344353;font:600 12px/1.4 var(--font-ui)}.summary-copy>small{padding-left:8px;color:#8995a1;font-size:9px;border-left:1px solid #d9e0e6}.summary-action{display:flex;align-items:center;gap:7px;color:#66798b;font-size:9px;white-space:nowrap}.summary-action i{width:7px;height:7px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform 160ms ease}.open-label{display:none}.evidence-panel[open] .closed-label{display:none}.evidence-panel[open] .open-label{display:inline}.evidence-panel[open] .summary-action i{transform:rotate(225deg) translate(-1px,-1px)}.evidence-content{padding:0 14px 14px;display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr) minmax(180px,1fr);gap:14px;border-top:1px solid #e5eaee}.evidence-content section{min-width:0;padding-top:12px}.evidence-content section+section{padding-left:14px;border-left:1px solid #e0e6ec}.evidence-content section>strong{display:block;margin-bottom:8px;color:#687787;font-size:10px}.semantic-list{max-height:340px;padding-right:6px;overflow:auto}.evidence-content article{margin-bottom:9px;padding-left:8px;border-left:2px solid #9bb6cf}.evidence-content article b{color:#467db9;font:700 9px/1.3 var(--font-mono)}.evidence-content h4{margin:2px 0;color:#405264;font-size:10px}.evidence-content p{margin:2px 0;color:#6c7986;font-size:9px;line-height:1.55}.evidence-content code{color:#52697e;font-size:9px;overflow-wrap:anywhere}.repo-line{display:flex;justify-content:space-between;gap:8px}.file-line{display:block;margin:4px 0}.muted{color:#84909a}
@media(max-width:900px){.summary-copy{grid-template-columns:auto 1fr}.summary-copy>small{display:none}.evidence-content{grid-template-columns:1fr}.evidence-content section+section{padding-left:0;border-left:0;border-top:1px solid #e0e6ec}}
</style>
