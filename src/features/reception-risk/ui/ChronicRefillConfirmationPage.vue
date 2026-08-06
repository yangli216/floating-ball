<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { audioRecorder, getMicrophoneErrorMessage } from '@/services/audioRecorder';
import { transcribeSpeech } from '@/services/aliyunSpeech';
import { trackClick } from '@/services/operationTracker';
import type { AppPatient } from '@/types/appState';
import type { ClinicalResultInput } from '@features/clinical-result';
import { getPatientContextName } from '@/utils/patientContext';
import { generateChronicRefillConfirmationPlan } from '../api/chronicRefillConfirmation';
import { generateChronicRefillRecord } from '../api/chronicRefillRecord';
import { useChronicRefillConfirmation } from '../model/useChronicRefillConfirmation';
import type {
  ChronicRefillCandidate,
  ChronicRefillConditionOption,
} from '../lib/chronicRefillAssessment';

const props = defineProps<{
  patient: AppPatient;
  candidate: ChronicRefillCandidate;
}>();

const emit = defineEmits<{
  close: [];
  generated: [result: ClinicalResultInput];
}>();

const confirmation = useChronicRefillConfirmation({
  patient: props.patient,
  candidate: props.candidate,
  generatePlan: generateChronicRefillConfirmationPlan,
  generateRecord: generateChronicRefillRecord,
  startRecording: () => audioRecorder.start(),
  stopRecording: () => audioRecorder.stop(),
  transcribe: transcribeSpeech,
  getRecordingErrorMessage: getMicrophoneErrorMessage,
});

const patientName = computed(() => getPatientContextName(props.patient) || '当前患者');

function confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') return '明确依据';
  if (confidence === 'medium') return '历史推荐';
  return '需确认';
}

function formatSeconds(seconds: number): string {
  const minute = Math.floor(seconds / 60).toString().padStart(2, '0');
  const second = (seconds % 60).toString().padStart(2, '0');
  return `${minute}:${second}`;
}

async function handleGenerate(): Promise<void> {
  trackClick('chronic_refill_confirmation_generate', {
    itemCount: confirmation.plan.value?.items.length || 0,
    hasSupplement: Boolean(confirmation.supplementText.value.trim()),
  });
  const result = await confirmation.generateRecord();
  if (result) emit('generated', result);
}

async function handleClose(): Promise<void> {
  await confirmation.discardRecording();
  emit('close');
}

function conditionStatus(condition: ChronicRefillConditionOption): string {
  if (condition.medicationEvidenceScope === 'shared') return '同次多病种处方，需合并确认';
  return condition.hasMedicationEvidence ? '有历史用药参考' : '暂无历史用药参考';
}

onMounted(() => {
  trackClick('chronic_refill_confirmation_open', {
    diagnosisCount: props.candidate.diagnoses.length,
  });
  if (confirmation.conditionOptions.length === 1) {
    void confirmation.confirmConditions();
  }
});

onBeforeUnmount(() => {
  void confirmation.discardRecording();
});
</script>

