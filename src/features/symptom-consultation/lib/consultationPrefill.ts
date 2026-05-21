import type { Diagnosis } from '@/types/consultation';
import { readPatientText, type PatientTextSource } from './consultationPatientText';

export interface GeneratedRecordDraft {
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export interface GeneratedRecordPrefillPatch {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
}

export interface BuildGeneratedRecordPrefillPatchInput {
  patient?: PatientTextSource;
  currentRecord: GeneratedRecordDraft;
  force?: boolean;
}

export interface MatchedDiagnosisLike {
  id?: string;
  code?: string;
  name?: string;
}

export interface BuildDiagnosisPrefillInput {
  patient?: PatientTextSource;
  currentDiagnosis?: Diagnosis | null;
  matchedDiagnosis?: MatchedDiagnosisLike | null;
  force?: boolean;
}

export interface DiagnosisPrefillResult {
  shouldApply: boolean;
  diagnosis?: Diagnosis;
}

export function buildGeneratedRecordPrefillPatch(
  input: BuildGeneratedRecordPrefillPatchInput,
): GeneratedRecordPrefillPatch | null {
  const chiefComplaint = readPatientText(input.patient, [
    'chiefComplaint',
    'chief_complaint',
  ]);
  const historyOfPresentIllness = readPatientText(input.patient, [
    'historyOfPresentIllness',
    'history_of_present_illness',
  ]);

  if (!chiefComplaint || !historyOfPresentIllness) {
    return null;
  }

  const patch: GeneratedRecordPrefillPatch = {};
  if (input.force || !input.currentRecord.chiefComplaint.trim()) {
    patch.chiefComplaint = chiefComplaint;
  }
  if (input.force || !input.currentRecord.historyOfPresentIllness.trim()) {
    patch.historyOfPresentIllness = historyOfPresentIllness;
  }

  return Object.keys(patch).length > 0 ? patch : {};
}

export function buildDiagnosisPrefill(input: BuildDiagnosisPrefillInput): DiagnosisPrefillResult {
  const diagnosisName = readPatientText(input.patient, ['diagnosis']);
  if (!diagnosisName) {
    return { shouldApply: false };
  }

  if (
    !input.force
    && input.currentDiagnosis
    && input.currentDiagnosis.name.trim() !== ''
  ) {
    return { shouldApply: true };
  }

  const matched = input.matchedDiagnosis;
  return {
    shouldApply: true,
    diagnosis: {
      id: matched?.id,
      code: matched?.code || '',
      name: matched?.name || diagnosisName,
      rate: 'PHIS 当前诊断',
      rationale: matched
        ? '来自 PHIS 当前诊断草稿，已匹配标准诊断库'
        : '来自 PHIS 当前诊断草稿，未匹配标准诊断库，回写前需切换为标准诊断',
    } as Diagnosis,
  };
}
