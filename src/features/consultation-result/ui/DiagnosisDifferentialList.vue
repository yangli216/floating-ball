<script setup lang="ts">
import { ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  getDiagnosisSuggestionDirectionKey,
  getStandardDiagnosisId,
} from '@features/clinical-result';

const props = defineProps<{
  diagnoses: Diagnosis[];
  includedKeys?: ReadonlySet<string>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  include: [diagnosis: Diagnosis];
  remove: [diagnosis: Diagnosis];
  supplement: [diagnosis: Diagnosis];
  promote: [diagnosis: Diagnosis];
}>();

const expandedKeys = ref<ReadonlySet<string>>(new Set());

function getDirectionKey(diagnosis: Diagnosis): string {
  return getDiagnosisSuggestionDirectionKey(diagnosis);
}

function isIncluded(diagnosis: Diagnosis): boolean {
  return props.includedKeys?.has(getDirectionKey(diagnosis)) || false;
}

function getSupportText(diagnosis: Diagnosis): string {
  return diagnosis.rationale?.trim() || '当前证据不足，建议结合进一步问诊、查体或检查确认。';
}

function getMissingInformation(diagnosis: Diagnosis): string {
  return diagnosis.missingInformation?.trim() || '请结合当前方向补充针对性问诊、查体或检查依据';
}

function isSupportExpanded(diagnosis: Diagnosis): boolean {
  return expandedKeys.value.has(getDirectionKey(diagnosis));
}

function toggleSupportExpanded(diagnosis: Diagnosis): void {
  const key = getDirectionKey(diagnosis);
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}
</script>

<template>
  <section v-if="diagnoses.length" class="diagnosis-differential-list">
    <div class="diagnosis-differential-head">
      <strong>待鉴别方向</strong>
      <span>可纳入诊疗方向继续完善，转为正式诊断前不参与回写</span>
    </div>

    <article
      v-for="diagnosis in diagnoses"
      :key="`${diagnosis.code}-${diagnosis.name}`"
      :class="{ 'is-included': isIncluded(diagnosis), 'is-expanded': isSupportExpanded(diagnosis) }"
    >
      <div class="differential-summary-row">
        <div class="differential-identity">
          <strong class="differential-name" :title="diagnosis.name">{{ diagnosis.name }}</strong>
          <span v-if="isIncluded(diagnosis) || diagnosis.rate" class="differential-meta">
            <span v-if="isIncluded(diagnosis)" class="included-token">已纳入</span>
            <span v-if="diagnosis.rate" class="confidence-token">{{ diagnosis.rate }}</span>
          </span>
        </div>

        <div class="differential-checkpoint" :title="getMissingInformation(diagnosis)">
          <span class="summary-label">需核查</span>
          <span class="checkpoint-text">{{ getMissingInformation(diagnosis) }}</span>
        </div>

        <div class="differential-next-step">
          <div class="differential-actions">
            <button
              v-if="!isIncluded(diagnosis)"
              type="button"
              class="direction-action is-primary"
              :disabled="disabled"
              @click="emit('include', diagnosis)"
            >纳入诊疗方向</button>
            <template v-else>
              <button type="button" class="direction-action" :disabled="disabled" @click="emit('supplement', diagnosis)">补充依据</button>
              <button type="button" class="direction-action is-primary" :disabled="disabled" @click="emit('promote', diagnosis)">转为正式诊断</button>
              <button type="button" class="direction-action is-subtle" :disabled="disabled" @click="emit('remove', diagnosis)">取消</button>
            </template>
            <button
              type="button"
              class="direction-action is-detail"
              :aria-expanded="isSupportExpanded(diagnosis)"
              @click="toggleSupportExpanded(diagnosis)"
            >{{ isSupportExpanded(diagnosis) ? '收起依据' : '查看依据' }}</button>
          </div>
        </div>
      </div>

      <div v-if="isSupportExpanded(diagnosis)" class="differential-detail-panel">
        <span class="detail-label">支持依据</span>
        <p>{{ getSupportText(diagnosis) }}</p>
        <span v-if="isIncluded(diagnosis) && !getStandardDiagnosisId(diagnosis)" class="catalog-hint">
          转入前需匹配标准诊断库
        </span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.diagnosis-differential-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--voice-border);
}

.diagnosis-differential-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.diagnosis-differential-head strong {
  color: var(--voice-text);
  font-size: 14px;
}

.diagnosis-differential-head span {
  color: #64748b;
  font-size: 12.5px;
}

article {
  padding: 9px 11px;
  border: 1px solid var(--voice-border);
  border-radius: 9px;
  background: var(--voice-surface-soft);
}

article.is-included,
article.is-expanded {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(37, 99, 235, 0.035);
}

article + article {
  margin-top: 7px;
}

.differential-summary-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.58fr) minmax(200px, 1.42fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 32px;
}

article.is-included .differential-summary-row {
  grid-template-columns: minmax(190px, 1fr) auto;
  row-gap: 8px;
}

article.is-included .differential-identity {
  grid-column: 1;
  grid-row: 1;
}

article.is-included .differential-next-step {
  grid-column: 2;
  grid-row: 1;
}

article.is-included .differential-checkpoint {
  grid-column: 1 / -1;
  grid-row: 2;
}

.differential-identity,
.differential-checkpoint,
.differential-next-step,
.differential-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.differential-identity {
  gap: 6px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.differential-name {
  flex: 1 1 9em;
  min-width: 0;
  color: var(--voice-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}

.differential-meta {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 19px;
}

.included-token,
.confidence-token {
  flex: 0 0 auto;
  font-size: 11.5px;
  white-space: nowrap;
}

.included-token {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.confidence-token {
  color: #9a6200;
}

.differential-checkpoint {
  gap: 7px;
}

.summary-label,
.detail-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.checkpoint-text {
  min-width: 0;
  overflow: hidden;
  color: #9a6200;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.differential-next-step {
  gap: 7px;
  justify-content: flex-end;
}

.differential-actions {
  gap: 6px;
}

.direction-action {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--voice-border);
  border-radius: 7px;
  background: var(--voice-surface);
  color: var(--voice-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.direction-action.is-primary {
  border-color: rgba(37, 99, 235, 0.3);
  color: #2563eb;
}

.direction-action.is-detail,
.direction-action.is-subtle {
  color: var(--voice-text-muted);
}

.direction-action.is-detail {
  border-color: transparent;
  background: transparent;
}

.direction-action:hover:not(:disabled) {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
  background: var(--voice-accent-softer);
}

.direction-action:focus-visible {
  outline: 2px solid var(--voice-accent);
  outline-offset: 2px;
}

.direction-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.differential-detail-panel {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--voice-border);
}

.differential-detail-panel p {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.catalog-hint {
  grid-column: 2;
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .differential-summary-row {
    grid-template-columns: minmax(130px, 0.7fr) minmax(0, 1.3fr);
  }

  .differential-next-step {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  article.is-included .differential-summary-row {
    grid-template-columns: 1fr;
  }

  article.is-included .differential-identity,
  article.is-included .differential-checkpoint,
  article.is-included .differential-next-step {
    grid-column: 1;
    grid-row: auto;
  }
}

@media (max-width: 720px) {
  .diagnosis-differential-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .differential-summary-row {
    grid-template-columns: 1fr;
    gap: 7px;
  }

  .differential-next-step {
    grid-column: auto;
    flex-wrap: wrap;
  }

  .differential-actions {
    flex-wrap: wrap;
  }
}
</style>
