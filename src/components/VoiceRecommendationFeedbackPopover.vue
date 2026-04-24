<script setup lang="ts">
import { computed } from 'vue';
import {
  VOICE_RECOMMENDATION_ISSUE_OPTIONS,
  createEmptyRecommendationDraft,
} from '../services/voiceFeedback';
import type { VoiceRecommendationFeedbackDraft } from '../types/voiceFeedback';

const props = defineProps<{
  visible: boolean;
  title: string;
  draft?: VoiceRecommendationFeedbackDraft;
  submitting?: boolean;
  submittedLabel?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'update:draft', value: VoiceRecommendationFeedbackDraft): void;
  (event: 'submit', value: VoiceRecommendationFeedbackDraft): void;
}>();

const resolvedDraft = computed<VoiceRecommendationFeedbackDraft>(() => props.draft || createEmptyRecommendationDraft());
const requiresIssueInput = computed(() => resolvedDraft.value.action === 'dissatisfied');
const requiresCorrectedValue = computed(() => resolvedDraft.value.action === 'corrected');
const canSubmit = computed(() => {
  if (!resolvedDraft.value.action) {
    return false;
  }
  if (requiresIssueInput.value && resolvedDraft.value.issueTags.length === 0 && !resolvedDraft.value.comment.trim()) {
    return false;
  }
  if (requiresCorrectedValue.value && !resolvedDraft.value.correctedValue.trim()) {
    return false;
  }
  return true;
});

function patchDraft(patch: Partial<VoiceRecommendationFeedbackDraft>): void {
  emit('update:draft', {
    ...createEmptyRecommendationDraft(),
    ...resolvedDraft.value,
    ...patch,
  });
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
  emit('submit', resolvedDraft.value);
}
</script>

<template>
  <div v-if="visible" class="voice-rec-feedback" @click.stop>
    <div class="voice-rec-feedback-header">
      <div>
        <div class="voice-rec-feedback-title">反馈推荐</div>
        <div class="voice-rec-feedback-subtitle">{{ title }}</div>
      </div>
      <button class="voice-rec-feedback-close" type="button" @click="emit('close')">收起</button>
    </div>

    <div class="voice-rec-feedback-actions">
      <button
        class="voice-rec-action"
        :class="{ active: resolvedDraft.action === 'useful' }"
        type="button"
        @click="patchDraft({ action: 'useful' })"
      >有用</button>
      <button
        class="voice-rec-action"
        :class="{ active: resolvedDraft.action === 'dissatisfied' }"
        type="button"
        @click="patchDraft({ action: 'dissatisfied' })"
      >不满意</button>
      <button
        class="voice-rec-action"
        :class="{ active: resolvedDraft.action === 'corrected' }"
        type="button"
        @click="patchDraft({ action: 'corrected' })"
      >已修正采用</button>
    </div>

    <div v-if="resolvedDraft.action === 'dissatisfied' || resolvedDraft.action === 'corrected'" class="voice-rec-feedback-tags">
      <button
        v-for="option in VOICE_RECOMMENDATION_ISSUE_OPTIONS"
        :key="option.key"
        class="voice-rec-tag"
        :class="{ active: resolvedDraft.issueTags.includes(option.key) }"
        type="button"
        @click="toggleTag(option.key)"
      >{{ option.label }}</button>
    </div>

    <textarea
      v-if="requiresCorrectedValue"
      class="voice-rec-textarea"
      :value="resolvedDraft.correctedValue"
      rows="2"
      placeholder="填写医生最终采用的结果"
      @input="patchDraft({ correctedValue: ($event.target as HTMLTextAreaElement).value })"
    ></textarea>

    <textarea
      class="voice-rec-textarea"
      :value="resolvedDraft.comment"
      rows="3"
      :placeholder="requiresIssueInput ? '补充说明哪里不合适' : '可选填写补充说明'"
      @input="patchDraft({ comment: ($event.target as HTMLTextAreaElement).value })"
    ></textarea>

    <div class="voice-rec-feedback-footer">
      <span v-if="submittedLabel" class="voice-rec-submitted">{{ submittedLabel }}</span>
      <button class="voice-rec-submit" type="button" :disabled="!canSubmit || submitting" @click="submit">
        {{ submitting ? '提交中...' : '提交反馈' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-rec-feedback {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(340px, calc(100vw - 64px));
  padding: 14px;
  border: 1px solid var(--color-border-light, #dbe4ef);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.14);
}

.voice-rec-feedback-header,
.voice-rec-feedback-footer,
.voice-rec-feedback-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.voice-rec-feedback-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.voice-rec-feedback-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-strong, #1f2937);
}

.voice-rec-feedback-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-muted, #66758a);
}

.voice-rec-feedback-close,
.voice-rec-action,
.voice-rec-tag,
.voice-rec-submit {
  border: 1px solid transparent;
  cursor: pointer;
}

.voice-rec-feedback-close {
  padding: 0;
  background: transparent;
  color: var(--color-text-muted, #66758a);
  font-size: 12px;
}

.voice-rec-action,
.voice-rec-tag {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-background-gray, #eef3f8);
  color: var(--color-text-muted, #66758a);
  font-size: 12px;
}

.voice-rec-action.active,
.voice-rec-tag.active {
  background: rgba(43, 127, 227, 0.1);
  border-color: rgba(43, 127, 227, 0.18);
  color: var(--color-cta-dark, #1f6fd0);
}

.voice-rec-feedback-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.voice-rec-textarea {
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

.voice-rec-textarea:focus {
  border-color: var(--color-cta, #2b7fe3);
  box-shadow: 0 0 0 3px rgba(43, 127, 227, 0.1);
}

.voice-rec-submitted {
  font-size: 12px;
  color: var(--color-success, #1f8a5b);
}

.voice-rec-submit {
  margin-left: auto;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--color-cta, #2b7fe3);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.voice-rec-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>