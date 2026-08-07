<script setup lang="ts">
import { onUnmounted, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { useClinicalResultSupplementInput } from '../model/useClinicalResultSupplementInput';

const props = defineProps<{
  open: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [supplement: string];
}>();

const supplement = useClinicalResultSupplementInput();
const {
  busy,
  discardRecording,
  error,
  recording,
  recordingDuration,
  reset,
  text,
  toggleRecording,
  transcribing,
  voiceButtonText,
  waveformLevels,
} = supplement;

watch(
  () => props.open,
  (open) => {
    if (open) void reset();
  },
);

onUnmounted(() => {
  void discardRecording();
});

async function closeDialog(): Promise<void> {
  if (props.disabled || transcribing.value) return;
  await discardRecording();
  emit('close');
}

function confirm(): void {
  const value = text.value.trim();
  if (!value || props.disabled || busy.value) return;
  emit('confirm', value);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="supplement-overlay"
      role="presentation"
      @click.self="closeDialog"
    >
      <section
        class="supplement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinical-result-supplement-title"
      >
        <header class="supplement-header">
          <div>
            <span class="supplement-eyebrow">重新生成问诊结果</span>
            <h3 id="clinical-result-supplement-title">补充本次就诊信息</h3>
            <p>可补充遗漏症状、时间变化、查体或检查结果。确认后将重新生成病历、诊断和适用的治疗方案。</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" :disabled="props.disabled" @click="closeDialog">
            <Icon icon="lucide:x" size="18" />
          </button>
        </header>

        <textarea
          v-model="text"
          class="supplement-textarea"
          maxlength="2000"
          rows="7"
          :disabled="props.disabled"
          placeholder="例如：患者补充昨晚开始发热，最高 38.6℃，伴咽痛，无胸闷气促……"
        />

        <div v-if="recording" class="recording-monitor" role="status" aria-live="polite">
          <div class="recording-status">
            <span class="recording-pulse" aria-hidden="true"></span>
            <span>正在采集声音</span>
          </div>
          <div class="recording-waveform" aria-hidden="true">
            <span
              v-for="(level, index) in waveformLevels"
              :key="index"
              class="recording-waveform-bar"
              :style="{
                height: `${Math.round(5 + level * 23)}px`,
                opacity: String(0.45 + level * 0.55),
              }"
            ></span>
          </div>
          <span class="recording-time">{{ recordingDuration }}</span>
        </div>

        <div class="supplement-input-actions">
          <button
            class="voice-input-button"
            type="button"
            :class="{ recording }"
            :disabled="props.disabled || transcribing"
            @click="toggleRecording"
          >
            <Icon
              :icon="recording ? 'lucide:square' : transcribing ? 'lucide:loader-2' : 'lucide:mic'"
              :class="{ spin: transcribing }"
              size="16"
            />
            <span>{{ voiceButtonText }}</span>
          </button>
          <span class="character-count">{{ text.length }}/2000</span>
        </div>

        <p v-if="error" class="supplement-error" role="alert">
          <Icon icon="lucide:circle-alert" size="15" />
          {{ error }}
        </p>

        <footer class="supplement-footer">
          <button class="secondary-button" type="button" :disabled="props.disabled" @click="closeDialog">取消</button>
          <button
            class="primary-button"
            type="button"
            :disabled="props.disabled || busy || !text.trim()"
            @click="confirm"
          >
            <Icon icon="lucide:sparkles" size="16" />
            重新生成病历
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.supplement-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--surface-overlay, rgba(15, 23, 42, 0.42));
  backdrop-filter: blur(8px);
}

.supplement-dialog {
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--color-border, rgba(148, 163, 184, 0.3));
  border-radius: 18px;
  background: var(--surface-glass-strong, rgba(255, 255, 255, 0.98));
  box-shadow: var(--shadow-2xl, 0 24px 64px rgba(15, 23, 42, 0.22));
  color: var(--color-text-primary, #164e63);
}

.supplement-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.supplement-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--color-primary, #0891b2);
  font-size: 13px;
  font-weight: 700;
}

.supplement-header h3 {
  margin: 0;
  font-size: 20px;
}

.supplement-header p {
  margin: 8px 0 0;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  line-height: 1.6;
}

.icon-button,
.voice-input-button,
.secondary-button,
.primary-button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.icon-button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--color-text-secondary, #64748b);
  background: var(--color-background-light, #f1f5f9);
}

.supplement-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 150px;
  resize: vertical;
  padding: 14px 16px;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 12px;
  outline: none;
  color: var(--color-text-primary, #164e63);
  background: var(--color-background-white, #fff);
  font: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.supplement-textarea:focus {
  border-color: var(--color-primary, #0891b2);
  box-shadow: 0 0 0 3px var(--color-primary-100, rgba(8, 145, 178, 0.1));
}

.supplement-input-actions,
.supplement-footer,
.voice-input-button,
.primary-button {
  display: flex;
  align-items: center;
}

.supplement-input-actions {
  justify-content: space-between;
  margin-top: 10px;
}

.recording-monitor {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #0891b2) 24%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--color-primary, #0891b2) 7%, #fff);
  color: var(--color-text-primary, #164e63);
}

.recording-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.recording-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-danger, #dc2626);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-danger, #dc2626) 38%, transparent);
  animation: recording-pulse 1.4s ease-out infinite;
}

.recording-waveform {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 30px;
  overflow: hidden;
}

.recording-waveform-bar {
  width: 3px;
  min-height: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--color-primary, #0891b2), #38bdf8);
  transition: height 80ms linear, opacity 80ms linear;
}

.voice-input-button {
  gap: 7px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 9px;
  color: var(--color-primary, #0891b2);
  background: var(--color-background-white, #fff);
  font-size: 13px;
  font-weight: 650;
}

.voice-input-button.recording {
  color: var(--color-danger, #dc2626);
  border-color: color-mix(in srgb, var(--color-danger, #dc2626) 45%, transparent);
  background: color-mix(in srgb, var(--color-danger, #dc2626) 8%, transparent);
}

.recording-time {
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.character-count {
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 12px;
}

.supplement-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 0 0;
  color: var(--color-danger, #dc2626);
  font-size: 13px;
}

.supplement-footer {
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.secondary-button,
.primary-button {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
}

.secondary-button {
  border: 1px solid var(--color-border, #cbd5e1);
  color: var(--color-text-secondary, #475569);
  background: var(--color-background-white, #fff);
}

.primary-button {
  gap: 7px;
  color: var(--btn-primary-text, #fff);
  background: var(--btn-primary-bg, var(--color-primary, #0891b2));
}

button:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

button:focus-visible,
textarea:focus-visible {
  outline: 3px solid var(--color-primary-200, rgba(8, 145, 178, 0.2));
  outline-offset: 2px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes recording-pulse {
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .recording-pulse {
    animation: none;
  }

  .recording-waveform-bar {
    transition: none;
  }
}
</style>