<template>
  <section class="refill-confirmation-page" aria-labelledby="refill-confirmation-heading">
    <header class="context-header">
      <div class="context-icon" aria-hidden="true">
        <Icon icon="mdi:pill" size="22" />
      </div>
      <div class="context-copy">
        <h1 id="refill-confirmation-heading">确认本次复诊信息</h1>
        <p>{{ patientName }} · {{ candidate.diagnoses.join('、') }}</p>
      </div>
      <div class="context-badge">生成前确认</div>
    </header>

    <div class="page-body">
      <section class="condition-card" aria-labelledby="condition-heading">
        <div class="condition-heading-row">
          <div>
            <h2 id="condition-heading">确认本次复诊慢病</h2>
            <p>可多选；病历、诊断和用药将只基于已选慢病生成。</p>
          </div>
          <button
            v-if="confirmation.conditionsConfirmed.value"
            type="button"
            class="text-button"
            :disabled="confirmation.isBusy.value"
            @click="confirmation.resetConditions"
          >
            <Icon icon="lucide:pencil" size="14" />
            重新选择
          </button>
        </div>

        <div class="condition-grid" role="group" aria-label="本次复诊慢病类型">
          <button
            v-for="condition in confirmation.conditionOptions"
            :key="condition.id"
            type="button"
            :class="[
              'condition-option',
              {
                selected: confirmation.selectedConditionIds.value.includes(condition.id),
                locked: confirmation.conditionsConfirmed.value,
              },
            ]"
            role="checkbox"
            :aria-checked="confirmation.selectedConditionIds.value.includes(condition.id)"
            :disabled="confirmation.conditionsConfirmed.value"
            @click="confirmation.toggleCondition(condition.id)"
          >
            <span class="condition-check" aria-hidden="true">
              <Icon
                :icon="confirmation.selectedConditionIds.value.includes(condition.id) ? 'lucide:check' : 'lucide:plus'"
                size="14"
              />
            </span>
            <span class="condition-copy">
              <strong>{{ condition.diagnosis }}</strong>
              <small>
                {{ condition.diagnosisGroup !== condition.diagnosis ? `${condition.diagnosisGroup} · ` : '' }}{{ conditionStatus(condition) }}
              </small>
            </span>
          </button>
        </div>

        <div v-if="!confirmation.conditionsConfirmed.value" class="condition-actions">
          <span v-if="confirmation.conditionOptions.length > 1">请根据本次就诊目的选择，不必勾选患者所有慢病。</span>
          <span v-else>已识别到单一慢病，正在生成确认项。</span>
          <button
            v-if="confirmation.conditionOptions.length > 1"
            type="button"
            class="confirm-condition-button"
            :disabled="!confirmation.canConfirmConditions.value"
            @click="confirmation.confirmConditions"
          >
            <Icon icon="lucide:arrow-right" size="15" />
            确认慢病并继续
          </button>
        </div>
      </section>

      <div v-if="confirmation.conditionsConfirmed.value" class="intro-row">
        <div>
          <strong>{{ confirmation.plan.value?.summary || '正在结合历史病历生成最少确认项' }}</strong>
          <p>推荐项已预选；点击生成即表示本次问诊已确认当前选择。</p>
        </div>
        <button
          v-if="confirmation.plan.value"
          type="button"
          class="text-button"
          :disabled="confirmation.isBusy.value"
          @click="confirmation.applyRecommended"
        >
          <Icon icon="lucide:rotate-ccw" size="15" />
          恢复推荐
        </button>
      </div>

      <div v-if="confirmation.loadingPlan.value && !confirmation.plan.value" class="loading-state">
        <Icon icon="lucide:loader-circle" size="24" class="spin" />
        <span>正在分析历史病历与用药信息…</span>
      </div>

      <div v-else-if="confirmation.plan.value" class="confirmation-list">
        <article
          v-for="(item, index) in confirmation.plan.value.items"
          :key="item.id"
          class="confirmation-card"
        >
          <div class="question-row">
            <span class="question-index">{{ index + 1 }}</span>
            <div class="question-copy">
              <div class="question-title-row">
                <h2>{{ item.question }}</h2>
                <span :class="['confidence-tag', `is-${item.confidence}`]">
                  {{ confidenceLabel(item.confidence) }}
                </span>
              </div>
              <p v-if="item.description">{{ item.description }}</p>
              <small>{{ item.basis }}</small>
            </div>
          </div>

          <div class="option-grid" role="radiogroup" :aria-label="item.question">
            <button
              v-for="option in item.options"
              :key="option.value"
              type="button"
              :class="[
                'option-button',
                {
                  selected: confirmation.selections.value[item.id] === option.value,
                  recommended: item.recommendedValue === option.value,
                },
              ]"
              role="radio"
              :aria-checked="confirmation.selections.value[item.id] === option.value"
              @click="confirmation.selectOption(item.id, option.value)"
            >
              <span>{{ option.label }}</span>
              <span v-if="item.recommendedValue === option.value" class="recommend-mark">推荐</span>
            </button>
          </div>
        </article>
      </div>

      <section v-if="confirmation.plan.value" class="supplement-card" aria-labelledby="supplement-heading">
        <div class="supplement-heading-row">
          <div>
            <h2 id="supplement-heading">补充本次问诊信息</h2>
            <p>可输入或录音，作为医生补充说明直接用于生成病历，不会改动上方确认项。</p>
          </div>
          <button
            type="button"
            :class="['voice-button', { recording: confirmation.isRecording.value }]"
            :disabled="confirmation.isBusy.value && !confirmation.isRecording.value"
            @click="confirmation.toggleVoiceSupplement"
          >
            <Icon :icon="confirmation.isRecording.value ? 'lucide:square' : 'lucide:mic'" size="16" />
            {{ confirmation.isRecording.value
              ? `结束录音 ${formatSeconds(confirmation.recordingSeconds.value)}`
              : confirmation.isTranscribing.value ? '正在转写' : '语音补充' }}
          </button>
        </div>

        <textarea
          v-model="confirmation.supplementText.value"
          rows="3"
          :disabled="confirmation.isRecording.value || confirmation.isTranscribing.value"
          placeholder="补充当前实际服药、控制情况、监测结果、不适或药物反应…"
        />
        <div class="supplement-actions">
          <span>生成时会压缩为简洁临床叙事，不会原样复制冗余口语或药品包装信息。</span>
        </div>
      </section>

      <div v-if="confirmation.errorMessage.value" class="error-banner" role="alert">
        <Icon icon="lucide:circle-alert" size="16" />
        <span>{{ confirmation.errorMessage.value }}</span>
      </div>
    </div>

    <footer class="page-footer">
      <button type="button" class="secondary-button" :disabled="confirmation.isBusy.value" @click="handleClose">
        返回接诊
      </button>
      <button
        type="button"
        class="primary-button"
        :disabled="!confirmation.canGenerate.value"
        @click="handleGenerate"
      >
        <Icon v-if="confirmation.generatingRecord.value" icon="lucide:loader-circle" size="17" class="spin" />
        <Icon v-else icon="lucide:file-check-2" size="17" />
        {{ confirmation.generatingRecord.value
          ? '正在生成病历'
          : confirmation.conditionsConfirmed.value ? '按当前选择生成病历' : '请先确认慢病类型' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.refill-confirmation-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #1e293b;
  background: #f6f8fb;
}

.context-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 18px 22px 15px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.context-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #2563eb;
  background: #eff6ff;
}

