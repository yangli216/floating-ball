<template>
  <section class="inpatient-emr-page">
    <header class="emr-header" data-tauri-drag-region>
      <div class="title-block" data-tauri-drag-region>
        <span class="eyebrow">住院病历</span>
        <h1>AI 病程录生成</h1>
      </div>
      <div class="header-actions">
        <button
          class="ghost-btn"
          type="button"
          :disabled="!request || isGenerating"
          title="重新生成"
          @click="openRegenerateDialog"
        >
          <Icon icon="lucide:refresh-cw" :size="16" />
          <span>重新生成</span>
        </button>
        <button
          class="primary-btn"
          type="button"
          :disabled="!result || isGenerating || isWritingBack"
          title="一键回写"
          @click="writeBack"
        >
          <Icon icon="lucide:send-horizontal" :size="16" />
          <span>{{ isWritingBack ? '回写中' : '一键回写' }}</span>
        </button>
      </div>
    </header>

    <main class="emr-main">
      <aside class="left-pane">
        <section class="process-panel">
          <div class="section-heading">
            <Icon icon="lucide:workflow" :size="17" />
            <span>生成进度</span>
            <strong>{{ completedStepCount }}/{{ steps.length }}</strong>
          </div>
          <ol class="step-list">
            <li
              v-for="step in steps"
              :key="step.key"
              class="step-item"
              :class="`is-${step.status}`"
            >
              <span class="step-icon">
                <Icon
                  v-if="step.status === 'done'"
                  icon="lucide:check"
                  :size="15"
                />
                <Icon
                  v-else-if="step.status === 'error'"
                  icon="lucide:triangle-alert"
                  :size="15"
                />
                <Icon
                  v-else-if="step.status === 'running'"
                  icon="lucide:loader-circle"
                  :size="15"
                  class="spinning"
                />
                <Icon v-else icon="lucide:circle" :size="12" />
              </span>
              <span class="step-copy">
                <strong>{{ step.title }}</strong>
                <small>{{ step.detail }}</small>
              </span>
            </li>
          </ol>
        </section>

        <section class="field-panel" v-if="result">
          <div class="section-heading">
            <Icon icon="lucide:braces" :size="17" />
            <span>AI 生成字段</span>
            <strong>{{ aiFields.length }}</strong>
          </div>
          <div class="field-list">
            <article
              v-for="field in aiFields"
              :key="field.id"
              class="field-prompt-card"
            >
              <div class="field-prompt-head">
                <strong>{{ field.id }}</strong>
                <span>{{ field.rule.promptIntent || 'AI 生成' }}</span>
              </div>
              <p>{{ field.meaning }}</p>
              <details class="field-prompt-detail">
                <summary>
                  <Icon icon="lucide:file-search" :size="13" />
                  <span>查看提示词</span>
                </summary>
                <pre>{{ getFieldPrompt(field) }}</pre>
              </details>
            </article>
          </div>
          <div v-if="aiFields.length === 0" class="no-ai-fields">
            <Icon icon="lucide:circle-slash" :size="18" />
            <span>当前模板没有识别到 AI 生成字段</span>
          </div>
        </section>

        <section class="empty-panel" v-if="!request">
          <Icon icon="lucide:file-plus-2" :size="26" />
          <strong>等待住院病历生成请求</strong>
        </section>
      </aside>

      <section class="preview-pane">
        <div v-if="errorMessage" class="error-banner">
          <Icon icon="lucide:triangle-alert" :size="18" />
          <span>{{ errorMessage }}</span>
        </div>

        <div v-if="isGenerating && !result" class="generating-state">
          <Icon icon="lucide:sparkles" :size="30" class="pulse-icon" />
          <strong>{{ activeStepLabel }}</strong>
          <span>{{ activeStepDetail }}</span>
        </div>

        <template v-if="result">
          <section class="html-preview-card">
            <div class="section-heading">
              <Icon icon="lucide:panel-top" :size="17" />
              <span>病历预览</span>
              <span
                v-if="writebackMessage"
                class="writeback-status"
                :class="`is-${writebackStatus}`"
              >
                {{ writebackMessage }}
              </span>
            </div>
            <div
              class="html-preview"
              :class="{ 'is-generating': isGenerating }"
              v-html="previewHtml"
              @input="handlePreviewInput"
            ></div>
          </section>
        </template>
      </section>
    </main>

    <div
      v-if="showRegenerateDialog"
      class="regenerate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="补充病历要点"
    >
      <section class="regenerate-dialog">
        <header class="regenerate-head">
          <div>
            <span>重新生成</span>
            <strong>补充病历要点</strong>
          </div>
          <button
            class="icon-btn"
            type="button"
            title="关闭"
            @click="closeRegenerateDialog"
          >
            <Icon icon="lucide:x" :size="18" />
          </button>
        </header>

        <div class="supplement-presets">
          <button
            v-for="preset in supplementPresets"
            :key="preset"
            type="button"
            @click="appendSupplementPreset(preset)"
          >
            {{ preset }}
          </button>
        </div>

        <textarea
          v-model="supplementText"
          class="supplement-input"
          rows="8"
          placeholder="例如：今日患者咳嗽较前减轻，无胸闷气促；查体双肺呼吸音稍粗，未闻及明显湿啰音；继续当前抗感染及雾化治疗，复查血常规。"
        ></textarea>

        <div class="voice-row">
          <button
            class="voice-btn"
            type="button"
            :class="{ 'is-recording': isRecordingSupplement }"
            :disabled="isTranscribingSupplement || isGenerating"
            @click="toggleSupplementRecording"
          >
            <Icon
              :icon="isRecordingSupplement ? 'lucide:square' : 'lucide:mic'"
              :size="16"
            />
            <span>{{ supplementVoiceButtonText }}</span>
          </button>
          <button
            class="clear-supplement-btn"
            type="button"
            :disabled="!supplementText.trim() || isRecordingSupplement || isTranscribingSupplement"
            @click="clearSupplementText"
          >
            清空补充
          </button>
          <span v-if="supplementVoiceStatus" class="voice-status">
            {{ supplementVoiceStatus }}
          </span>
        </div>

        <div
          v-if="isRecordingSupplement || isTranscribingSupplement"
          class="capture-visualizer"
          :class="{ 'is-transcribing': isTranscribingSupplement }"
        >
          <div class="recording-dot"></div>
          <div class="meter-bars" aria-hidden="true">
            <span
              v-for="(level, index) in supplementAudioLevels"
              :key="index"
              :style="{ height: `${level}px`, opacity: String(0.36 + (level / 34) * 0.64) }"
            ></span>
          </div>
          <strong>{{ isRecordingSupplement ? formattedSupplementDuration : '识别中' }}</strong>
        </div>

        <div v-if="supplementError" class="supplement-error">
          <Icon icon="lucide:triangle-alert" :size="15" />
          <span>{{ supplementError }}</span>
        </div>

        <footer class="regenerate-footer">
          <button
            class="ghost-btn"
            type="button"
            :disabled="isRecordingSupplement || isTranscribingSupplement"
            @click="closeRegenerateDialog"
          >
            取消
          </button>
          <button
            class="primary-btn"
            type="button"
            :disabled="isRecordingSupplement || isTranscribingSupplement || isGenerating"
            @click="confirmRegenerate"
          >
            <Icon icon="lucide:sparkles" :size="16" />
            <span>{{ supplementText.trim() ? '带补充重新生成' : '直接重新生成' }}</span>
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { audioRecorder, getMicrophoneErrorMessage } from '@/services/audioRecorder';
import { transcribeSpeech } from '@/services/aliyunSpeech';
import { useConsultationReferenceFeedbackListener } from '@features/consultation-result';
import {
  type InpatientEmrReferenceFeedbackPayload,
  useInpatientEmrGeneration,
} from '../model/useInpatientEmrGeneration';
import {
  buildEditableInpatientEmrPreviewHtml,
} from '../lib/inpatientEmrTemplate';
import { buildInpatientEmrFieldPrompt } from '../lib/inpatientEmrPrompts';
import type { InpatientEmrGenerationRequest, InpatientEmrTemplateField } from '../types';

