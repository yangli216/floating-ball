<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { PROMPTS } from '@/prompts';
import { chat } from '@/services/llm';
import { trackFeatureUsage } from '@/services/featureUsageTracker';
import { medicalDataService } from '@/services/medicalData';
import { parseLLMJson } from '@features/clinical-result';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextAnchorId,
  getPatientContextName,
} from '@/utils/patientContext';
import { formatUserFacingError } from '@shared/lib/errorMessages';

interface ChecklistItem {
  question: string;
  recordText: string;
}

interface DiagnosisChecklistResponse {
  isNeeded?: boolean;
  items?: ChecklistItem[];
}

const props = defineProps<{
  patient: AppPatient | null;
}>();

const emit = defineEmits(['close']);

const showToast = inject<(msg: string, type?: string) => void>('showToast');

const isChecklistLoading = ref(false);
const checklistItems = ref<ChecklistItem[]>([]);
const hasRequested = ref(false);
const generationError = ref('');

const diagnosisName = computed(() => (
  props.patient?.diagnosis
  || props.patient?.clinical?.diagnosis
  || ''
).trim());
const chiefComplaint = computed(() => (
  props.patient?.chiefComplaint
  || props.patient?.clinical?.chiefComplaint
  || ''
).trim());
const historyOfPresentIllness = computed(() => (
  props.patient?.historyOfPresentIllness
  || props.patient?.clinical?.historyOfPresentIllness
  || ''
).trim());
const consultationId = computed(() => getPatientContextAnchorId(props.patient) || 'unknown');
const matchedDiagnosis = computed(() => medicalDataService.matchDiagnosis(diagnosisName.value));
const displayDiagnosisName = computed(() => matchedDiagnosis.value?.name || diagnosisName.value || '当前诊断');

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeChecklistItems(result: DiagnosisChecklistResponse): ChecklistItem[] {
  if (!result?.isNeeded || !Array.isArray(result.items)) {
    return [];
  }
  return result.items
    .map((item) => ({
      question: normalizeText(item?.question),
      recordText: normalizeText(item?.recordText),
    }))
    .filter((item) => item.question);
}

function trackDifferentialUsage(): void {
  trackFeatureUsage({
    featureCode: 'diagnosis_checklist',
    eventAction: 'open_differential_assist',
    idempotencyKey: `assist:differential:${consultationId.value}:${Date.now()}`,
    consultationId: consultationId.value,
    sourceModule: 'differential_diagnosis_modal',
    scene: 'consultation-assist-differential',
    payload: {
      diagnosisName: diagnosisName.value,
      diagnosisCode: matchedDiagnosis.value?.code,
      patientName: getPatientContextName(props.patient),
    },
  });
}

async function generateChecklist(): Promise<void> {
  if (isChecklistLoading.value) {
    return;
  }

  if (!diagnosisName.value || !chiefComplaint.value || !historyOfPresentIllness.value) {
    generationError.value = '当前缺少诊断、主诉或现病史，无法生成鉴别排查建议。';
    checklistItems.value = [];
    return;
  }

  isChecklistLoading.value = true;
  generationError.value = '';
  checklistItems.value = [];
  hasRequested.value = true;
  trackDifferentialUsage();

  try {
    const userPrompt = PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
      diagnosisName: displayDiagnosisName.value,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
    });

    const response = await chat([
      { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
      { role: 'user', content: userPrompt },
    ], undefined, undefined, undefined, {
      traceContext: {
        scene: 'standalone-differential-diagnosis-checklist',
        sourceModule: 'differential_diagnosis_modal',
        operationModule: 'consultation',
        operationAction: 'generate_diagnosis_checklist',
        title: '独立鉴别诊断生成鉴别排查建议',
      },
    });

    checklistItems.value = normalizeChecklistItems(parseLLMJson<DiagnosisChecklistResponse>(response));
    if (checklistItems.value.length === 0) {
      showToast?.('当前诊断暂无待确认的鉴别排查项。', 'info');
    }
  } catch (error: unknown) {
    checklistItems.value = [];
    generationError.value = formatUserFacingError(error, {
      context: '诊断鉴别生成失败',
      fallback: '请稍后重试。',
    });
    showToast?.(generationError.value, 'error');
  } finally {
    isChecklistLoading.value = false;
  }
}

watch(
  () => [diagnosisName.value, chiefComplaint.value, historyOfPresentIllness.value],
  () => {
    if (!hasRequested.value) {
      return;
    }
    void generateChecklist();
  },
);

onMounted(() => {
  void generateChecklist();
});
</script>

<template>
  <div class="voice-consultation-new differential-modal-page">
    <div class="confirm-overlay checklist-overlay differential-checklist-overlay" @click.self="emit('close')">
      <div class="checklist-dialog pane-card" role="dialog" aria-modal="true" aria-labelledby="standalone-checklist-title">
        <div class="checklist-dialog-head">
          <div>
            <p id="standalone-checklist-title" class="confirm-dialog-title">鉴别排查确认</p>
            <p class="checklist-dialog-subtitle">{{ displayDiagnosisName }}</p>
          </div>
          <button class="checklist-close-btn" type="button" aria-label="关闭" @click="emit('close')">
            <Icon icon="lucide:x" size="18" />
          </button>
        </div>

        <div v-if="isChecklistLoading" class="loading-inline checklist-loading">
          <div class="ai-spinner small">
            <div class="spinner-ring"></div>
            <div class="spinner-core"></div>
          </div>
          <span>正在生成鉴别排查建议...</span>
        </div>

        <div v-else-if="generationError" class="standalone-checklist-error">
          {{ generationError }}
        </div>

        <div v-else-if="checklistItems.length > 0" class="checklist-dialog-body">
          <p class="checklist-intro">
            为防止与高危急症混淆或漏诊，系统建议进一步确认以下指征：
          </p>
          <div class="checklist-items">
            <div v-for="(item, index) in checklistItems" :key="`${index}-${item.question}`" class="checklist-item-label">
              <span class="checklist-text">{{ item.question }}</span>
              <span v-if="item.recordText" class="checklist-record-text">{{ item.recordText }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-text checklist-empty">当前诊断暂无待确认的鉴别排查项。</div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../../consultation-result/ui/ClinicalResultEditor.css"></style>

<style scoped>
.differential-modal-page {
  min-height: 100%;
  background: transparent;
}

.differential-checklist-overlay {
  position: absolute;
}

.standalone-checklist-error {
  padding: 12px 14px;
  border: 1px solid rgba(207, 74, 60, 0.24);
  border-radius: 12px;
  background: var(--voice-danger-soft);
  color: var(--voice-danger);
  line-height: 1.6;
}
</style>
