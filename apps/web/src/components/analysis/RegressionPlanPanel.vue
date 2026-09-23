<script setup lang="ts">
import { computed } from "vue";
import type { AnalysisTask, RegressionTarget } from "@impact-flow/contracts";

const props = defineProps<{ task: AnalysisTask }>();
const emit = defineEmits<{
  feedback: [targetId: string, decision: "CONFIRMED" | "EXCLUDED" | "PENDING"];
}>();
const plan = computed(() => props.task.regressionPlan);
const legacyTargets = computed<RegressionTarget[]>(() =>
  (props.task.regressionSuggestions ?? []).map((item, index) => ({
    ...item,
    id: `legacy-${index}`,
    reason: item.scope,
    verificationPoints:
      item.expectedResults ?? item.scenarios ?? item.steps ?? [],
    relatedTests: [],
  })),
);
const targets = computed(() => plan.value?.targets ?? legacyTargets.value);
const feedbackFor = (targetId: string) =>
  props.task.regressionFeedback?.find((item) => item.targetId === targetId);
</script>

<template>
  <section class="regression-plan">
    <header>
      <div>
        <span>REGRESSION PLAN</span>
        <h3>回归内容</h3>
      </div>
      <div class="plan-meta">
        <span class="analysis-source" :data-source="plan?.generatedBy">
          {{
            plan?.generatedBy === "STATIC_AND_AI"
              ? `AI 增强${plan.model ? ` · ${plan.model}` : ""}`
              : "静态分析"
          }}
        </span>
        <b :data-risk="plan?.riskLevel ?? task.riskLevel">{{
          plan?.riskLevel ?? task.riskLevel ?? "UNKNOWN"
        }}</b>
      </div>
    </header>
    <p class="plan-summary">{{ plan?.summary ?? task.riskSummary }}</p>
    <div v-if="targets.length" class="target-list">
      <article v-for="target in targets" :key="target.id" class="target-card">
        <div class="target-priority">{{ target.priority }}</div>
        <div>
          <h4>{{ target.businessScenario || target.title }}</h4>
          <p v-if="!target.causalChain?.length">{{ target.reason }}</p>
          <ol v-if="target.causalChain?.length" class="causal-chain">
            <li v-for="step in target.causalChain" :key="step">{{ step }}</li>
          </ol>
          <dl v-if="target.entryPoints?.length">
            <dt>入口</dt>
            <dd>
              <code v-for="entry in target.entryPoints" :key="entry">{{
                entry
              }}</code>
            </dd>
          </dl>
          <dl>
            <dt>验证重点</dt>
            <dd>
              <ul>
                <li v-for="point in target.verificationPoints" :key="point">
                  {{ point }}
                </li>
              </ul>
            </dd>
          </dl>
          <section
            v-if="target.automatedTestRecommendations?.length"
            class="automation-recommendation"
          >
            <header>
              <strong>推荐执行的自动化测试</strong
              ><span>仅推荐，不会自动执行</span>
            </header>
            <article
              v-for="recommendation in target.automatedTestRecommendations"
              :key="recommendation.id"
            >
              <b>{{ recommendation.title }}</b>
              <p>{{ recommendation.reason }}</p>
              <code v-for="entry in recommendation.entryPoints" :key="entry">{{
                entry
              }}</code>
            </article>
          </section>
          <details v-if="target.evidence?.length">
            <summary>查看判断依据</summary>
            <code v-for="item in target.evidence" :key="item">{{ item }}</code>
          </details>
          <footer
            class="target-feedback"
            :data-decision="feedbackFor(target.id)?.decision ?? 'PENDING'"
          >
            <span v-if="feedbackFor(target.id)">
              {{ feedbackFor(target.id)?.updatedByName }} ·
              {{
                feedbackFor(target.id)?.decision === "CONFIRMED"
                  ? "已确认需要回归"
                  : "本次无需回归"
              }}
            </span>
            <span v-else>这个建议是否准确？</span>
            <div>
              <button
                type="button"
                :class="{
                  active: feedbackFor(target.id)?.decision === 'CONFIRMED',
                }"
                @click="emit('feedback', target.id, 'CONFIRMED')"
              >
                需要回归
              </button>
              <button
                type="button"
                :class="{
                  active: feedbackFor(target.id)?.decision === 'EXCLUDED',
                }"
                @click="emit('feedback', target.id, 'EXCLUDED')"
              >
                本次不回归
              </button>
              <button
                v-if="feedbackFor(target.id)"
                type="button"
                class="reset"
                @click="emit('feedback', target.id, 'PENDING')"
              >
                撤销反馈
              </button>
            </div>
          </footer>
        </div>
      </article>
    </div>
    <div v-else class="empty-plan">
      当前证据没有定位到明确业务入口，请先查看右侧“待确认项”。
    </div>
    <aside v-if="plan?.unknowns.length" class="unknowns">
      <strong>仍需人工确认</strong>
      <ul>
        <li v-for="item in plan.unknowns" :key="item">{{ item }}</li>
      </ul>
    </aside>
  </section>