const props = defineProps<{
  request: InpatientEmrGenerationRequest | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  steps,
  result,
  errorMessage,
  isGenerating,
  isWritingBack,
  writebackMessage,
  writebackStatus,
  activeStepKey,
  completedStepCount,
  start,
  updateFieldValue,
  writeBack,
  applyReferenceFeedback,
} = useInpatientEmrGeneration();

const previewHtml = ref('');
const showRegenerateDialog = ref(false);
const supplementText = ref('');
const supplementError = ref('');
const isRecordingSupplement = ref(false);
const isTranscribingSupplement = ref(false);
const supplementRecordingSeconds = ref(0);
const supplementAudioLevels = ref<number[]>(Array.from({ length: 18 }, () => 6));
let supplementTimerId: number | null = null;
let supplementAnimationFrameId: number | null = null;
const supplementPresets = [
  '主诉变化',
  '查体发现',
  '检验检查结果',
  '治疗调整',
  '病情评估',
  '后续计划',
];
const activeStep = computed(() => steps.value.find((step) => step.key === activeStepKey.value));
const activeStepLabel = computed(() => activeStep.value?.title || '准备生成');
const activeStepDetail = computed(() => activeStep.value?.detail || '正在整理住院病历上下文');
const aiFields = computed(() => result.value?.template.fields.filter((field) => field.aiSuitable) || []);
const supplementVoiceButtonText = computed(() => {
  if (isTranscribingSupplement.value) return '识别中';
  return isRecordingSupplement.value ? '停止并识别' : '开始录音';
});
const supplementVoiceStatus = computed(() => {
  if (isTranscribingSupplement.value) return '正在识别，结果将追加到补充要点';
  if (isRecordingSupplement.value) return '正在采集音频';
  return '';
});
const formattedSupplementDuration = computed(() => {
  const minutes = Math.floor(supplementRecordingSeconds.value / 60);
  const seconds = supplementRecordingSeconds.value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

watch(
  () => props.request,
  (request) => {
    if (request) {
      void start(request);
    }
  },
  { immediate: true },
);

useConsultationReferenceFeedbackListener<InpatientEmrReferenceFeedbackPayload>({
  resolveConsultationId: () => result.value?.request.admissionId || props.request?.admissionId || '',
  logContext: 'InpatientEmrPage',
  onFeedback: (payload) => {
    const status = applyReferenceFeedback(payload);
    if (status === 'success') {
      emit('close');
    }
  },
});

watch(
  () => result.value?.generatedAt,
  () => {
    if (!result.value) {
      previewHtml.value = '';
      return;
    }
    previewHtml.value = buildEditableInpatientEmrPreviewHtml(
      result.value.request.htmlContent,
      result.value.fieldValues,
      result.value.template.fields,
    );
  },
);

function getCurrentGenerationRequest(): InpatientEmrGenerationRequest | null {
  return result.value?.request || props.request;
}

function openRegenerateDialog(): void {
  const current = getCurrentGenerationRequest();
  if (!current || isGenerating.value) return;
  supplementText.value = current.doctorSupplement || '';
  supplementError.value = '';
  showRegenerateDialog.value = true;
}

function closeRegenerateDialog(): void {
  if (isRecordingSupplement.value || isTranscribingSupplement.value) return;
  showRegenerateDialog.value = false;
  supplementError.value = '';
}

function appendSupplementPreset(preset: string): void {
  const text = supplementText.value.trim();
  const prefix = text ? '\n' : '';
  supplementText.value = `${text}${prefix}${preset}：`;
}

function appendSupplementText(text: string): void {
  const cleanText = text.trim();
  if (!cleanText) return;
  supplementText.value = supplementText.value.trim()
    ? `${supplementText.value.trim()}\n${cleanText}`
    : cleanText;
}

function clearSupplementText(): void {
  supplementText.value = '';
  supplementError.value = '';
}

function startSupplementTimer(): void {
  clearSupplementTimer();
  supplementRecordingSeconds.value = 0;
  const startedAt = Date.now();
  supplementTimerId = window.setInterval(() => {
    supplementRecordingSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
  }, 250);
}

function clearSupplementTimer(): void {
  if (supplementTimerId != null) {
    window.clearInterval(supplementTimerId);
    supplementTimerId = null;
  }
}

function resetSupplementAudioLevels(): void {
  supplementAudioLevels.value = supplementAudioLevels.value.map(() => 6);
}

function startSupplementVisualizer(): void {
  clearSupplementVisualizer();
  const draw = (): void => {
    const data = audioRecorder.getByteFrequencyData();
    if (data) {
      const barCount = supplementAudioLevels.value.length;
      const step = Math.max(1, Math.floor(data.length / barCount));
      supplementAudioLevels.value = supplementAudioLevels.value.map((_, index) => {
        const value = data[index * step] || 0;
        return Math.max(6, Math.round((value / 255) * 34));
      });
    }
    supplementAnimationFrameId = window.requestAnimationFrame(draw);
  };
  draw();
}

function clearSupplementVisualizer(): void {
  if (supplementAnimationFrameId != null) {
    window.cancelAnimationFrame(supplementAnimationFrameId);
    supplementAnimationFrameId = null;
  }
  resetSupplementAudioLevels();
}

async function toggleSupplementRecording(): Promise<void> {
  supplementError.value = '';
  if (isRecordingSupplement.value) {
    await stopSupplementRecording();
    return;
  }
  try {
    await audioRecorder.start();
    isRecordingSupplement.value = true;
    startSupplementTimer();
    startSupplementVisualizer();
  } catch (error) {
    supplementError.value = `无法开始录音：${getMicrophoneErrorMessage(error)}`;
    clearSupplementTimer();
    clearSupplementVisualizer();
  }
}

async function stopSupplementRecording(): Promise<void> {
  try {
    clearSupplementTimer();
    clearSupplementVisualizer();
    const blob = await audioRecorder.stop();
    isRecordingSupplement.value = false;
    isTranscribingSupplement.value = true;
    const text = await transcribeSpeech(blob);
    if (!text.trim()) {
      supplementError.value = '未识别到有效语音内容，请重新录制或手动输入';
      return;
    }
    appendSupplementText(text);
  } catch (error) {
    supplementError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isRecordingSupplement.value = false;
    isTranscribingSupplement.value = false;
  }
}

async function discardSupplementRecording(): Promise<void> {
  if (!isRecordingSupplement.value) return;
  try {
    clearSupplementTimer();
    clearSupplementVisualizer();
    await audioRecorder.stop();
  } catch (error) {
    console.warn('[InpatientEmrPage] discard supplement recording failed', error);
  } finally {
    isRecordingSupplement.value = false;
    isTranscribingSupplement.value = false;
  }
}

function confirmRegenerate(): void {
  const current = getCurrentGenerationRequest();
  if (!current) return;
  const doctorSupplement = supplementText.value.trim();
  showRegenerateDialog.value = false;
  void start({
    ...current,
    doctorSupplement: doctorSupplement || undefined,
  });
}

function getFieldPrompt(field: InpatientEmrTemplateField): string {
  return buildInpatientEmrFieldPrompt(field, result.value?.context);
}

function handlePreviewInput(event: Event): void {
  const target = event.target as HTMLElement | null;
  const editable = target?.closest?.('[data-inpatient-emr-field-id][contenteditable="true"]') as HTMLElement | null;
  const fieldId = editable?.dataset.inpatientEmrFieldId;
  if (!fieldId) return;
  updateFieldValue(fieldId, editable.textContent || '');
}

onBeforeUnmount(() => {
  void discardSupplementRecording();
});
</script>

<style scoped>
.inpatient-emr-page {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(248, 251, 253, 0.98), rgba(238, 244, 246, 0.98)),
    #f4f7f8;
  color: #1d2b32;
  overflow: hidden;
}

.emr-header {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  border-bottom: 1px solid rgba(116, 136, 145, 0.22);
  background: rgba(255, 255, 255, 0.78);
}

.title-block {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: #0d8b77;
  white-space: nowrap;
}

h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  letter-spacing: 0;
}

