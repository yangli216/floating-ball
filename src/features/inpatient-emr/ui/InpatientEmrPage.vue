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
          @click="restart"
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

        <section class="summary-panel" v-if="result">
          <div class="section-heading">
            <Icon icon="lucide:user-round" :size="17" />
            <span>患者信息</span>
          </div>
          <dl class="summary-list">
            <div>
              <dt>姓名</dt>
              <dd>{{ patientName }}</dd>
            </div>
            <div>
              <dt>住院号</dt>
              <dd>{{ inpatientNo }}</dd>
            </div>
            <div>
              <dt>诊断</dt>
              <dd>{{ diagnosisText }}</dd>
            </div>
            <div>
              <dt>医嘱</dt>
              <dd>{{ orderCount }} 条</dd>
            </div>
            <div>
              <dt>体温单</dt>
              <dd>{{ temperatureCount }} 条</dd>
            </div>
          </dl>
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
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
const activeStep = computed(() => steps.value.find((step) => step.key === activeStepKey.value));
const activeStepLabel = computed(() => activeStep.value?.title || '准备生成');
const activeStepDetail = computed(() => activeStep.value?.detail || '正在整理住院病历上下文');
const aiFields = computed(() => result.value?.template.fields.filter((field) => field.aiSuitable) || []);

const patientName = computed(() => result.value?.context.registration?.name || '-');
const inpatientNo = computed(() => (
  result.value?.context.registration?.inpatientNo
  || result.value?.context.registration?.admissionNo
  || result.value?.request.admissionId
  || '-'
));
const diagnosisText = computed(() => {
  const registration = result.value?.context.registration;
  const diagnosis = registration?.diagnoses?.find((item) => item.isPrimary && item.name)
    || registration?.diagnoses?.find((item) => item.name);
  return diagnosis?.name || registration?.admissionDiagnosis || '-';
});
const orderCount = computed(() => result.value?.context.orders.length || 0);
const temperatureCount = computed(() => result.value?.context.temperatureChart?.records.length || 0);

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

function restart(): void {
  if (!props.request) return;
  void start(props.request);
}

function getFieldPrompt(field: InpatientEmrTemplateField): string {
  return buildInpatientEmrFieldPrompt(field);
}

function handlePreviewInput(event: Event): void {
  const target = event.target as HTMLElement | null;
  const editable = target?.closest?.('[data-inpatient-emr-field-id][contenteditable="true"]') as HTMLElement | null;
  const fieldId = editable?.dataset.inpatientEmrFieldId;
  if (!fieldId) return;
  updateFieldValue(fieldId, editable.textContent || '');
}
</script>

<style scoped>
.inpatient-emr-page {
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
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 1px solid rgba(116, 136, 145, 0.22);
  background: rgba(255, 255, 255, 0.78);
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 700;
  color: #0d8b77;
}

h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
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
  gap: 10px;
}

button {
  border: 0;
  font: inherit;
}

.ghost-btn,
.primary-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
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
.summary-panel,
.field-panel,
.html-preview-card,
.empty-panel {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(107, 128, 137, 0.18);
  box-shadow: 0 12px 28px rgba(23, 42, 49, 0.07);
}

.process-panel,
.summary-panel,
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

.summary-list {
  margin: 10px 0 0;
}

.summary-list div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(119, 135, 143, 0.1);
}

.summary-list div:last-child {
  border-bottom: 0;
}

dt {
  color: #6a7a80;
}

dd {
  margin: 0;
  color: #1d2b32;
  overflow-wrap: anywhere;
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
</style>
