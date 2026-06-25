<template>
  <article
    class="vcn-treatment-item"
    :class="[layoutVariant, { selected, locked, matching }]"
    @click="emit('toggle')"
  >
    <div v-if="selected && layoutVariant !== 'worklist'" class="card-selected-mark">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>

    <template v-if="layoutVariant === 'worklist'">
      <div class="worklist-row">
        <div class="worklist-select-indicator" :class="{ selected }" aria-hidden="true">
          <span class="worklist-select-dot">
            <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </span>
        </div>

        <div class="worklist-main">
          <div class="worklist-primary-row">
            <div class="worklist-name-wrap">
              <slot name="title-prefix" />
              <FactCheckHighlight :issue="issue">
                <span class="card-title">{{ rec.name }}</span>
              </FactCheckHighlight>
              <span v-if="spec" class="meta-token">{{ spec }}</span>
              <span
                v-if="rec.reason"
                class="reason-tooltip-trigger"
                :class="{ open: reasonOpen }"
                @click.stop
              >
                <button class="reason-icon-btn" type="button" aria-label="查看推荐依据" title="查看推荐依据" @click.stop="emit('toggle-reason', $event)">
                  <Icon icon="lucide:circle-help" size="14" />
                </button>
                <span class="hover-reason-tooltip">{{ rec.reason }}</span>
              </span>
            </div>
          </div>

          <div v-if="inlineSummary || originalName || usageToken" class="worklist-secondary-row">
            <button
              v-if="inlineSummary"
              class="medicine-inline-summary worklist-inline-text"
              :class="{ clickable: showEditorToggle && !editorExpanded }"
              type="button"
              @click.stop="showEditorToggle && !editorExpanded ? emit('toggle-editor', $event) : undefined"
            >
              {{ inlineSummary }}
            </button>
            <div v-if="originalName" class="manual-match-origin-note worklist-inline-text worklist-inline-origin">
              AI 原建议：{{ originalName }}
            </div>
            <span v-if="usageToken" class="meta-token usage-summary-token worklist-usage-token">建议 {{ usageToken }}</span>
          </div>

          <div v-if="probableMatchName" class="manual-match-origin-note probable-match-note">
            <span class="probable-match-copy">
              <span class="probable-match-label">候选标准项</span>
              <span class="probable-match-name">{{ probableMatchName }}</span>
            </span>
            <button
              class="confirm-match-btn inline"
              type="button"
              title="确认采用该标准库候选"
              @click.stop="emit('confirm-probable-match', $event)"
            >
              确认匹配
            </button>
          </div>
        </div>

        <div class="worklist-actions-col">
          <div class="worklist-status-col">
            <span class="meta-token worklist-status"
              :class="{ warning: matchTone === 'warning', success: matchTone === 'success' }">
              {{ matchLabel }}
            </span>
          </div>

          <div v-if="$slots['title-meta'] || showExecDeptChip || showPharmacyChip" class="worklist-attr-col">
            <div v-if="$slots['title-meta']" class="card-title-meta worklist-title-meta">
              <slot name="title-meta" />
            </div>
            <button v-if="showExecDeptChip" class="exec-dept-chip worklist-chip" :class="{ missing: execDeptMissing }"
              type="button" :title="execDeptTitle" @click.stop="emit('open-exec-dept', $event)">
              <span v-if="execDeptMissing" class="exec-dept-chip-label">执行科室</span>
              <span class="exec-dept-chip-value">{{ execDeptDisplay || '待设置' }}</span>
            </button>
            <button v-if="showPharmacyChip" class="exec-dept-chip pharmacy-chip worklist-chip"
              :class="{ missing: pharmacyMissing }" type="button" :title="pharmacyTitle"
              @click.stop="emit('open-pharmacy', $event)">
              <span v-if="pharmacyMissing" class="exec-dept-chip-label">发药药房</span>
              <span class="exec-dept-chip-value">{{ pharmacyDisplay || '待设置' }}</span>
            </button>
          </div>

          <div class="card-actions treatment-card-actions worklist-actions">
            <slot name="actions" />
            <button v-if="showManualMatchButton" class="manual-match-btn" type="button" :title="manualMatchTitle"
              @click.stop="emit('toggle-manual-match', $event)">
              {{ manualMatchButtonText }}
            </button>
            <div v-if="showFeedback" class="voice-feedback-anchor" @click.stop>
              <button class="voice-feedback-trigger" :class="{ submitted: !!feedbackSubmittedLabel }" type="button"
                @click.stop="emit('toggle-feedback', $event)">反馈</button>
              <div v-if="feedbackVisible" class="voice-feedback-panel">
                <VoiceRecommendationFeedbackPopover :visible="true" :title="rec.name" :draft="feedbackDraft"
                  :submitting="feedbackSubmitting" :submitted-label="feedbackSubmittedLabel"
                  @close="emit('toggle-feedback')" @update:draft="emit('update:feedbackDraft', $event)"
                  @submit="emit('submit-feedback', $event)" />
              </div>
            </div>
            <button v-if="showEditorToggle" class="inline-arrow-btn action-arrow" type="button"
              :title="editorExpanded ? '收起更多编辑' : '展开更多编辑'" :aria-label="editorExpanded ? '收起更多编辑' : '展开更多编辑'"
              @click.stop="emit('toggle-editor', $event)">
              <span class="inline-arrow" :class="{ open: editorExpanded }"></span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="$slots.body || $slots['manual-match'] || $slots.editor" class="worklist-detail-stack">
        <slot name="body" />
        <slot name="manual-match" />
        <slot name="editor" />
      </div>
    </template>

    <template v-else>
      <div class="card-row treatment-card-row">
        <div class="card-main">
          <div class="card-title-line">
            <div class="card-title-wrap">
              <slot name="title-prefix" />
              <FactCheckHighlight :issue="issue">
                <span class="card-title">{{ rec.name }}</span>
              </FactCheckHighlight>
              <span v-if="spec" class="meta-token">{{ spec }}</span>
              <span
                v-if="rec.reason"
                class="reason-tooltip-trigger"
                :class="{ open: reasonOpen }"
                @click.stop
              >
                <button class="reason-icon-btn" type="button" aria-label="查看推荐依据" title="查看推荐依据" @click.stop="emit('toggle-reason', $event)">
                  <Icon icon="lucide:circle-help" size="14" />
                </button>
                <span class="hover-reason-tooltip">{{ rec.reason }}</span>
              </span>
            </div>
            <span class="meta-token match-token" :class="{ warning: matchTone === 'warning', success: matchTone === 'success' }">
              {{ matchLabel }}
            </span>
            <div v-if="$slots['title-meta']" class="card-title-meta">
              <slot name="title-meta" />
            </div>
            <button
              v-if="showExecDeptChip"
              class="exec-dept-chip"
              :class="{ missing: execDeptMissing }"
              type="button"
              :title="execDeptTitle"
              @click.stop="emit('open-exec-dept', $event)"
            >
              <span v-if="execDeptMissing" class="exec-dept-chip-label">执行科室</span>
              <span class="exec-dept-chip-value">{{ execDeptDisplay || '待设置' }}</span>
            </button>
            <button
              v-if="showPharmacyChip"
              class="exec-dept-chip pharmacy-chip"
              :class="{ missing: pharmacyMissing }"
              type="button"
              :title="pharmacyTitle"
              @click.stop="emit('open-pharmacy', $event)"
            >
              <span v-if="pharmacyMissing" class="exec-dept-chip-label">发药药房</span>
              <span class="exec-dept-chip-value">{{ pharmacyDisplay || '待设置' }}</span>
            </button>
            <span v-if="usageToken" class="meta-token usage-summary-token">建议 {{ usageToken }}</span>
          </div>

          <div v-if="probableMatchName" class="manual-match-origin-note probable-match-note">
            <span class="probable-match-copy">
              <span class="probable-match-label">候选标准项</span>
              <span class="probable-match-name">{{ probableMatchName }}</span>
            </span>
            <button
              class="confirm-match-btn inline"
              type="button"
              title="确认采用该标准库候选"
              @click.stop="emit('confirm-probable-match', $event)"
            >
              确认匹配
            </button>
          </div>

          <div v-if="originalName" class="manual-match-origin-note">
            AI 原建议：{{ originalName }}
          </div>

          <button
            v-if="inlineSummary"
            class="medicine-inline-summary"
            :class="{ clickable: showEditorToggle && !editorExpanded }"
            type="button"
            @click.stop="showEditorToggle && !editorExpanded ? emit('toggle-editor', $event) : undefined"
          >
            {{ inlineSummary }}
          </button>
        </div>

        <div class="card-actions treatment-card-actions">
          <slot name="actions" />
          <button
            v-if="showManualMatchButton"
            class="manual-match-btn"
            type="button"
            :title="manualMatchTitle"
            @click.stop="emit('toggle-manual-match', $event)"
          >
            {{ manualMatchButtonText }}
          </button>
          <div v-if="showFeedback" class="voice-feedback-anchor" @click.stop>
            <button
              class="voice-feedback-trigger"
              :class="{ submitted: !!feedbackSubmittedLabel }"
              type="button"
              @click.stop="emit('toggle-feedback', $event)"
            >反馈</button>
            <div v-if="feedbackVisible" class="voice-feedback-panel">
              <VoiceRecommendationFeedbackPopover
                :visible="true"
                :title="rec.name"
                :draft="feedbackDraft"
                :submitting="feedbackSubmitting"
                :submitted-label="feedbackSubmittedLabel"
                @close="emit('toggle-feedback')"
                @update:draft="emit('update:feedbackDraft', $event)"
                @submit="emit('submit-feedback', $event)"
              />
            </div>
          </div>
          <button
            v-if="showEditorToggle"
            class="inline-arrow-btn action-arrow"
            type="button"
            :title="editorExpanded ? '收起更多编辑' : '展开更多编辑'"
            :aria-label="editorExpanded ? '收起更多编辑' : '展开更多编辑'"
            @click.stop="emit('toggle-editor', $event)"
          >
            <span class="inline-arrow" :class="{ open: editorExpanded }"></span>
          </button>
        </div>
      </div>

      <slot name="body" />
      <slot name="manual-match" />
      <slot name="editor" />
    </template>
  </article>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import FactCheckHighlight from '@features/feedback/ui/FactCheckHighlight.vue';