.header-actions,
.section-heading,
.step-item,
.field-prompt-head,
.no-ai-fields {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 8px;
}

button {
  border: 0;
  font: inherit;
}

.ghost-btn,
.primary-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border-radius: 7px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.ghost-btn {
  background: #ffffff;
  color: #27515c;
  border: 1px solid rgba(99, 121, 129, 0.24);
}

.primary-btn {
  background: #0f8f7b;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(15, 143, 123, 0.22);
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  box-shadow: none;
}

.ghost-btn:not(:disabled):hover,
.primary-btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.emr-main {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
}

.left-pane,
.preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.left-pane {
  overflow: auto;
}

.preview-pane {
  overflow: hidden;
}

.process-panel,
.field-panel,
.html-preview-card,
.empty-panel {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(107, 128, 137, 0.18);
  box-shadow: 0 12px 28px rgba(23, 42, 49, 0.07);
}

.process-panel,
.field-panel,
.empty-panel {
  padding: 14px;
}

.section-heading {
  gap: 8px;
  min-height: 24px;
  font-size: 14px;
  font-weight: 800;
  color: #203940;
}

.section-heading strong {
  margin-left: auto;
  color: #0e7d6d;
}

.step-list {
  list-style: none;
  padding: 4px 0 0;
  margin: 0;
}

