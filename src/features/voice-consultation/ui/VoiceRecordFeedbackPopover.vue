<script setup lang="ts">
import { computed } from 'vue';
import {
  VOICE_RECORD_FIELD_ISSUE_OPTIONS,
  buildVoiceRecordFieldDiffSummary,
  createEmptyRecordFieldDraft,
} from '@/services/voiceFeedback';
import type { VoiceRecordFieldFeedbackDraft } from '@/types/voiceFeedback';

const props = defineProps<{
  visible: boolean;
  title: string;
  originalValue: string;
  currentValue: string;
  draft?: VoiceRecordFieldFeedbackDraft;
  submitting?: boolean;
  submittedLabel?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'update:draft', value: VoiceRecordFieldFeedbackDraft): void;
  (event: 'submit', value: VoiceRecordFieldFeedbackDraft): void;
}>();

const resolvedDraft = computed<VoiceRecordFieldFeedbackDraft>(() => props.draft || createEmptyRecordFieldDraft());
const diffSummary = computed(() => buildVoiceRecordFieldDiffSummary(props.originalValue, props.currentValue));
const rawDiffSegments = computed(() => {
  const original = props.originalValue || '';
  const current = props.currentValue || '';

  let prefixLength = 0;
  const maxPrefix = Math.min(original.length, current.length);
  while (prefixLength < maxPrefix && original[prefixLength] === current[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffix = Math.min(original.length - prefixLength, current.length - prefixLength);
  while (
    suffixLength < maxSuffix
    && original[original.length - 1 - suffixLength] === current[current.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    prefix: original.slice(0, prefixLength),
    removed: original.slice(prefixLength, original.length - suffixLength),
    added: current.slice(prefixLength, current.length - suffixLength),
    suffix: original.slice(original.length - suffixLength),
  };
});
const diffSegments = computed(() => {
  const maxContextLength = 28;
  const prefix = rawDiffSegments.value.prefix;
  const suffix = rawDiffSegments.value.suffix;

  return {
    prefix: prefix.length > maxContextLength ? `...${prefix.slice(-maxContextLength)}` : prefix,
    removed: rawDiffSegments.value.removed,
    added: rawDiffSegments.value.added,
    suffix: suffix.length > maxContextLength ? `${suffix.slice(0, maxContextLength)}...` : suffix,
  };
});
const requiresIssueInput = computed(() => resolvedDraft.value.action === 'dissatisfied');
const requiresCorrectedValue = computed(() => resolvedDraft.value.action === 'corrected');
const canSubmit = computed(() => {
  if (!resolvedDraft.value.action) {
    return false;
  }
  if (requiresIssueInput.value && resolvedDraft.value.issueTags.length === 0 && !resolvedDraft.value.comment.trim()) {
    return false;
  }
  if (requiresCorrectedValue.value && !resolvedDraft.value.correctedValue.trim() && !props.currentValue.trim()) {
    return false;
  }
  return true;
});

function patchDraft(patch: Partial<VoiceRecordFieldFeedbackDraft>): void {
  emit('update:draft', {
    ...createEmptyRecordFieldDraft(),
    ...resolvedDraft.value,
    ...patch,
  });
}

function applyAction(action: VoiceRecordFieldFeedbackDraft['action']): void {
  if (action === 'corrected') {
    patchDraft({
      action,
      correctedValue: resolvedDraft.value.correctedValue || props.currentValue || props.originalValue,
    });
    return;
  }
  patchDraft({ action });
}

function toggleTag(tag: string): void {
  const nextTags = resolvedDraft.value.issueTags.includes(tag)
    ? resolvedDraft.value.issueTags.filter((item) => item !== tag)
    : [...resolvedDraft.value.issueTags, tag];
  patchDraft({ issueTags: nextTags });
}

function submit(): void {
  if (!canSubmit.value) {
    return;
  }

  emit('submit', {
    ...resolvedDraft.value,
    correctedValue: resolvedDraft.value.action === 'corrected'
      ? (resolvedDraft.value.correctedValue.trim() || props.currentValue.trim())
      : resolvedDraft.value.correctedValue,
  });
}

function shouldShowRemovedSegment(): boolean {
  return diffSegments.value.removed.trim().length > 0;
}

function shouldShowAddedSegment(): boolean {
  return diffSegments.value.added.trim().length > 0;
}
</script>

<template>
  <div v-if="visible" class="voice-record-feedback" @click.stop>
    <div class="voice-record-feedback-header">
      <div>
        <div class="voice-record-feedback-title">反馈病例内容</div>
        <div class="voice-record-feedback-subtitle">{{ title }}</div>
      </div>
      <button class="voice-record-feedback-close" type="button" @click="emit('close')">收起</button>
    </div>

    <div v-if="!diffSummary.changed" class="voice-record-consistent-card">
      <div class="voice-record-consistent-title">当前内容与 AI 原文一致</div>
      <div class="voice-record-consistent-text">未检测到该字段的实质修改，反馈时无需重复核对完整文本。</div>
    </div>

    <div v-else class="voice-record-feedback-preview">
      <div class="voice-record-preview-block voice-record-preview-block--diff">
        <div class="voice-record-preview-label">修改留痕</div>
        <div class="voice-record-preview-diff-content voice-record-preview-diff-content--inline">
          <span v-if="diffSegments.prefix" class="voice-record-diff-context">{{ diffSegments.prefix }}</span>
          <span v-if="shouldShowRemovedSegment()" class="voice-record-diff-removed">{{ diffSegments.removed }}</span>
          <span v-if="shouldShowAddedSegment()" class="voice-record-diff-added">{{ diffSegments.added }}</span>
          <span v-if="diffSegments.suffix" class="voice-record-diff-context">{{ diffSegments.suffix }}</span>
        </div>
      </div>
    </div>

    <div class="voice-record-feedback-actions">
      <button
        class="voice-record-action"
        :class="{ active: resolvedDraft.action === 'useful' }"
        type="button"
        @click="applyAction('useful')"
      >有用</button>
      <button
        class="voice-record-action"
        :class="{ active: resolvedDraft.action === 'dissatisfied' }"
        type="button"
        @click="applyAction('dissatisfied')"
      >不满意</button>
      <button
        class="voice-record-action"
        :class="{ active: resolvedDraft.action === 'corrected' }"
        type="button"
        @click="applyAction('corrected')"
      >已修正采用</button>
    </div>

    <div v-if="resolvedDraft.action === 'dissatisfied' || resolvedDraft.action === 'corrected'" class="voice-record-feedback-tags">
      <button
        v-for="option in VOICE_RECORD_FIELD_ISSUE_OPTIONS"
        :key="option.key"
        class="voice-record-tag"
        :class="{ active: resolvedDraft.issueTags.includes(option.key) }"
        type="button"
        @click="toggleTag(option.key)"
      >{{ option.label }}</button>
    </div>

    <textarea
      v-if="requiresCorrectedValue"
      class="voice-record-textarea"
      :value="resolvedDraft.correctedValue"
      rows="3"
      placeholder="填写医生最终采用的病例内容"
      @input="patchDraft({ correctedValue: ($event.target as HTMLTextAreaElement).value })"
    ></textarea>

    <textarea
      class="voice-record-textarea"
      :value="resolvedDraft.comment"
      rows="3"
      :placeholder="requiresIssueInput ? '补充说明哪里不合适' : '可选填写补充说明'"
      @input="patchDraft({ comment: ($event.target as HTMLTextAreaElement).value })"
    ></textarea>

    <div class="voice-record-feedback-footer">
      <span v-if="submittedLabel" class="voice-record-submitted">{{ submittedLabel }}</span>
      <button class="voice-record-submit" type="button" :disabled="!canSubmit || submitting" @click="submit">
        {{ submitting ? '提交中...' : '提交反馈' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-record-feedback {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(380px, calc(100vw - 64px));
  padding: 14px;
  border: 1px solid var(--color-border-light, #dbe4ef);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.14);
}

.voice-record-feedback-header,
.voice-record-feedback-footer,
.voice-record-feedback-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.voice-record-feedback-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.voice-record-feedback-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-strong, #1f2937);
}

.voice-record-feedback-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-muted, #66758a);
}

.voice-record-feedback-close,
.voice-record-action,
.voice-record-tag,
.voice-record-submit {
  border: 1px solid transparent;
  cursor: pointer;
}

.voice-record-feedback-close {
  padding: 0;
  background: transparent;
  color: var(--color-text-muted, #66758a);
  font-size: 12px;
}

.voice-record-action,
.voice-record-tag {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-background-gray, #eef3f8);
  color: var(--color-text-muted, #66758a);
  font-size: 12px;
}

.voice-record-action.active,
.voice-record-tag.active {
  background: rgba(43, 127, 227, 0.1);
  border-color: rgba(43, 127, 227, 0.18);
  color: var(--color-cta-dark, #1f6fd0);
}

.voice-record-feedback-preview {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.voice-record-preview-block {
  padding: 10px 12px;
  border: 1px solid var(--color-border-light, #dbe4ef);
  border-radius: 12px;
  background: rgba(247, 249, 252, 0.92);
}

.voice-record-preview-block--diff {
  background: rgba(250, 252, 255, 0.96);
}

.voice-record-preview-label {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #66758a);
}

.voice-record-preview-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-strong, #1f2937);
  white-space: pre-wrap;
  word-break: break-word;
}

.voice-record-preview-diff-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-strong, #1f2937);
  white-space: pre-wrap;
  word-break: break-word;
}

.voice-record-preview-diff-content--inline {
  line-height: 1.9;
}

.voice-record-diff-context {
  color: var(--color-text-strong, #1f2937);
}

.voice-record-diff-removed,
.voice-record-diff-added {
  display: inline;
  padding: 1px 4px;
  border-radius: 6px;
  font-weight: 600;
}

.voice-record-diff-removed {
  background: rgba(207, 74, 60, 0.14);
  color: #a53327;
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

.voice-record-diff-added {
  background: rgba(31, 138, 91, 0.14);
  color: #11613d;
}

.voice-record-consistent-card {
  padding: 12px;
  border: 1px solid rgba(31, 138, 91, 0.18);
  border-radius: 12px;
  background: rgba(31, 138, 91, 0.06);
}

.voice-record-consistent-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-success, #1f8a5b);
}

.voice-record-consistent-text {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted, #66758a);
}

.voice-record-feedback-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.voice-record-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light, #dbe4ef);
  border-radius: 12px;
  resize: vertical;
  font-size: 13px;
  color: var(--color-text-strong, #1f2937);
  background: #fff;
  outline: none;
}

.voice-record-textarea:focus {
  border-color: var(--color-cta, #2b7fe3);
  box-shadow: 0 0 0 3px rgba(43, 127, 227, 0.1);
}

.voice-record-submitted {
  font-size: 12px;
  color: var(--color-success, #1f8a5b);
}

.voice-record-submit {
  margin-left: auto;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--color-cta, #2b7fe3);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.voice-record-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
