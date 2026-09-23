<script setup lang="ts">
import { computed } from "vue";
import type { AnalysisProgressStage, AnalysisTask } from "@impact-flow/contracts";

const props = defineProps<{
  task: AnalysisTask;
  compact?: boolean;
}>();

const steps: Array<{ stage: AnalysisProgressStage; label: string; percent: number }> = [
  { stage: "QUEUED", label: "进入执行队列", percent: 5 },
  { stage: "SYNCING_REPOSITORY", label: "同步代码仓库", percent: 15 },
  { stage: "CALCULATING_DIFF", label: "计算 Git Diff", percent: 35 },
  { stage: "ANALYZING_SYMBOLS", label: "分析 Symbol 与调用链", percent: 55 },
  { stage: "INTERPRETING_CHANGES", label: "理解代码变更", percent: 66 },
  { stage: "EXPLORING_DEPENDENCIES", label: "追踪业务入口", percent: 74 },
  { stage: "RESOLVING_SCENARIOS", label: "识别业务场景", percent: 82 },
  { stage: "PLANNING_REGRESSION", label: "生成回归清单", percent: 88 },
  { stage: "SAVING_RESULT", label: "保存分析结果", percent: 90 },
  { stage: "COMPLETED", label: "分析完成", percent: 100 },
];

const stage = computed(() => props.task.progressStage ?? "QUEUED");
const percent = computed(() =>
  props.task.status === "SUCCESS" || props.task.status === "NO_CHANGES"
    ? 100
    : Math.max(0, Math.min(100, props.task.progressPercent ?? 5)),
);
const stageIndex = computed(() => steps.findIndex((item) => item.stage === stage.value));
const waitingForRetry = computed(
  () =>
    props.task.status === "READY" &&
    (props.task.attemptCount ?? 0) > 0 &&
    Boolean(props.task.nextAttemptAt),
);
const stateClass = computed(() => {
  if (props.task.status === "FAILED") return "failed";
  if (props.task.status === "SUCCESS") return "success";
  if (waitingForRetry.value) return "retrying";
  if (["READY", "RUNNING"].includes(props.task.status)) return "active";
  return "neutral";
});
const stateLabel = computed(() => {
  if (props.task.status === "FAILED") return "分析失败";
  if (props.task.status === "SUCCESS") return "分析完成";
  if (props.task.status === "NO_CHANGES") return "无代码变更";
  if (props.task.status === "CANCELLED") return "已取消";
  if (waitingForRetry.value) return "等待自动重试";
  if (props.task.status === "READY") return "排队中";
  return steps.find((item) => item.stage === stage.value)?.label ?? "分析中";
});
const attemptLabel = computed(() => {
  const attempts = props.task.attemptCount ?? 0;
  const maximum = props.task.maxAttempts ?? 3;
  if (props.task.status === "READY" && attempts === 0) return `最多执行 ${maximum} 次`;
  return `第 ${Math.max(1, attempts)} / ${maximum} 次执行`;
});

function stepState(index: number) {
  if (props.task.status === "SUCCESS") return "done";
  if (index < stageIndex.value) return "done";
  if (index === stageIndex.value) return props.task.status === "FAILED" ? "failed" : "current";
  return "pending";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
</script>

<template>
  <div v-if="compact" class="task-progress-compact" :class="stateClass">
    <div class="task-progress-title">
      <span class="task-progress-dot" aria-hidden="true"></span>
      <strong>{{ stateLabel }}</strong>
      <span v-if="['READY', 'RUNNING'].includes(task.status)">{{ percent }}%</span>
    </div>
    <div
      v-if="['READY', 'RUNNING'].includes(task.status)"
      class="task-progress-bar"
      role="progressbar"
      :aria-label="`分析进度：${stateLabel}`"
      :aria-valuenow="percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <i :style="{ width: `${percent}%` }"></i>
    </div>
    <small>
      {{ attemptLabel }}
      <template v-if="waitingForRetry"> · {{ formatTime(task.nextAttemptAt) }} 重试</template>
    </small>
    <p v-if="task.errorMessage" :title="task.errorMessage">{{ task.errorMessage }}</p>
  </div>

  <section v-else class="task-progress-panel" :class="stateClass" aria-live="polite">
    <header>
      <div>
        <span class="task-progress-kicker">任务执行状态</span>
        <strong>{{ stateLabel }}</strong>
        <p>{{ task.progressMessage || (waitingForRetry ? "上次执行失败，系统将在计划时间自动重试。" : "正在等待 Worker 领取任务。") }}</p>
      </div>
      <span class="task-progress-percent">{{ percent }}%</span>
    </header>

    <div
      class="task-progress-bar is-large"
      role="progressbar"
      :aria-label="`分析进度：${stateLabel}`"
      :aria-valuenow="percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <i :style="{ width: `${percent}%` }"></i>
    </div>

    <ol class="task-progress-steps" aria-label="分析执行阶段">
      <li v-for="(item, index) in steps" :key="item.stage" :class="stepState(index)">
        <span aria-hidden="true"></span>
        <div>
          <strong>{{ item.label }}</strong>
          <small v-if="index === stageIndex && task.progressMessage">{{ task.progressMessage }}</small>
        </div>
      </li>
    </ol>

    <dl class="task-progress-meta">
      <div><dt>执行次数</dt><dd>{{ attemptLabel }}</dd></div>
      <div><dt>创建时间</dt><dd>{{ formatTime(task.createdAt) }}</dd></div>
      <div><dt>开始时间</dt><dd>{{ formatTime(task.startedAt) }}</dd></div>
      <div v-if="waitingForRetry"><dt>下次重试</dt><dd>{{ formatTime(task.nextAttemptAt) }}</dd></div>
    </dl>

    <div v-if="task.errorMessage" class="task-progress-error" role="alert">
      <strong>{{ waitingForRetry ? "上次执行失败" : "失败原因" }}</strong>
      <p>{{ task.errorMessage }}</p>
      <small v-if="waitingForRetry">系统会自动重试，也可以在右上角选择“重新分析”。</small>
      <small v-else>请检查仓库连接和服务配置，修复后重新分析。</small>
    </div>
  </section>
</template>
