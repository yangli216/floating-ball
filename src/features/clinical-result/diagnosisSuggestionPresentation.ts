import type { Diagnosis } from '@/types/consultation';

export interface DiagnosisSuggestionSections {
  formal: Diagnosis[];
  differential: Diagnosis[];
}

export function parseDiagnosisMatchRate(rate: string | undefined): number | null {
  const match = (rate || '').match(/(\d+(?:\.\d+)?)\s*%/u);
  if (match) return Number.parseFloat(match[1]);
  if (/高置信|较高/u.test(rate || '')) return 80;
  if (/中置信|中等/u.test(rate || '')) return 65;
  if (/低置信|较低/u.test(rate || '')) return 45;
  return null;
}

function shouldBeDifferential(diagnosis: Diagnosis): boolean {
  if (diagnosis.suggestionType === 'differential') return true;
  const rate = parseDiagnosisMatchRate(diagnosis.rate);
  if (rate !== null && rate < 60) return true;
  if (/待排|待鉴别|需排除|不能确诊|证据不足|信息不足|需进一步|需补充|缺乏.*证据/u.test(
    `${diagnosis.name} ${diagnosis.rationale}`,
  )) return true;
  return false;
}

export function buildDiagnosisSuggestionSections(
  diagnoses: readonly Diagnosis[],
  maxFormal = 3,
): DiagnosisSuggestionSections {
  const sorted = [...diagnoses].sort((left, right) => (
    (parseDiagnosisMatchRate(right.rate) ?? -1) - (parseDiagnosisMatchRate(left.rate) ?? -1)
  ));
  const formalCandidates: Diagnosis[] = [];
  const differential: Diagnosis[] = [];

  for (const diagnosis of sorted) {
    if (shouldBeDifferential(diagnosis)) {
      differential.push(diagnosis);
    } else {
      formalCandidates.push(diagnosis);
    }
  }

  return {
    formal: formalCandidates.slice(0, Math.max(0, maxFormal)),
    differential,
  };
}