import VoiceRecommendationFeedbackPopover from '@features/voice-consultation/ui/VoiceRecommendationFeedbackPopover.vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { VoiceRecommendationFeedbackDraft } from '@/types/voiceFeedback';
import type { FactCheckIssue } from '@services/factChecker';

defineProps({
  rec: {
    type: Object as PropType<TreatmentRecommendation>,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  locked: {
    type: Boolean,
    default: false,
  },
  matching: {
    type: Boolean,
    default: false,
  },
  issue: {
    type: Object as PropType<FactCheckIssue | undefined>,
    default: undefined,
  },
  spec: {
    type: String,
    default: '',
  },
  reasonOpen: {
    type: Boolean,
    default: false,
  },
  matchLabel: {
    type: String,
    default: '',
  },
  matchTone: {
    type: String as PropType<'default' | 'warning' | 'success'>,
    default: 'default',
  },
  showExecDeptChip: {
    type: Boolean,
    default: false,
  },
  execDeptDisplay: {
    type: String,
    default: '',
  },
  execDeptMissing: {
    type: Boolean,
    default: false,
  },
  execDeptTitle: {
    type: String,
    default: '',
  },
  showPharmacyChip: {
    type: Boolean,
    default: false,
  },
  pharmacyDisplay: {
    type: String,
    default: '',
  },
  pharmacyMissing: {
    type: Boolean,
    default: false,
  },
  pharmacyTitle: {
    type: String,
    default: '',
  },
  usageToken: {
    type: String,
    default: '',
  },
  probableMatchName: {
    type: String,
    default: '',
  },
  originalName: {
    type: String,
    default: '',
  },
  inlineSummary: {
    type: String,
    default: '',
  },
  showFeedback: {
    type: Boolean,
    default: true,
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
  feedbackSubmittedLabel: {
    type: String,
    default: '',
  },
  showManualMatchButton: {
    type: Boolean,
    default: false,
  },
  manualMatchTitle: {
    type: String,
    default: '',
  },
  manualMatchButtonText: {
    type: String,
    default: '手动匹配',
  },
  showEditorToggle: {
    type: Boolean,
    default: false,
  },
  editorExpanded: {
    type: Boolean,
    default: false,
  },
  layoutVariant: {
    type: String as PropType<'default' | 'worklist'>,
    default: 'default',
  },
});

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'toggle-reason', event?: Event): void;
  (e: 'open-exec-dept', event?: Event): void;
  (e: 'open-pharmacy', event?: Event): void;
  (e: 'confirm-probable-match', event?: Event): void;
  (e: 'toggle-feedback', event?: Event): void;
  (e: 'update:feedbackDraft', draft: VoiceRecommendationFeedbackDraft): void;
  (e: 'submit-feedback', draft: VoiceRecommendationFeedbackDraft): void;
  (e: 'toggle-manual-match', event?: Event): void;
  (e: 'toggle-editor', event?: Event): void;
}>();
</script>

