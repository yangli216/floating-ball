<script setup lang="ts">
import { computed } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { ConsultationResultPage } from '@features/consultation-result';
import { buildSymptomClinicalResultInput } from '@features/clinical-result';

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
  consultationRoundId?: string | null;
  secondaryFooterActionText?: string;
  secondaryFooterActionDisabled?: boolean;
}>(), {
  selectedDiagnosis: null,
  consultationRoundId: null,
  secondaryFooterActionText: '',
  secondaryFooterActionDisabled: false,
});

const emit = defineEmits(['close', 'cancel', 'secondary-footer-action']);

const resolvedSecondaryFooterActionText = computed(() => props.secondaryFooterActionText || '返回');

function handleSecondaryFooterAction(): void {
  emit('secondary-footer-action');
}

const clinicalResultInput = computed(() => buildSymptomClinicalResultInput({
  patient: props.initialPatientData,
  record: props.generatedRecord,
  diagnoses: props.diagnoses,
  selectedDiagnosis: props.selectedDiagnosis,
  treatments: [
    ...props.medicines,
    ...props.examinations,
    ...props.labTests,
    ...props.procedures,
  ],
}));

</script>

<template>
  <ConsultationResultPage
    :initial-patient-data="props.initialPatientData"
    :intent-result="clinicalResultInput"
    channel="symptom"
    :consultation-round-id="props.consultationRoundId"
    :secondary-footer-action-text="resolvedSecondaryFooterActionText"
    :secondary-footer-action-disabled="props.secondaryFooterActionDisabled"
    @close="emit('close')"
    @cancel="emit('cancel')"
    @secondary-footer-action="handleSecondaryFooterAction"
  />
</template>