.step-item {
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(119, 135, 143, 0.12);
}

.step-item:last-child {
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

.step-item.is-running .step-icon {
  background: #e8f4ff;
  color: #1976c9;
}

.step-item.is-done .step-icon {
  background: #e5f7ef;
  color: #0f8f5f;
}

.step-item.is-error .step-icon {
  background: #fff0ea;
  color: #c05621;
}

.step-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.step-copy strong {
  font-size: 13px;
  color: #223740;
}

.step-copy small {
  color: #65777f;
  line-height: 1.35;
}

.field-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.field-prompt-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 7px;
  background: #eef8f4;
  border-color: rgba(15, 143, 123, 0.22);
  border: 1px solid rgba(15, 143, 123, 0.22);
}

.field-prompt-head {
  justify-content: space-between;
  gap: 8px;
}

.field-prompt-head strong {
  min-width: 0;
  color: #18343b;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.field-prompt-head span {
  flex: 0 0 auto;
  max-width: 132px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #ffffff;
  color: #0f806e;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-prompt-card p {
  margin: 0;
  color: #40545b;
  font-size: 12px;
  line-height: 1.45;
}

.field-prompt-detail {
  display: grid;
  gap: 7px;
}

.field-prompt-detail summary {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #0f806e;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
}

.field-prompt-detail summary::-webkit-details-marker {
  display: none;
}

