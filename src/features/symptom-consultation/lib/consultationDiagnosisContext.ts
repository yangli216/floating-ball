export interface DiagnosisIdentitySource {
  code?: string;
  name?: string;
}

export interface StaleRecommendationContextInput {
  requestSeq: number;
  latestRequestSeq: number;
  expectedDiagnosisIdentity: string;
  currentDiagnosis?: DiagnosisIdentitySource | null;
}

export function getDiagnosisIdentity(
  diagnosis: DiagnosisIdentitySource | null | undefined,
): string {
  if (!diagnosis) return '';
  return `${diagnosis.code || ''}:${diagnosis.name || ''}`;
}

export function isCurrentDiagnosisContext(
  expectedIdentity: string,
  currentDiagnosis: DiagnosisIdentitySource | null | undefined,
): boolean {
  return expectedIdentity !== '' && expectedIdentity === getDiagnosisIdentity(currentDiagnosis);
}

export function isStaleRecommendationContext(
  input: StaleRecommendationContextInput,
): boolean {
  return (
    input.requestSeq !== input.latestRequestSeq
    || !isCurrentDiagnosisContext(input.expectedDiagnosisIdentity, input.currentDiagnosis)
  );
}
