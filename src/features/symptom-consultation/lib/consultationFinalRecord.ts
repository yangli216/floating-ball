import type {
  Diagnosis,
  FinalRecord,
  Patient,
  TreatmentRecommendation,
} from '@/types/consultation';
import { readPatientText } from './consultationPatientText';

export type ConsultationFinalRecordMode = 'western' | 'tcm';

export type FinalRecordTreatmentSnapshot = Pick<
  TreatmentRecommendation,
  'type' | 'name' | 'usage' | 'ingredients' | 'matchedItem' | 'reason'
>;

export interface GeneratedRecordSnapshot {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  tcmFourExaminations?: string;
  familyHistory?: string;
}

export interface BuildFinalRecordInput {
  patient: Patient;
  generatedRecord: GeneratedRecordSnapshot;
  diagnosis: Diagnosis;
  treatmentGroups: TreatmentRecommendation[][];
  mode: ConsultationFinalRecordMode;
  medicalAdvice?: string;
  date: string;
}

export function buildSelectedTreatmentSnapshots(
  treatmentGroups: TreatmentRecommendation[][],
): FinalRecordTreatmentSnapshot[] {
  return treatmentGroups
    .flat()
    .filter((treatment) => treatment.selected)
    .map((treatment) => ({
      type: treatment.type,
      name: treatment.name,
      usage: treatment.usage,
      ingredients: treatment.ingredients,
      matchedItem: treatment.matchedItem,
      reason: treatment.reason,
    }));
}

export function buildTreatmentPrinciple(
  mode: ConsultationFinalRecordMode,
  diagnosis: Diagnosis,
): string {
  if (mode === 'tcm' && diagnosis.treatment) {
    return diagnosis.treatment;
  }

  return '';
}

export function buildFinalRecord(input: BuildFinalRecordInput): FinalRecord {
  return {
    patient: input.patient,
    record: {
      ...input.generatedRecord,
      pastMedicalHistory:
        readPatientText(
          input.patient as unknown as Record<string, unknown>,
          ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText'],
        ) || '未提供既往病史。',
      allergyHistory: input.patient.allergyHistory || '无',
    },
    diagnosis: input.diagnosis,
    treatments: buildSelectedTreatmentSnapshots(input.treatmentGroups),
    date: input.date,
    treatmentPrinciple: buildTreatmentPrinciple(input.mode, input.diagnosis),
    medicalAdvice: input.medicalAdvice,
  };
}