.field-prompt-detail pre {
  margin: 0;
  max-height: 132px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #294047;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(15, 143, 123, 0.16);
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

.no-ai-fields {
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 7px;
  background: #f3f6f7;
  color: #66777f;
  font-size: 12px;
}

.empty-panel {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: #60727a;
  padding: 34px 18px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #fff3ed;
  color: #a94d22;
  border: 1px solid rgba(217, 118, 67, 0.28);
}

.generating-state {
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: #31505a;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(107, 128, 137, 0.16);
  border-radius: 8px;
}

.generating-state strong {
  font-size: 18px;
}

.generating-state span {
  color: #64767d;
}

.html-preview-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
}

.html-preview-card {
  flex: 1;
}

.html-preview {
  min-height: 0;
  flex: 1;
  margin-top: 10px;
  padding: 18px;
  overflow: auto;
  border-radius: 7px;
  border: 1px solid rgba(105, 124, 132, 0.18);
  background: #ffffff;
  color: #16272e;
  line-height: 1.72;
}

.html-preview :deep(.inpatient-emr-field--ai) {
  display: inline;
  min-width: 2em;
  border-radius: 5px;
  padding: 1px 4px;
  background: #fff5d8;
  color: #142b32;
  box-shadow: 0 0 0 1px rgba(214, 151, 25, 0.34);
  cursor: text;
  outline: none;
}

.html-preview :deep(.inpatient-emr-field--ai:focus) {
  background: #fff0bd;
  box-shadow:
    0 0 0 1px rgba(214, 151, 25, 0.7),
    0 0 0 4px rgba(214, 151, 25, 0.13);
}

.html-preview :deep(.inpatient-emr-field--readonly) {
  cursor: default;
}

.html-preview :deep(.tag-marker) {
  opacity: 0.48;
}

.writeback-status {
  margin-left: auto;
  max-width: 420px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #5f6f76;
  background: #edf2f3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writeback-status.is-success {
  color: #0b7d58;
  background: #e5f7ee;
}

.writeback-status.is-error {
  color: #b64e1d;
  background: #fff1e9;
}

.writeback-status.is-pending {
  color: #1265a8;
  background: #e8f4ff;
}

.regenerate-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 31, 37, 0.28);
  backdrop-filter: blur(7px);
}

.regenerate-dialog {
  width: min(640px, 100%);
  display: grid;
  gap: 14px;
  border-radius: 8px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(101, 125, 134, 0.22);
  box-shadow: 0 26px 70px rgba(12, 28, 34, 0.22);
}

