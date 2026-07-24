import type { ChronicDiseaseType } from '../types';

export type FollowUpPresentationMode = 'hypertension' | 'type2_diabetes' | 'combined';

export interface FollowUpPresentation {
  mode: FollowUpPresentationMode;
  diseaseTypes: ChronicDiseaseType[];
  hasHypertension: boolean;
  hasDiabetes: boolean;
  label: string;
}

const DISEASE_ORDER: ChronicDiseaseType[] = ['hypertension', 'type2_diabetes'];

export function buildFollowUpPresentation(
  diseaseTypes: readonly ChronicDiseaseType[],
): FollowUpPresentation {
  const selected = new Set(diseaseTypes);
  const normalized = DISEASE_ORDER.filter((diseaseType) => selected.has(diseaseType));
  const hasHypertension = normalized.includes('hypertension');
  const hasDiabetes = normalized.includes('type2_diabetes');
  const mode: FollowUpPresentationMode = hasHypertension && hasDiabetes
    ? 'combined'
    : hasDiabetes
      ? 'type2_diabetes'
      : 'hypertension';

  return {
    mode,
    diseaseTypes: normalized,
    hasHypertension,
    hasDiabetes,
    label: mode === 'combined'
      ? '高血压 + 2 型糖尿病联合随访'
      : mode === 'type2_diabetes'
        ? '2 型糖尿病随访'
        : '高血压随访',
  };
}
