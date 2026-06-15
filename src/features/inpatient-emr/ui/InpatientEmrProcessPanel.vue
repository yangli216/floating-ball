<template>
  <section class="process-panel">
    <div class="process-heading">
      <Icon icon="lucide:workflow" :size="17" />
      <span>生成过程</span>
      <strong>{{ completedStepCount }}/{{ steps.length }}</strong>
    </div>

    <ol class="process-list">
      <li
        v-for="item in processItems"
        :key="item.key"
        class="process-item"
        :class="`is-${item.status}`"
      >
        <span class="step-icon">
          <Icon
            v-if="item.status === 'done'"
            icon="lucide:check"
            :size="15"
          />
          <Icon
            v-else-if="item.status === 'error'"
            icon="lucide:triangle-alert"
            :size="15"
          />
          <Icon
            v-else-if="item.status === 'running'"
            icon="lucide:loader-circle"
            :size="15"
            class="spinning"
          />
          <Icon v-else icon="lucide:circle" :size="12" />
        </span>

        <span class="step-copy">
          <span class="step-title-row">
            <strong>{{ item.title }}</strong>
          </span>
          <small>{{ item.detail }}</small>
          <span v-if="item.evidence" class="evidence-line">
            <Icon :icon="item.evidence.icon" :size="12" />
            <span>{{ item.evidence.text }}</span>
          </span>
        </span>
      </li>
    </ol>

    <details class="trace-detail">
      <summary>
        <Icon icon="lucide:timer" :size="14" />
        <span>查看联调 trace</span>
      </summary>
      <ol class="trace-list">
        <li
          v-for="stage in traceStages"
          :key="stage.key"
          class="trace-item"
          :class="`is-${stage.status}`"
        >
          <span class="trace-dot"></span>
          <span class="trace-copy">
            <strong>{{ stage.title }}</strong>
            <small>{{ stage.detail || traceStatusText(stage.status) }}</small>
          </span>
          <span class="trace-duration">
            {{ formatDuration(stage.durationMs, stage.status) }}
          </span>
        </li>
        <li v-if="traceStages.length === 0" class="trace-empty">
          暂无 trace 数据
        </li>
      </ol>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type {
  InpatientEmrEvidenceSummary,
  InpatientEmrGenerationStep,
  InpatientEmrGenerationTrace,
  InpatientEmrStepKey,
  InpatientEmrTraceStageStatus,
} from '../types';

const props = defineProps<{
  steps: InpatientEmrGenerationStep[];
  completedStepCount: number;
  summary?: InpatientEmrEvidenceSummary;
  trace?: InpatientEmrGenerationTrace;
}>();

interface ProcessEvidenceLine {
  icon: string;
  text: string;
}

interface ProcessItem extends InpatientEmrGenerationStep {
  evidence?: ProcessEvidenceLine;
}

const traceStages = computed(() => props.trace?.stages || []);

function traceStatusText(status: InpatientEmrTraceStageStatus): string {
  if (status === 'success') return '已完成';
  if (status === 'running') return '进行中';
  if (status === 'error') return '失败';
  if (status === 'skipped') return '已跳过';
  return '等待中';
}

function formatDuration(durationMs: number | undefined, status: InpatientEmrTraceStageStatus): string {
  if (status === 'running') return '进行中';
  if (durationMs === undefined) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
}

function joinEvidence(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function resolveEvidence(stepKey: InpatientEmrStepKey): ProcessEvidenceLine | undefined {
  const summary = props.summary;
  if (!summary) return undefined;

  if (stepKey === 'patient') {
    return {
      icon: 'lucide:database',
      text: summary.hisContext.detail,
    };
  }

  if (stepKey === 'orders') {
    const orderCount = summary.hisContext.meta?.orderCount;
    const labCount = summary.hisContext.meta?.labCount;
    const examCount = summary.hisContext.meta?.examCount;
    const text = joinEvidence([
      typeof orderCount === 'number' ? `医嘱 ${orderCount}` : undefined,
      typeof labCount === 'number' ? `检验 ${labCount}` : undefined,
      typeof examCount === 'number' ? `检查 ${examCount}` : undefined,
    ]);
    return text ? { icon: 'lucide:clipboard-list', text } : undefined;
  }

  if (stepKey === 'temperature') {
    return {
      icon: 'lucide:file-clock',
      text: joinEvidence([
        summary.outpatientRecord.detail,
        summary.doctorSupplement.detail,
      ]) || '未使用额外病历依据',
    };
  }

  if (stepKey === 'template') {
    return {
      icon: 'lucide:file-code-2',
      text: summary.template.detail,
    };
  }

  if (stepKey === 'generate') {
    return {
      icon: 'lucide:sparkles',
      text: summary.aiGeneration.detail,
    };
  }

  return undefined;
}

const processItems = computed<ProcessItem[]>(() => {
  return props.steps.map((step) => ({
    ...step,
    evidence: resolveEvidence(step.key),
  }));
});
</script>

<style scoped>
.process-panel {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(107, 128, 137, 0.18);
  box-shadow: 0 12px 28px rgba(23, 42, 49, 0.07);
}

.process-heading,
.process-item,
.step-title-row,
.evidence-line,
.trace-detail summary,
.trace-item {
  display: flex;
  align-items: center;
}

.process-heading {
  gap: 8px;
  min-height: 24px;
  font-size: 14px;
  font-weight: 800;
  color: #203940;
}

.process-heading strong {
  margin-left: auto;
  color: #0e7d6d;
}

.process-list {
  list-style: none;
  padding: 4px 0 0;
  margin: 0;
}

.process-item {
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(119, 135, 143, 0.12);
}

.process-item:last-child {
  border-bottom: 0;
}

.step-icon {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eef3f4;
  color: #7a8a90;
}

.process-item.is-running .step-icon {
  background: #e8f4ff;
  color: #1976c9;
}

.process-item.is-done .step-icon {
  background: #e5f7ef;
  color: #0f8f5f;
}

.process-item.is-error .step-icon {
  background: #fff0ea;
  color: #c05621;
}

.spinning {
  animation: spin 1s linear infinite;
}

.step-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.step-title-row {
  gap: 8px;
}

.step-title-row strong {
  min-width: 0;
  color: #223740;
  font-size: 13px;
}

.step-copy small {
  color: #65777f;
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.evidence-line {
  gap: 5px;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 5px 7px;
  border-radius: 7px;
  color: #41606a;
  background: #f4f8f9;
  border: 1px solid rgba(99, 120, 128, 0.12);
  font-size: 11px;
  line-height: 1.35;
}

.evidence-line span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.trace-detail {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(119, 135, 143, 0.12);
}

.trace-detail summary {
  width: fit-content;
  gap: 6px;
  color: #0f806e;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
}

.trace-detail summary::-webkit-details-marker {
  display: none;
}

.trace-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.trace-item {
  gap: 8px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 7px;
  background: rgba(243, 247, 248, 0.86);
}

.trace-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #91a1a8;
}

.trace-item.is-success .trace-dot {
  background: #0f8f5f;
}

.trace-item.is-running .trace-dot {
  background: #1976c9;
}

.trace-item.is-error .trace-dot {
  background: #c05621;
}

.trace-item.is-skipped .trace-dot {
  background: #9aa7ad;
}

.trace-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.trace-copy strong {
  color: #273f47;
  font-size: 12px;
}

.trace-copy small {
  color: #687a82;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.trace-duration {
  margin-left: auto;
  flex: 0 0 auto;
  color: #45606a;
  font-size: 11px;
  font-weight: 800;
}

.trace-empty {
  padding: 8px;
  color: #70828a;
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
