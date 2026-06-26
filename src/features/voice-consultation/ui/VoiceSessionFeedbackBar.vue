<script setup lang="ts">
import { computed } from 'vue';
import {
  VOICE_SESSION_ISSUE_OPTIONS,
  createEmptySessionDraft,
} from '@/services/voiceFeedback';
import type { VoiceSessionFeedbackDraft } from '@/types/voiceFeedback';

const props = defineProps<{
  draft?: VoiceSessionFeedbackDraft;
  submitting?: boolean;
  submittedAt?: number | null;
}>();

const emit = defineEmits<{
  (event: 'update:draft', value: VoiceSessionFeedbackDraft): void;
  (event: 'submit', value: VoiceSessionFeedbackDraft): void;
}>();

const resolvedDraft = computed<VoiceSessionFeedbackDraft>(() => props.draft || createEmptySessionDraft());
const needsIssueTag = computed(() => resolvedDraft.value.rating > 0 && resolvedDraft.value.rating <= 3);
const canSubmit = computed(() => resolvedDraft.value.rating > 0 && (!needsIssueTag.value || resolvedDraft.value.issueTags.length > 0));

function patchDraft(patch: Partial<VoiceSessionFeedbackDraft>): void {
  emit('update:draft', {
    ...createEmptySessionDraft(),
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
  <section class="voice-session-feedback pane-card">
    <div class="voice-session-feedback-main">
      <div>
        <div class="voice-session-feedback-title">本次问诊结果怎么样</div>
        <div class="voice-session-feedback-subtitle">支持整页评分和点评，便于后续优化推荐质量</div>
      </div>

      <div class="voice-session-stars">
        <button
          v-for="value in 5"
          :key="value"
          class="voice-session-star"
          :class="{ active: value <= resolvedDraft.rating }"
          type="button"
          @click="patchDraft({ rating: value })"
        >{{ value }}分</button>
      </div>
    </div>

    <div class="voice-session-tags">
      <button
        v-for="option in VOICE_SESSION_ISSUE_OPTIONS"
        :key="option.key"
        class="voice-session-tag"
        :class="{ active: resolvedDraft.issueTags.includes(option.key) }"
        type="button"
        @click="toggleTag(option.key)"
      >{{ option.label }}</button>
    </div>

    <div class="voice-session-footer">
      <textarea
        class="voice-session-textarea"
        :value="resolvedDraft.comment"
        rows="2"
        placeholder="可补充这次结果中最需要优化的地方"
        @input="patchDraft({ comment: ($event.target as HTMLTextAreaElement).value })"
      ></textarea>

      <div class="voice-session-submit-row">
        <span v-if="submittedAt" class="voice-session-submitted">已提交整页反馈</span>
        <button class="voice-session-submit" type="button" :disabled="!canSubmit || submitting" @click="submit">
          {{ submitting ? '提交中...' : '提交整页反馈' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.voice-session-feedback {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: none;
}

.voice-session-feedback-main,
.voice-session-submit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.voice-session-feedback-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-strong, #1f2937);
}

.voice-session-feedback-subtitle,
.voice-session-submitted {
  margin-top: 3px;
  font-size: 12px;
  color: var(--color-text-muted, #66758a);
}

.voice-session-submitted {
  margin-top: 0;
  color: var(--color-success, #1f8a5b);
}

.voice-session-stars,
.voice-session-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.voice-session-star,
.voice-session-tag,
.voice-session-submit {
  border: 1px solid transparent;
  cursor: pointer;
}

.voice-session-star,
.voice-session-tag {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-background-gray, #eef3f8);
  color: var(--color-text-muted, #66758a);
  font-size: 12px;
}

.voice-session-star.active,
.voice-session-tag.active {
  background: rgba(43, 127, 227, 0.1);
  border-color: rgba(43, 127, 227, 0.18);
  color: var(--color-cta-dark, #1f6fd0);
}

.voice-session-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.voice-session-textarea {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light, #dbe4ef);
  border-radius: 12px;
  resize: vertical;
  font-size: 13px;
  color: var(--color-text-strong, #1f2937);
  background: #fff;
  outline: none;
}

.voice-session-textarea:focus {
  border-color: var(--color-cta, #2b7fe3);
  box-shadow: 0 0 0 3px rgba(43, 127, 227, 0.1);
}

.voice-session-submit {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--color-cta, #2b7fe3);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.voice-session-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 960px) {
  .voice-session-feedback-main,
  .voice-session-footer,
  .voice-session-submit-row {
    grid-template-columns: 1fr;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