.context-copy { flex: 1; min-width: 0; }
.context-copy h1 { margin: 0; font-size: 17px; line-height: 1.35; }
.context-copy p { margin: 3px 0 0; color: #64748b; font-size: 13px; }
.context-badge {
  padding: 5px 9px;
  border-radius: 999px;
  color: #1d4ed8;
  background: #dbeafe;
  font-size: 12px;
  font-weight: 600;
}

.page-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px 22px 20px;
}

.intro-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.condition-card {
  padding: 14px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.035);
}
.condition-heading-row,
.condition-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.condition-heading-row h2 { margin: 0; font-size: 14px; }
.condition-heading-row p { margin: 4px 0 0; color: #64748b; font-size: 11px; }
.condition-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.condition-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  color: #334155;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.condition-option:hover:not(:disabled) { border-color: #93c5fd; background: #f8fbff; }
.condition-option.selected { border-color: #3b82f6; background: #eff6ff; }
.condition-option.locked:not(.selected) { display: none; }
.condition-check {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  color: #64748b;
  background: #f1f5f9;
}
.condition-option.selected .condition-check { color: #fff; background: #2563eb; }
.condition-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.condition-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.condition-copy small { color: #64748b; font-size: 10px; }
.condition-actions { margin-top: 11px; }
.condition-actions > span { color: #64748b; font-size: 11px; }
.confirm-condition-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 11px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: #2563eb;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
}
.confirm-condition-button:disabled { cursor: not-allowed; opacity: 0.5; }
.intro-row strong { font-size: 14px; }
.intro-row p { margin: 4px 0 0; color: #64748b; font-size: 12px; }

.text-button,
.voice-button,
.secondary-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  cursor: pointer;
  font: inherit;
}
.text-button {
  flex: none;
  padding: 5px 8px;
  color: #2563eb;
  background: transparent;
  font-size: 12px;
}

.loading-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #64748b;
  font-size: 14px;
}

.confirmation-list { display: flex; flex-direction: column; gap: 10px; }
.confirmation-card,
.supplement-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.035);
}
.confirmation-card { padding: 13px 14px 14px; }
.question-row { display: flex; align-items: flex-start; gap: 10px; }
.question-index {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: #2563eb;
  background: #eff6ff;
  font-size: 12px;
  font-weight: 700;
}
.question-copy { flex: 1; min-width: 0; }
.question-title-row { display: flex; align-items: center; gap: 8px; }
.question-title-row h2 { margin: 1px 0 0; font-size: 14px; line-height: 1.4; }
.question-copy p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
.question-copy small { display: block; margin-top: 3px; color: #94a3b8; font-size: 11px; }
.confidence-tag {
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}
.confidence-tag.is-high { color: #047857; background: #d1fae5; }
.confidence-tag.is-medium { color: #1d4ed8; background: #dbeafe; }
.confidence-tag.is-low { color: #92400e; background: #fef3c7; }

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 11px;
  padding-left: 34px;
}
.option-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #dbe3ee;
  border-radius: 9px;
  color: #475569;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.option-button:hover { border-color: #93c5fd; background: #f8fbff; }
.option-button.selected { border-color: #3b82f6; color: #1d4ed8; background: #eff6ff; }
.recommend-mark {
  padding: 1px 5px;
  border-radius: 999px;
  color: #2563eb;
  background: #dbeafe;
  font-size: 9px;
  font-weight: 700;
}

.supplement-card { padding: 14px; }
.supplement-heading-row { display: flex; justify-content: space-between; gap: 12px; }
.supplement-heading-row h2 { margin: 0; font-size: 14px; }
.supplement-heading-row p { margin: 4px 0 0; color: #64748b; font-size: 11px; }
.voice-button {
  align-self: flex-start;
  min-width: 104px;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 9px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 12px;
}
.voice-button.recording { color: #b91c1c; background: #fee2e2; }
.supplement-card textarea {
  width: 100%;
  margin-top: 11px;
  resize: vertical;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  padding: 10px 11px;
  box-sizing: border-box;
  color: #1e293b;
  background: #fbfdff;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  outline: none;
}
.supplement-card textarea:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.supplement-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
.supplement-actions span { color: #94a3b8; font-size: 11px; }
.error-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid #fecaca;
  border-radius: 9px;
  color: #b91c1c;
  background: #fff1f2;
  font-size: 12px;
}

.page-footer {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 22px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.secondary-button,
.primary-button {
  min-height: 38px;
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
}
.secondary-button { border: 1px solid #dbe3ee; color: #475569; background: #fff; }
.primary-button { min-width: 176px; color: #fff; background: #2563eb; }
button:disabled { cursor: not-allowed; opacity: 0.55; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 700px) {
  .context-header, .page-body, .page-footer { padding-left: 14px; padding-right: 14px; }
  .option-grid { padding-left: 0; }
  .supplement-heading-row, .supplement-actions { align-items: stretch; flex-direction: column; }
  .voice-button { align-self: stretch; }
}
</style>