<style scoped>
.vcn-treatment-item {
  position: relative;
  padding: 12px 14px 12px 34px;
  border: 1px solid var(--voice-border);
  border-radius: 14px;
  background: var(--voice-surface);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
}

.vcn-treatment-item:hover {
  border-color: var(--voice-border-strong);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.035);
}

.vcn-treatment-item.selected {
  background: var(--voice-surface);
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 8px 18px rgba(15, 23, 42, 0.028);
}

.vcn-treatment-item.locked {
  border-style: dashed;
}

.vcn-treatment-item.matching,
.vcn-treatment-item.worklist.matching {
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 10px 20px rgba(15, 23, 42, 0.03);
}

.card-selected-mark {
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

.card-selected-mark::after {
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

.treatment-card-row {
  align-items: baseline;
}

.vcn-treatment-item.worklist {
  padding: 12px 14px;
  border-color: #e2e8f0;
  border-radius: 12px;
  box-shadow: none;
}

.vcn-treatment-item.worklist.matching:hover {
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 10px 20px rgba(15, 23, 42, 0.03);
}

.vcn-treatment-item.worklist:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.vcn-treatment-item.worklist.selected {
  background: var(--voice-surface);
  border-color: var(--voice-accent);
  box-shadow: 0 0 0 1px var(--voice-accent-soft), 0 10px 20px rgba(15, 23, 42, 0.03);
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

.worklist-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.worklist-select-indicator {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2px;
}

.worklist-select-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.worklist-select-indicator.selected .worklist-select-dot {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #2563eb;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.worklist-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.worklist-primary-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.worklist-name-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.worklist-name-wrap .meta-token {
  min-width: 0;
  max-width: min(240px, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
}

.worklist-secondary-row {
  display: flex;
  align-items: flex-start;
  gap: 8px 12px;
  flex-wrap: wrap;
}

.worklist-inline-text {
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.worklist-inline-origin {
  color: #94a3b8;
}

.worklist-actions-col {
  display: flex;
  align-items: center;
  gap: 12px;
}

.worklist-status-col {
  display: flex;
  justify-content: flex-start;
  padding-top: 2px;
  min-width: 0;
  color: #b45309;
  font-weight: 600;
}

.worklist .match-token {
  margin-left: 0;
}

.worklist-status {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 92px;
  white-space: nowrap;
}

.worklist-attr-col {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  align-content: flex-start;
  min-width: 0;
  padding-top: 1px;
}

.worklist-title-meta {
  display: contents;
}

.worklist-usage-token {
  color: #64748b;
  flex-shrink: 0;
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
  z-index: 60;
  width: min(320px, 48vw);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: #ffffff;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);
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

.match-token {
  display: inline-block;
  color: #64748b;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.worklist .match-token {
  font-size: 12px;
}

.meta-token.warning {
  color: #b45309;
}

.meta-token.success {
  color: #1d4ed8;
}

.card-title-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.medicine-inline-summary {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.medicine-inline-summary.clickable {
  cursor: pointer;
}

.medicine-inline-summary.clickable:hover {
  color: var(--voice-accent);
}

.worklist .medicine-inline-summary {
  flex: 0 0 100%;
  max-width: 100%;
  min-width: 100%;
  width: 100%;
  margin-top: 0;
  white-space: normal;
  color: #475569;
}

.worklist .worklist-secondary-row {
  display: block;
}

.worklist .worklist-secondary-row .worklist-inline-text,
.worklist .worklist-secondary-row .worklist-usage-token {
  display: block;
  margin-top: 4px;
}

.worklist .worklist-secondary-row .worklist-inline-text + .worklist-inline-text,
.worklist .worklist-secondary-row .worklist-usage-token + .worklist-inline-text,
.worklist .worklist-secondary-row .worklist-inline-text + .worklist-usage-token {
  margin-top: 4px;
}

.manual-match-origin-note {
  margin-top: 6px;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  line-height: 1.5;
}

.worklist .manual-match-origin-note {
  margin-top: 0;
}

.probable-match-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(201, 122, 17, 0.18);
  background: linear-gradient(180deg, rgba(201, 122, 17, 0.09) 0%, rgba(201, 122, 17, 0.04) 100%);
  color: var(--voice-text);
}

.probable-match-copy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.probable-match-label {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(201, 122, 17, 0.14);
  color: var(--voice-warning);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.probable-match-name {
  color: var(--voice-text);
  font-weight: 600;
  word-break: break-word;
}

.exec-dept-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 180px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  cursor: pointer;
  font-size: var(--voice-font-min);
  font-weight: 700;
}

.exec-dept-chip:hover {
  border-color: var(--voice-accent);
  background: rgba(37, 99, 235, 0.1);
}

.exec-dept-chip.missing {
  border-color: rgba(201, 122, 17, 0.28);
  background: rgba(201, 122, 17, 0.1);
  color: var(--voice-warning);
}

.exec-dept-chip-label {
  flex-shrink: 0;
  font-size: var(--voice-font-min);
  font-weight: 700;
}

.exec-dept-chip-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--voice-font-min);
  font-weight: 700;
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
}

.treatment-card-actions {
  align-items: center;
  align-self: baseline;
  min-height: 28px;
}

.worklist-actions {
  display: inline-flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.worklist-chip {
  min-height: 28px;
  max-width: none;
  padding: 0 8px;
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(248, 250, 252, 0.96);
  color: #1d4ed8;
}

.worklist-chip.missing {
  border-color: rgba(201, 122, 17, 0.28);
  background: rgba(201, 122, 17, 0.1);
  color: var(--voice-warning);
}

.worklist-actions .voice-feedback-anchor,
.worklist-actions .manual-match-btn,
.worklist-actions .inline-arrow-btn,
.worklist-actions .voice-feedback-trigger {
  flex-shrink: 0;
}

.worklist-actions .voice-feedback-trigger,
.worklist-actions .manual-match-btn,
.worklist-actions .action-arrow {
  min-height: 24px;
  border-radius: 999px;
}

:slotted(.doc-icon-btn) {
  min-height: 30px;
  min-width: 30px;
  border: 1px solid var(--voice-border, #dbe3ee);
  border-radius: 8px;
  background: #fff;
}

.worklist-detail-stack {
  margin-top: 10px;
  margin-left: 34px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.manual-match-btn {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.manual-match-btn:hover {
  border-color: var(--voice-accent);
  background: var(--voice-accent-soft);
}

.confirm-match-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(201, 122, 17, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #9a5a07;
  font-size: var(--voice-font-min);
  font-weight: 600;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36);
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.confirm-match-btn.inline {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
  flex-shrink: 0;
}

.confirm-match-btn:hover {
  border-color: rgba(201, 122, 17, 0.34);
  background: rgba(201, 122, 17, 0.14);
  color: #7a4505;
  transform: translateY(-1px);
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

.action-arrow {
  background: var(--voice-surface-soft);
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

  .worklist-row {
    grid-template-columns: 22px minmax(0, 1fr) auto;
  }

  .worklist-primary-row,
  .worklist-secondary-row {
    flex-wrap: wrap;
  }

  .worklist-status-col,
  .worklist-attr-col,
  .worklist-actions {
    grid-column: 2;
  }

  .worklist-actions {
    min-width: 0;
    justify-content: flex-start;
  }

  .worklist-detail-stack {
    margin-left: 22px;
  }
}
</style>
