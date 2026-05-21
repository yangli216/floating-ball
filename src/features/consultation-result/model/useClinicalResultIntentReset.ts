import type { Ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';

export interface ClinicalResultIntentRecordInput {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  familyHistory?: string;
}

export interface ClinicalResultIntentResetRecordSnapshot {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  familyHistory: string;
}

export interface ClinicalResultIntentResetOptions {
  suppressDiagnosisTreatmentRefetch: Ref<boolean>;
  lastTreatmentDiagnosisKey: Ref<string>;
  chiefComplaint: Ref<string>;
  historyOfPresentIllness: Ref<string>;
  pastMedicalHistory: Ref<string>;
  familyHistory: Ref<string>;
  diagnoses: Ref<Diagnosis[]>;
  treatments: Ref<TreatmentRecommendation[]>;
  resetTreatmentEditorState: () => void;
  closeRelatedDropdown: () => void;
  closeManualMatch: () => void;
  closeRecommendationFeedback: () => void;
  closeSessionFeedback: () => void;
  resetWritebackState: () => void;
  resetDiagnosisSelection: () => void;
  resetFirstUserLogSnapshot: () => void;
  setInitialRecordSnapshot: (snapshot: ClinicalResultIntentResetRecordSnapshot) => void;
}

function buildRecordSnapshot(input: ClinicalResultIntentRecordInput): ClinicalResultIntentResetRecordSnapshot {
  return {
    chiefComplaint: input.chiefComplaint || '',
    historyOfPresentIllness: input.historyOfPresentIllness || '',
    pastMedicalHistory: input.pastMedicalHistory || '',
    familyHistory: input.familyHistory || '',
  };
}

export function useClinicalResultIntentReset(options: ClinicalResultIntentResetOptions) {
  function resetForIntent(input: ClinicalResultIntentRecordInput): void {
    options.suppressDiagnosisTreatmentRefetch.value = true;

    options.resetTreatmentEditorState();
    options.lastTreatmentDiagnosisKey.value = '';
    options.closeRelatedDropdown();
    options.closeManualMatch();
    options.closeRecommendationFeedback();
    options.closeSessionFeedback();
    options.resetWritebackState();
    options.diagnoses.value = [];
    options.resetDiagnosisSelection();
    options.treatments.value = [];
    options.resetFirstUserLogSnapshot();

    const snapshot = buildRecordSnapshot(input);
    options.setInitialRecordSnapshot(snapshot);
    options.chiefComplaint.value = input.chiefComplaint || '';
    options.historyOfPresentIllness.value = input.historyOfPresentIllness || '';
    options.pastMedicalHistory.value = input.pastMedicalHistory || '';
    options.familyHistory.value = input.familyHistory || '';
  }

  return {
    resetForIntent,
  };
}

export type ClinicalResultIntentReset = ReturnType<typeof useClinicalResultIntentReset>;
