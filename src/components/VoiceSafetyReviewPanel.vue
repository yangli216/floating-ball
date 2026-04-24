<template>
  <section class="safety-panel" :class="panelClass" v-if="visible">
    <div class="safety-header" @click="toggleExpanded">
      <div class="header-main">
        <span class="status-icon">{{ statusIcon }}</span>
        <div>
          <div class="title-row">
            <span class="title">{{ title }}</span>
            <span class="count-badge" v-if="activeIssues.length">{{ activeIssues.length }}</span>
          </div>
          <p class="summary">{{ summary }}</p>
        </div>
      </div>
      <button class="expand-btn" type="button">{{ expanded ? '收起' : '查看' }}</button>
    </div>

    <div class="issue-list" v-if="expanded && activeIssues.length">
      <article v-for="issue in activeIssues" :key="issue.id" class="issue-card" :class="`severity-${issue.severity}`">
        <div class="issue-head">
          <span class="severity-tag">{{ severityLabel(issue.severity) }}</span>
          <strong>{{ issue.title }}</strong>
        </div>
        <p class="issue-message">{{ issue.message }}</p>
        <p class="issue-suggestion" v-if="issue.suggestion">{{ issue.suggestion }}</p>
        <div class="issue-meta" v-if="issue.relatedItems?.length || issue.evidence">
          <span v-if="issue.relatedItems?.length">相关：{{ issue.relatedItems.join('、') }}</span>
          <span v-if="issue.evidence">依据：{{ issue.evidence }}</span>
        </div>
        <div class="issue-actions">
          <button type="button" class="text-btn" @click.stop="emit('acknowledge', issue.id)">
            {{ issue.acknowledged ? '已知晓' : '我已知晓' }}
          </button>
          <button type="button" class="text-btn muted" @click.stop="emit('dismiss', issue.id)">忽略本次</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VoiceSafetyIssue } from '../types/voiceResult';
import type { VoiceSafetyReviewStatus } from '../composables/useVoiceSafetyReview';

const props = defineProps<{
  status: VoiceSafetyReviewStatus;
  issues: VoiceSafetyIssue[];
  errorMessage?: string;
}>();

const emit = defineEmits<{
  acknowledge: [issueId: string];
  dismiss: [issueId: string];
}>();

const expanded = ref(false);
const activeIssues = computed(() => props.issues.filter(issue => !issue.dismissed));
const hasHighRisk = computed(() => activeIssues.value.some(issue => issue.severity === 'high'));
const visible = computed(() => props.status !== 'idle');
const panelClass = computed(() => ({
  checking: props.status === 'checking',
  clear: props.status === 'completed' && activeIssues.value.length === 0,
  warning: activeIssues.value.length > 0,
  high: hasHighRisk.value,
  failed: props.status === 'failed',
}));

const statusIcon = computed(() => {
  if (props.status === 'checking') return '🛡️';
  if (props.status === 'failed') return '⚠️';
  if (activeIssues.value.length) return hasHighRisk.value ? '🚩' : '💡';
  return '✅';
});

const title = computed(() => {
  if (props.status === 'checking') return '安全复核员正在核对';
  if (props.status === 'failed') return '安全复核暂不可用';
  if (activeIssues.value.length) return hasHighRisk.value ? '发现高危安全提醒' : '发现安全提醒';
  return '安全复核未发现明显风险';
});

const summary = computed(() => {
  if (props.status === 'checking') return '不影响医生继续审核病历，复核完成后会在这里提示。';
  if (props.status === 'failed') return props.errorMessage || '可继续审核病历，稍后可重新进入页面触发复核。';
  if (!activeIssues.value.length) return '当前病历和建议未发现明确的首道安全底线提醒。';
  const firstIssue = activeIssues.value[0];
  return firstIssue.message;
});

function toggleExpanded(): void {
  if (activeIssues.value.length) {
    expanded.value = !expanded.value;
  }
}

function severityLabel(severity: VoiceSafetyIssue['severity']): string {
  if (severity === 'high') return '高危';
  if (severity === 'medium') return '中危';
  return '提示';
}
</script>

<style scoped>
.safety-panel {
  margin: 10px 16px 0;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: var(--color-background-white);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  flex-shrink: 0;
}

.safety-panel.checking {
  border-color: var(--color-primary-200);
}

.safety-panel.clear {
  border-color: var(--color-success);
}

.safety-panel.warning {
  border-color: var(--color-warning);
  background: var(--color-warning-bg);
}

.safety-panel.high {
  border-color: var(--color-error);
}

.safety-panel.failed {
  border-color: var(--color-border-medium);
}

.safety-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.status-icon {
  font-size: 18px;
  line-height: 1.4;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-strong);
}

.count-badge {
  min-width: 20px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--color-warning);
  color: white;
  font-size: 12px;
  text-align: center;
}

.summary {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--color-text-medium);
  line-height: 1.45;
}

.expand-btn,
.text-btn {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px 42px;
}

.issue-card {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-background-white);
  border: 1px solid var(--color-border-light);
}

.issue-card.severity-high {
  border-color: var(--color-error);
}

.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-strong);
}

.severity-tag {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
  font-size: 12px;
}

.severity-high .severity-tag {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.issue-message,
.issue-suggestion {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-medium);
  line-height: 1.5;
}

.issue-suggestion {
  color: var(--color-text-strong);
}

.issue-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.issue-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.text-btn.muted {
  color: var(--color-text-muted);
}
</style>
