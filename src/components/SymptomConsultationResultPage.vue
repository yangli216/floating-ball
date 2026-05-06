<script setup lang="ts">
import { computed, toRaw } from 'vue';
import ConsultationResultPage from './ConsultationResultPage.vue';
import type { AppPatient } from '../types/appState';
import type { Diagnosis, TreatmentRecommendation } from '../types/consultation';
import type { MatchedTreatment, VoiceIntentResult } from '../composables/useVoiceIntentRecognition';

interface SymptomGeneratedRecord {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  tcmFourExaminations?: string;
}

const props = withDefaults(defineProps<{
  initialPatientData?: AppPatient;
  generatedRecord: SymptomGeneratedRecord;
  diagnoses: Diagnosis[];
  selectedDiagnosis?: Diagnosis | null;
  medicines: TreatmentRecommendation[];
  examinations: TreatmentRecommendation[];
  labTests: TreatmentRecommendation[];
  procedures: TreatmentRecommendation[];
  secondaryFooterActionText?: string;
  secondaryFooterActionDisabled?: boolean;
}>(), {
  selectedDiagnosis: null,
  secondaryFooterActionText: '',
  secondaryFooterActionDisabled: false,
});

const emit = defineEmits(['close', 'cancel', 'secondary-footer-action']);

function cloneValue<T>(value: T): T {
  // structuredClone 无法处理 Vue 响应式 Proxy 及其内部的 matchedItem 等字段。
  // 先用 toRaw 剥离 Proxy，再用 JSON 序列化做深克隆，确保安全。
  try {
    return JSON.parse(JSON.stringify(toRaw(value))) as T;
  } catch {
    return value;
  }
}

function getDiagnosisKey(diag: Diagnosis | null | undefined): string {
  if (!diag) return '';
  return `${diag.id || ''}|${diag.code || ''}|${diag.name || ''}`;
}

function readPatientString(
  source: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return '';
}

const resolvedPastMedicalHistory = computed(() => {
  const patient = props.initialPatientData as unknown as Record<string, unknown> | undefined;
  return readPatientString(patient, ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText']);
});

const mergedHistoryOfPresentIllness = computed(() => {
  const history = (props.generatedRecord.historyOfPresentIllness || '').trim();
  const tcmFourExaminations = (props.generatedRecord.tcmFourExaminations || '').trim();
  if (!tcmFourExaminations) {
    return history;
  }
  return history ? `${history}\n\n中医四诊：${tcmFourExaminations}` : `中医四诊：${tcmFourExaminations}`;
});

const orderedDiagnoses = computed<Diagnosis[]>(() => {
  const seen = new Set<string>();
  const ordered: Diagnosis[] = [];
  for (const diag of [props.selectedDiagnosis, ...props.diagnoses]) {
    const key = getDiagnosisKey(diag);
    if (!diag || !key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(cloneValue(diag));
  }
  return ordered;
});

function mapTreatmentType(type: TreatmentRecommendation['type']): MatchedTreatment['type'] {
  if (type === 'exam') return 'examination';
  if (type === 'lab_test') return 'labTest';
  if (type === 'acupuncture') return 'procedure';
  return type;
}

const orderedTreatments = computed<MatchedTreatment[]>(() => cloneValue([
  ...props.medicines,
  ...props.examinations,
  ...props.labTests,
  ...props.procedures,
]).map((item) => ({
  type: mapTreatmentType(item.type),
  name: item.originalName || item.name,
  aliases: item.aliases || [],
  spec: item.spec || '',
  usage: item.route || item.usage || '',
  usageKey: item.routeKey || '',
  dosage: item.dosage || '',
  dosageUnit: item.dosageUnit || '',
  totalQty: item.totalQty || '',
  totalUnit: item.totalUnit || '',
  frequency: item.frequency || '',
  frequencyKey: item.frequencyKey || '',
  days: item.days || '',
  sourceType: item.sourceType || 'explicit',
  evidenceText: item.evidenceText || '',
  goal: item.goal || '',
  text: item.reason || '',
  targetDose: item.targetDose || '',
  targetDoseUnit: item.targetDoseUnit || '',
  matchedItem: item.matchedItem ? cloneValue(item.matchedItem) : undefined,
}))); 

const symptomIntentResult = computed<VoiceIntentResult>(() => ({
  chiefComplaint: props.generatedRecord.chiefComplaint || '',
  historyOfPresentIllness: mergedHistoryOfPresentIllness.value,
  pastMedicalHistory: resolvedPastMedicalHistory.value,
  allergyHistory: typeof props.initialPatientData?.allergyHistory === 'string' ? props.initialPatientData.allergyHistory : '',
  currentMedicationHistory: '',
  symptoms: [],
  negativeSymptoms: [],
  diagnoses: orderedDiagnoses.value,
  treatments: orderedTreatments.value,
  treatmentPlan: '',
  healthEducation: '',
}));
</script>

<template>
  <ConsultationResultPage
    :initial-patient-data="props.initialPatientData"
    :intent-result="symptomIntentResult"
    channel="symptom"
    :secondary-footer-action-text="props.secondaryFooterActionText"
    :secondary-footer-action-disabled="props.secondaryFooterActionDisabled"
    @close="emit('close')"
    @cancel="emit('cancel')"
    @secondary-footer-action="emit('secondary-footer-action')"
  />
</template>