import type { Diagnosis } from '@/types/consultation';

export interface DiagnosisSwapItem {
  id?: string;
  code: string;
  name: string;
}

export interface RelatedDiagnosisCandidate {
  id?: string;
  code: string;
  name: string;
}

export interface ResolveRelatedDiagnosisCandidatesInput<
  TCandidate extends RelatedDiagnosisCandidate,
> {
  diagnosis: Diagnosis;
  getRelatedDiagnoses: (code: string) => TCandidate[];
  getRelatedTCMDiagnoses: (code: string) => TCandidate[];
}

export interface BuildDiagnosisSwapInput {
  diagnoses: Diagnosis[];
  selectedDiagnosis?: Diagnosis | null;
  originalDiagnosis: Diagnosis;
  replacement: DiagnosisSwapItem;
  getDiagnosisIdentity: (diagnosis: Diagnosis | null | undefined) => string;
}

export interface DiagnosisSwapResult {
  diagnoses: Diagnosis[];
  updatedDiagnosis?: Diagnosis;
  selectedDiagnosis?: Diagnosis | null;
  updated: boolean;
}

export function buildDiagnosisSwap(
  input: BuildDiagnosisSwapInput,
): DiagnosisSwapResult {
  const originalIdentity = input.getDiagnosisIdentity(input.originalDiagnosis);
  const index = input.diagnoses.findIndex(
    (diagnosis) => input.getDiagnosisIdentity(diagnosis) === originalIdentity,
  );

  if (index === -1) {
    return {
      diagnoses: input.diagnoses,
      selectedDiagnosis: input.selectedDiagnosis,
      updated: false,
    };
  }

  const updatedDiagnosis: Diagnosis = {
    ...input.diagnoses[index],
    id: input.replacement.id,
    code: input.replacement.code,
    name: input.replacement.name,
  };
  const diagnoses = [...input.diagnoses];
  diagnoses[index] = updatedDiagnosis;

  const shouldUpdateSelected =
    input.getDiagnosisIdentity(input.selectedDiagnosis) === originalIdentity;

  return {
    diagnoses,
    updatedDiagnosis,
    selectedDiagnosis: shouldUpdateSelected
      ? updatedDiagnosis
      : input.selectedDiagnosis,
    updated: true,
  };
}

export function resolveRelatedDiagnosisCandidates<
  TCandidate extends RelatedDiagnosisCandidate,
>(
  input: ResolveRelatedDiagnosisCandidatesInput<TCandidate>,
): TCandidate[] {
  if (!input.diagnosis.code) {
    return [];
  }

  const candidates = input.diagnosis.isTCM
    ? input.getRelatedTCMDiagnoses(input.diagnosis.code)
    : input.getRelatedDiagnoses(input.diagnosis.code);

  return candidates.filter((candidate) => candidate.code !== input.diagnosis.code);
}
