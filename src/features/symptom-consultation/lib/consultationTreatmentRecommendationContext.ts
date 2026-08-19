import type { Diagnosis } from '@/types/consultation';

export interface ConsultationTreatmentPatientProfile {
  patientName: string;
  gender: string;
  age: string;
}

export interface ConsultationTreatmentRecordContext {
  chiefComplaint: string;
  historyOfPresentIllness?: string;
  familyHistory?: string;
  tcmFourExaminations?: string;
}

export interface BuildConsultationTreatmentRecommendationContextInput {
  patient: ConsultationTreatmentPatientProfile;
  diagnosis: Pick<Diagnosis, 'name' | 'code'>;
  record: ConsultationTreatmentRecordContext;
}

export function buildConsultationTreatmentRecommendationContext(
  input: BuildConsultationTreatmentRecommendationContextInput,
) {
  const clinicalContext = [
    input.record.historyOfPresentIllness
      ? `现病史：${input.record.historyOfPresentIllness.trim()}`
      : '',
    input.record.familyHistory
      ? `家族史：${input.record.familyHistory.trim()}`
      : '',
    input.record.tcmFourExaminations
      ? `中医四诊：${input.record.tcmFourExaminations.trim()}`
      : '',
  ].filter(Boolean).join('\n');

  return {
    patientName: input.patient.patientName,
    gender: input.patient.gender,
    age: input.patient.age,
    diagnosisName: input.diagnosis.name,
    diagnosisCode: input.diagnosis.code || '',
    chiefComplaint: input.record.chiefComplaint,
    clinicalContext,
  };
}
