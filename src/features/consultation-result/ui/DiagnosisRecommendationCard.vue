<template>
  <li
    class="vcn-diagnosis-item"
    :class="{ selected, primary: isPrimary }"
    @click="emit('toggle')"
  >
    <div v-if="selected" class="diag-selected-mark">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>

    <div class="card-row">
      <div class="card-main">
        <div class="card-title-line">
          <div class="card-title-wrap">
            <FactCheckHighlight :issue="issue">
              <span class="card-title">
                <span v-if="showTcmBadge && diag.isTCM" class="tcm-badge">中</span>
                {{ diag.name }}
              </span>
            </FactCheckHighlight>
            <span
              v-if="diag.rationale"
              class="reason-tooltip-trigger"
              :class="{ open: reasonOpen }"
              @click.stop
            >
              <button class="reason-icon-btn" type="button" aria-label="查看诊断依据" title="查看诊断依据" @click.stop="emit('toggle-reason', $event)">
                <Icon icon="lucide:circle-help" size="14" />
              </button>
              <span class="hover-reason-tooltip">{{ diag.rationale }}</span>
            </span>
          </div>
          <span v-if="displayRate" class="diag-rate-token" :class="rateToneClass">{{ displayRate }}</span>
          <span v-if="diag.code" class="meta-token">编码 {{ diag.code }}</span>
          <span v-if="isPrimary" class="meta-token diag-role-token">主诊断</span>
          <span v-else-if="selected" class="meta-token diag-role-token">已纳入</span>
          <button
            v-if="selected && !isPrimary"
            class="diag-action-btn"
            type="button"
            @click.stop="emit('set-primary', $event)"
          >设为主诊</button>
          <button
            v-if="selected && canRemove"
            class="diag-action-btn subtle"
            type="button"
            @click.stop="emit('remove', $event)"
          >移除</button>
          <button class="inline-arrow-btn" type="button" title="切换同类诊断" @click.stop="emit('toggle-related', $event)">
            <span class="inline-arrow" :class="{ open: relatedOpen }"></span>
          </button>
        </div>
      </div>

      <div class="card-actions">
        <slot name="actions" />
        <button
          v-if="showDifferential"
          class="diag-action-btn"
          type="button"
          @click.stop="emit('diagnosis-differential', $event)"
        >诊断鉴别</button>
        <div v-if="showFeedback" class="voice-feedback-anchor" @click.stop>
          <button
            class="voice-feedback-trigger"
            :class="{ submitted: !!submittedLabel }"
            type="button"
            @click.stop="emit('toggle-feedback', $event)"
          >反馈</button>
          <div v-if="feedbackVisible" class="voice-feedback-panel">
            <VoiceRecommendationFeedbackPopover
              :visible="true"
              :title="diag.name"
              :draft="feedbackDraft"
              :submitting="feedbackSubmitting"
              :submitted-label="submittedLabel"
              @close="emit('toggle-feedback')"
              @update:draft="emit('update:feedbackDraft', $event)"
              @submit="emit('submit-feedback', $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <slot name="body" />

    <div v-if="relatedOpen && relatedDiagnoses.length > 0" class="related-section" @click.stop>
      <div class="related-list">
        <button
          v-for="item in relatedDiagnoses"
          :key="item.id"
          class="related-item"
          type="button"
          @click="emit('swap-related', item)"
        >
          <span class="related-code">{{ item.code }}</span>
          <span class="related-name">{{ item.name }}</span>
        </button>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import FactCheckHighlight from '@features/feedback/ui/FactCheckHighlight.vue';
import VoiceRecommendationFeedbackPopover from '@features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue';
import type { Diagnosis } from '@/types/consultation';
import type { VoiceRecommendationFeedbackDraft } from '@/types/voiceFeedback';
import type { FactCheckIssue } from '@services/factChecker';

interface RelatedDiagnosisCandidate {
  id?: string;
  code: string;
  name: string;
}

const props = defineProps({
  diag: {
    type: Object as PropType<Diagnosis>,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  canRemove: {
    type: Boolean,
    default: false,
  },
  reasonOpen: {
    type: Boolean,
    default: false,
  },
  relatedOpen: {
    type: Boolean,
    default: false,
  },
  relatedDiagnoses: {
    type: Array as PropType<RelatedDiagnosisCandidate[]>,
    default: () => [],
  },
  issue: {
    type: Object as PropType<FactCheckIssue | undefined>,
    default: undefined,
  },
  showTcmBadge: {
    type: Boolean,
    default: false,
  },
  showFeedback: {
    type: Boolean,
    default: true,
  },
  showDifferential: {
    type: Boolean,
    default: false,
  },
  feedbackVisible: {
    type: Boolean,
    default: false,
  },
  feedbackDraft: {
    type: Object as PropType<VoiceRecommendationFeedbackDraft>,
    default: () => ({
      action: '',
      issueTags: [],
      comment: '',
      correctedValue: '',
    }),
  },
  feedbackSubmitting: {
    type: Boolean,
    default: false,
  },
  submittedLabel: {
    type: String,
    default: '',
  },
});

const rateToneClass = computed(() => {
  const rate = displayRate.value;
  if (rate.includes('高')) return 'rate-high';
  if (rate.includes('中')) return 'rate-medium';
  if (rate.includes('低')) return 'rate-low';
  const numericRate = Number.parseInt(rate, 10);
  if (Number.isNaN(numericRate)) return 'rate-neutral';
  if (numericRate >= 70) return 'rate-high';
  if (numericRate >= 60) return 'rate-medium';
  return 'rate-low';
});

const displayRate = computed(() => props.diag.rate || 'AI分析');

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'toggle-reason', event?: Event): void;
  (e: 'set-primary', event?: Event): void;
  (e: 'remove', event?: Event): void;
  (e: 'toggle-related', event?: Event): void;
  (e: 'swap-related', diag: RelatedDiagnosisCandidate): void;
  (e: 'diagnosis-differential', event?: Event): void;
  (e: 'toggle-feedback', event?: Event): void;
  (e: 'update:feedbackDraft', draft: VoiceRecommendationFeedbackDraft): void;
  (e: 'submit-feedback', draft: VoiceRecommendationFeedbackDraft): void;
}>();
</script>