</template>

<style scoped>
.regression-plan {
  padding: 14px;
  background: #fff;
}
.regression-plan > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid #e0e6ec;
}
.regression-plan header span {
  font: 700 9px/1.3 var(--font-mono);
  letter-spacing: 0.08em;
  color: #687b8d;
}
.regression-plan h3 {
  margin: 3px 0 0;
  color: #344353;
  font: 600 12px/1.4 var(--font-ui);
}
.plan-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.plan-meta > b {
  padding: 3px 6px;
  background: #eef3f7;
  color: #536b82;
  font: 700 9px/1.4 var(--font-mono);
}
.plan-meta > b[data-risk="HIGH"],
.plan-meta > b[data-risk="CRITICAL"] {
  background: #fbe9e6;
  color: #a34e47;
}
.analysis-source {
  padding: 3px 6px;
  background: #edf5fc;
  color: #356b9f !important;
  letter-spacing: 0 !important;
}
.analysis-source[data-source="STATIC"] {
  background: #f0f2f4;
  color: #687681 !important;
}
.plan-summary {
  margin: 10px 0 12px;
  color: #667383;
  font-size: 10px;
  line-height: 1.6;
}
.target-list {
  display: grid;
  gap: 8px;
}
.target-card {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 9px;
  padding: 10px 11px;
  background: #fafbfc;
  border: 1px solid #e1e6eb;
  border-left: 3px solid #4d86c7;
}
.target-priority {
  font: 700 9px/1.4 var(--font-mono);
  color: #a35a2e;
}
.target-card h4 {
  margin: 0;
  color: #344353;
  font-size: 11px;
}
.target-card p {
  margin: 4px 0 7px;
  color: #687584;
  font-size: 10px;
  line-height: 1.55;
}
.causal-chain {
  margin: 7px 0;
  padding: 7px 8px 7px 24px;
  background: #f2f6fa;
  color: #52677b;
  font-size: 9px;
  line-height: 1.55;
}
.causal-chain li + li {
  margin-top: 3px;
}
.target-card dl {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 5px;
  margin: 5px 0;
  font-size: 10px;
}
.target-card dt {
  color: #84909c;
}
.target-card dd {
  margin: 0;
}
.target-card dd > code,
.target-card details > code,
.automation-recommendation code {
  display: inline-block;
  margin: 0 4px 3px 0;
  padding: 2px 5px;
  background: #eef2f5;
  color: #52677b;
  font-size: 9px;
}
.target-card ul,
.unknowns ul {
  margin: 0;
  padding-left: 15px;
}
.target-card li,
.unknowns li {
  margin: 3px 0;
  color: #596673;
}
.automation-recommendation {
  margin-top: 8px;
  padding: 8px 9px;
  background: #f2f8f6;
  border: 1px solid #d8e8e2;
}
.automation-recommendation > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}
.automation-recommendation > header strong {
  color: #356d5c;
  font-size: 10px;
}
.automation-recommendation > header span {
  color: #83968f !important;
  font: 400 9px/1.4 var(--font-ui) !important;
  letter-spacing: 0 !important;
}
.automation-recommendation article b {
  color: #425f57;
  font-size: 10px;
}
.automation-recommendation article p {
  margin: 3px 0 5px;
  color: #6b7c76;
  font-size: 9px;
}
.target-card details {
  margin-top: 7px;
  color: #60758a;
  font-size: 10px;
}
.target-card summary {
  cursor: pointer;
  margin-bottom: 5px;
}
.target-feedback {
  margin-top: 9px;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px dashed #dce2e7;
  color: #7b8792;
  font-size: 9px;
}
.target-feedback > div {
  display: flex;
  gap: 5px;
}
.target-feedback button {
  height: 24px;
  padding: 0 8px;
  color: #607181;
  background: #fff;
  border: 1px solid #d5dde4;
  font-size: 9px;
  cursor: pointer;
}
.target-feedback button:hover {
  border-color: #8ea8bf;
  color: #376b98;
}
.target-feedback button.active {
  color: #fff;
  background: #467db9;
  border-color: #467db9;
}
.target-feedback[data-decision="EXCLUDED"] button.active {
  background: #7b8792;
  border-color: #7b8792;
}
.target-feedback button.reset {
  border: 0;
  background: transparent;
  color: #87929c;
}
.unknowns {
  margin-top: 10px;
  padding: 10px;
  background: #fff8ed;
  color: #8b631f;
  font-size: 10px;
}
.empty-plan {
  padding: 28px;
  background: #fafbfc;
  color: #75818c;
  text-align: center;
  font-size: 10px;
}
@media (max-width: 700px) {
  .regression-plan > header,
  .target-feedback {
    align-items: flex-start;
    flex-direction: column;
  }
  .plan-meta {
    flex-wrap: wrap;
  }
  .automation-recommendation > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
