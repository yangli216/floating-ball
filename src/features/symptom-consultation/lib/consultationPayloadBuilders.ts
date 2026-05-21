import type {
  ConsultationUserLogSnapshot,
} from '@services/consultationUserLog';
import {
  buildConsultationUserLogSnapshot,
} from '@services/consultationUserLog';
import type { Diagnosis, Patient, TreatmentRecommendation } from '@/types/consultation';
import { readPatientText } from './consultationPatientText';

export type IncludedTreatmentType = 'medicine' | 'exam' | 'lab_test' | 'procedure';

export interface BuildCurrentMedicalPayloadOptions {
  includeDiagnosis?: boolean;
  includeTreatments?: boolean;
  includedTreatmentTypes?: IncludedTreatmentType[];
}

export interface BuildCurrentDiagnosisListInput {
  selectedDiagnosis?: Diagnosis | null;
  patient?: Patient | Record<string, unknown> | null;
}

export interface BuildCurrentMedicalPayloadInput {
  consultationId: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  selectedDiagnosis?: Diagnosis | null;
  patient?: Patient | Record<string, unknown> | null;
  medicines: TreatmentRecommendation[];
  examinations: TreatmentRecommendation[];
  labTests: TreatmentRecommendation[];
  procedures: TreatmentRecommendation[];
  resolveMedicalItemClientId: (item: TreatmentRecommendation) => string;
  extra?: Record<string, unknown>;
  options?: BuildCurrentMedicalPayloadOptions;
  timestamp?: number;
}

export interface BuildSmartUserLogSnapshotInput {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  diagnoses: Diagnosis[];
  selectedDiagnosis?: Diagnosis | null;
  medicines: TreatmentRecommendation[];
  examinations: TreatmentRecommendation[];
  labTests: TreatmentRecommendation[];
}

export function buildCurrentSummary(
  chiefComplaint: string,
  historyOfPresentIllness: string,
  diagnoses: Array<{ name: string }>,
): string {
  const lines = [
    chiefComplaint ? `主诉：${chiefComplaint}` : '',
    historyOfPresentIllness ? `现病史：${historyOfPresentIllness}` : '',
    diagnoses.length ? `诊断：${diagnoses.map((item) => item.name).join('；')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildCurrentDiagnosisList(
  input: BuildCurrentDiagnosisListInput,
): Array<{ name: string; code?: string; isTCM?: boolean }> {
  if (input.selectedDiagnosis) {
    return [
      {
        name: input.selectedDiagnosis.name,
        code: input.selectedDiagnosis.code,
        isTCM: input.selectedDiagnosis.isTCM,
      },
    ];
  }

  const diagnosisName = readPatientText(
    input.patient as Record<string, unknown> | null | undefined,
    ['diagnosis'],
  );
  return diagnosisName ? [{ name: diagnosisName }] : [];
}

export function buildCurrentMedicalPayload(input: BuildCurrentMedicalPayloadInput) {
  const options = input.options || {};
  const includeDiagnosis = options.includeDiagnosis ?? true;
  const includeTreatments = options.includeTreatments ?? true;
  const includedTreatmentTypes = options.includedTreatmentTypes;
  const shouldIncludeTreatmentType = (type: IncludedTreatmentType) =>
    includeTreatments && (!includedTreatmentTypes || includedTreatmentTypes.includes(type));

  const diagnosisList = includeDiagnosis
    ? buildCurrentDiagnosisList({
        selectedDiagnosis: input.selectedDiagnosis,
        patient: input.patient,
      })
    : [];

  const medications = shouldIncludeTreatmentType('medicine')
    ? input.medicines
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          spec: item.matchedItem?.spec,
          usage: item.usage,
          idMedPro: item.matchedItem?.id,
        }))
    : [];

  const examinations = shouldIncludeTreatmentType('exam')
    ? input.examinations
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: input.resolveMedicalItemClientId(item),
        }))
    : [];

  const labTests = shouldIncludeTreatmentType('lab_test')
    ? input.labTests
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: input.resolveMedicalItemClientId(item),
        }))
    : [];

  const procedures = shouldIncludeTreatmentType('procedure')
    ? input.procedures
        .filter((item) => item.selected)
        .map((item) => ({
          name: item.name,
          idCli: input.resolveMedicalItemClientId(item),
        }))
    : [];

  const treatmentPlanParts = [
    medications.length ? `建议用药：${medications.map((item) => item.name).join('；')}` : '',
    examinations.length ? `建议检查：${examinations.map((item) => item.name).join('；')}` : '',
    labTests.length ? `建议检验：${labTests.map((item) => item.name).join('；')}` : '',
    procedures.length ? `建议处置：${procedures.map((item) => item.name).join('；')}` : '',
  ].filter(Boolean);

  return {
    consultationId: input.consultationId,
    timestamp: input.timestamp ?? Date.now(),
    resultType: 'draft',
    chiefComplaint: input.chiefComplaint,
    historyOfPresentIllness: input.historyOfPresentIllness,
    pastMedicalHistory: input.pastMedicalHistory,
    diagnosisList,
    medications,
    examinations,
    labTests,
    procedures,
    treatmentPlan: treatmentPlanParts.length > 0
      ? treatmentPlanParts.join('；')
      : '建议结合医生站规则完成最终确认。',
    medicalSummary: buildCurrentSummary(
      input.chiefComplaint,
      input.historyOfPresentIllness,
      diagnosisList,
    ),
    ...(input.extra || {}),
  };
}

export function buildSmartUserLogSnapshot(
  input: BuildSmartUserLogSnapshotInput,
): ConsultationUserLogSnapshot {
  return buildConsultationUserLogSnapshot({
    chiefComplaint: input.chiefComplaint,
    historyOfPresentIllness: input.historyOfPresentIllness,
    diagnoses: input.diagnoses,
    selectedDiagnosis: input.selectedDiagnosis,
    medicines: input.medicines,
    examinations: input.examinations,
    labTests: input.labTests,
  });
}