<style scoped>
.vcn-diagnosis-item {
  position: relative;
  padding: 12px 14px 12px 34px;
  border: 1px solid var(--voice-border);
  border-radius: 14px;
  background: var(--voice-surface);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
}

.vcn-diagnosis-item:hover {
  border-color: var(--voice-border-strong);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.035);
}

.vcn-diagnosis-item.selected {
  background: var(--voice-surface);
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 8px 18px rgba(15, 23, 42, 0.028);
}

.vcn-diagnosis-item.primary {
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 10px 20px rgba(15, 23, 42, 0.03);
}

.diag-selected-mark {
  position: absolute;
  top: -1px;
  left: -1px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px 0 12px 0;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  border-right: 1px solid var(--voice-accent-soft);
  border-bottom: 1px solid var(--voice-accent-soft);
  z-index: 2;
}

.diag-selected-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.38);
  border-left: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: inherit;
  pointer-events: none;
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.card-main {
  flex: 1;
  min-width: 0;
  overflow: visible;
}

.card-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
  max-width: 100%;
}

.card-title-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: visible;
}

.card-title {
  display: block;
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reason-tooltip-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.reason-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--voice-text-muted);
  cursor: help;
}

.reason-icon-btn:hover,
.reason-tooltip-trigger:hover .reason-icon-btn,
.reason-tooltip-trigger:focus-within .reason-icon-btn {
  color: var(--voice-accent);
}

.hover-reason-tooltip {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 12;
  width: min(320px, 48vw);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--voice-border);
  background: var(--voice-surface-glass);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
  color: #334155;
  font-size: var(--voice-font-min);
  line-height: 1.6;
  white-space: normal;
  word-break: break-word;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
  pointer-events: none;
}

.reason-tooltip-trigger:hover .hover-reason-tooltip,
.reason-tooltip-trigger:focus-within .hover-reason-tooltip,
.reason-tooltip-trigger.open .hover-reason-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.meta-token {
  flex-shrink: 0;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  white-space: nowrap;
}

.diag-rate-token {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.09);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  font-weight: 700;
  white-space: nowrap;
}

.diag-rate-token.rate-high {
  background: rgba(31, 138, 91, 0.1);
  color: var(--voice-success);
}

.diag-rate-token.rate-medium {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.diag-rate-token.rate-low {
  background: rgba(239, 68, 68, 0.1);
  color: var(--voice-danger);
}

.diag-role-token {
  color: var(--voice-accent);
}

.diag-action-btn {
  flex-shrink: 0;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.diag-action-btn.subtle {
  border-color: var(--voice-border);
  background: var(--voice-surface);
  color: var(--voice-text-muted);
}

.diag-action-btn:hover {
  border-color: var(--voice-accent);
}

.diag-action-btn.subtle:hover {
  color: var(--voice-text);
  border-color: var(--voice-border-strong);
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
}

.voice-feedback-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.voice-feedback-trigger {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--voice-border);
  border-radius: 999px;
  background: var(--voice-surface);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.voice-feedback-trigger:hover {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
}

.voice-feedback-trigger.submitted {
  border-color: rgba(31, 138, 91, 0.2);
  background: rgba(31, 138, 91, 0.08);
  color: var(--voice-success);
}

.voice-feedback-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 12;
}

.inline-arrow-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: transparent;
  padding: 0;
  color: var(--voice-text-muted);
  cursor: pointer;
}

.inline-arrow-btn:hover {
  color: var(--voice-accent);
}

.inline-arrow {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.18s ease;
}

.inline-arrow.open {
  transform: rotate(225deg);
}

.related-section {
  margin-top: 10px;
}

.related-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.related-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--voice-border);
  border-radius: 999px;
  background: var(--voice-surface);
  color: var(--voice-text);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.related-item:hover {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
}

.related-code {
  color: var(--voice-text-muted);
}

@media (max-width: 900px) {
  .card-row {
    flex-direction: column;
    align-items: stretch;
  }

  .card-title-line {
    flex-wrap: wrap;
  }

  .voice-feedback-panel {
    left: 0;
    right: auto;
  }
}
</style>
