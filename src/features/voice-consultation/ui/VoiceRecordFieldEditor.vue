<script setup lang="ts">
import VoiceRecordFeedbackPopover from './VoiceRecordFeedbackPopover.vue';
import type {
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
} from '@/types/voiceFeedback';

const props = withDefaults(defineProps<{
  modelValue: string;
  fieldKey: VoiceRecordFieldKey;
  title: string;
  originalValue: string;
  draft: VoiceRecordFieldFeedbackDraft;
  feedbackKey: string;
  feedbackOpen: boolean;
  modified: boolean;
  rows: number;
  placeholder: string;
  submittedLabel?: string;
  submitting?: boolean;
  grow?: boolean;
}>(), {
  submittedLabel: '',
  submitting: false,
  grow: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'toggle-feedback', feedbackKey: string, sourceEvent?: Event): void;
  (event: 'update:draft', fieldKey: VoiceRecordFieldKey, draft: VoiceRecordFieldFeedbackDraft): void;
  (event: 'submit-feedback', fieldKey: VoiceRecordFieldKey, draft: VoiceRecordFieldFeedbackDraft): void;
}>();

function handleInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value || '');
}

function toggleFeedback(event?: Event): void {
  emit('toggle-feedback', props.feedbackKey, event);
}
</script>

<template>
  <div class="record-field" :class="{ 'field-grow': grow }">
    <div class="record-field-head">
      <label>{{ title }}</label>
      <div class="record-field-actions">
        <span v-if="modified" class="record-field-status-chip">已人工修改</span>
        <div class="voice-feedback-anchor" @click.stop>
          <button
            class="voice-feedback-trigger"
            :class="{ submitted: !!submittedLabel }"
            type="button"
            @click.stop="toggleFeedback($event)"
          >反馈</button>
          <div v-if="feedbackOpen" class="voice-feedback-panel">
            <VoiceRecordFeedbackPopover
              :visible="true"
              :title="title"
              :original-value="originalValue"
              :current-value="modelValue"
              :draft="draft"
              :submitting="submitting"
              :submitted-label="submittedLabel"
              @close="toggleFeedback()"
              @update:draft="emit('update:draft', fieldKey, $event)"
              @submit="emit('submit-feedback', fieldKey, $event)"
            />
          </div>
        </div>
      </div>
    </div>
    <textarea
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      @input="handleInput"
    ></textarea>
  </div>
</template>

<style scoped>
.record-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.record-field-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.field-grow {
  flex: 1;
}

.record-field label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.record-field-status-chip {
  display: inline-flex;
  align-items: center;
  max-width: min(260px, 36vw);
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record-field textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--voice-border);
  border-radius: 12px;
  background: var(--voice-surface);
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  line-height: 1.7;
  resize: vertical;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.015) inset;
}

.record-field textarea:focus {
  border-color: var(--voice-accent);
  box-shadow: 0 0 0 3px var(--voice-accent-soft);
  background: rgba(255, 255, 255, 0.98);
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

@media (max-width: 720px) {
  .voice-feedback-panel {
    right: auto;
    left: 0;
  }
}
</style>
