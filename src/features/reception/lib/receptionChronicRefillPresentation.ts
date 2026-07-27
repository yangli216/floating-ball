import type { ChronicRefillCandidate } from '@features/reception-risk';

export interface ReceptionChronicRefillPresentation {
  available: boolean;
  sectionSummary: string;
  title: string;
  medicationStatus: string;
}

function uniqueNonEmpty(values: string[] | undefined): string[] {
  return Array.from(new Set(
    (values || [])
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

export function buildReceptionChronicRefillPresentation(
  candidate: ChronicRefillCandidate | null | undefined,
  generating = false,
): ReceptionChronicRefillPresentation {
  if (!candidate) {
    return {
      available: false,
      sectionSummary: '暂无可确认的慢病续方候选',
      title: '暂未识别复诊配药需求',
      medicationStatus: '仅在近期慢病就诊符合续方条件时开放',
    };
  }

  const diagnoses = uniqueNonEmpty(candidate.diagnoses);
  const diagnosisLabel = diagnoses.join('、') || candidate.diagnosis.trim() || '慢病';
  const medications = uniqueNonEmpty(candidate.medications);
  const medicationStatus = medications.length > 0
    ? `有历史用药参考 · ${medications.slice(0, 2).join('、')}${medications.length > 2 ? '等' : ''}`
    : '暂无历史用药参考 · 确认后结合诊断与有效库存生成草稿';

  return {
    available: true,
    sectionSummary: generating
      ? `${diagnosisLabel} · 正在准备确认项`
      : `${diagnosisLabel} · 待医生确认`,
    title: `${diagnosisLabel}复诊配药`,
    medicationStatus,
  };
}