.regenerate-head,
.voice-row,
.regenerate-footer,
.supplement-error {
  display: flex;
  align-items: center;
}

.regenerate-head {
  justify-content: space-between;
  gap: 12px;
}

.regenerate-head div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.regenerate-head span {
  color: #0d8b77;
  font-size: 12px;
  font-weight: 800;
}

.regenerate-head strong {
  color: #1c3138;
  font-size: 18px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: #52666e;
  background: #f2f6f7;
  cursor: pointer;
}

.icon-btn:hover {
  background: #e8eef0;
}

.supplement-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.supplement-presets button {
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  color: #176f62;
  background: #edf8f5;
  border: 1px solid rgba(15, 143, 123, 0.18);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.supplement-presets button:hover {
  background: #e0f3ee;
}

.supplement-input {
  width: 100%;
  min-height: 168px;
  resize: vertical;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(102, 124, 133, 0.28);
  background: #fbfcfc;
  color: #1d2b32;
  font: inherit;
  line-height: 1.6;
  outline: none;
}

.supplement-input:focus {
  border-color: rgba(15, 143, 123, 0.62);
  box-shadow: 0 0 0 4px rgba(15, 143, 123, 0.11);
}

.voice-row {
  gap: 10px;
  min-height: 32px;
  flex-wrap: wrap;
}

.voice-btn,
.clear-supplement-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border-radius: 7px;
  color: #27515c;
  background: #ffffff;
  border: 1px solid rgba(99, 121, 129, 0.24);
  cursor: pointer;
}

.voice-btn.is-recording {
  color: #b43d2e;
  background: #fff1ee;
  border-color: rgba(180, 61, 46, 0.26);
}

.voice-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.clear-supplement-btn {
  color: #52666e;
  background: #f5f8f9;
}

.clear-supplement-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-status {
  color: #65777f;
  font-size: 12px;
}

.capture-visualizer {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 9px 11px;
  border-radius: 8px;
  background: #f3fbf8;
  border: 1px solid rgba(15, 143, 123, 0.16);
}

.recording-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e24b3b;
  box-shadow: 0 0 0 0 rgba(226, 75, 59, 0.34);
  animation: recordPulse 1.2s ease-in-out infinite;
}

.capture-visualizer.is-transcribing .recording-dot {
  background: #1976c9;
  animation: pulse 1.4s ease-in-out infinite;
}

.meter-bars {
  height: 34px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.meter-bars span {
  width: 4px;
  min-width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #16a084, #57c7b1);
  transition: height 0.08s ease, opacity 0.08s ease;
}

.capture-visualizer.is-transcribing .meter-bars span {
  height: 12px !important;
  opacity: 0.4 !important;
  animation: transcribingBars 1s ease-in-out infinite;
}

.capture-visualizer.is-transcribing .meter-bars span:nth-child(2n) {
  animation-delay: 0.12s;
}

.capture-visualizer.is-transcribing .meter-bars span:nth-child(3n) {
  animation-delay: 0.24s;
}

.capture-visualizer strong {
  color: #24454d;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.supplement-error {
  gap: 7px;
  padding: 9px 10px;
  border-radius: 7px;
  color: #a94d22;
  background: #fff3ed;
  border: 1px solid rgba(217, 118, 67, 0.24);
  font-size: 12px;
}

.regenerate-footer {
  justify-content: flex-end;
  gap: 8px;
}

.spinning {
  animation: spin 1s linear infinite;
}

.pulse-icon {
  color: #0f8f7b;
  animation: pulse 1.7s ease-in-out infinite;
}

.html-preview.is-generating :deep(.inpatient-emr-field--ai) {
  pointer-events: none;
  user-select: none;
  opacity: 0.88;
  background: #fff8e5;
  animation: pulseBg 1.5s infinite ease-in-out;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.76; }
  50% { transform: scale(1.08); opacity: 1; }
}

@keyframes pulseBg {
  0%, 100% { background-color: #fff8e5; }
  50% { background-color: #ffeebf; }
}

@keyframes recordPulse {
  0%, 100% {
    transform: scale(0.92);
    box-shadow: 0 0 0 0 rgba(226, 75, 59, 0.34);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 0 6px rgba(226, 75, 59, 0);
  }
}

@keyframes transcribingBars {
  0%, 100% { transform: scaleY(0.7); }
  50% { transform: scaleY(1.35); }
}
</style>
