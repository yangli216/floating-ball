import type { ConsultationAssistAction } from '../../../types/consultationAssist';
import type { TreatmentRecommendation } from '../../../types/consultation';

export type ConsultationRecordView = 'consultation' | 'record' | 'final_report';

export interface BuildVisibleTreatmentRecommendationsInput {
  assistFocus: ConsultationAssistAction | null | undefined;
  medicines: TreatmentRecommendation[];
  examinations: TreatmentRecommendation[];
  labTests: TreatmentRecommendation[];
  procedures: TreatmentRecommendation[];
}

export interface BuildMedicineInlineSummaryInput {
  recommendation: TreatmentRecommendation;
  normalize: (recommendation: TreatmentRecommendation) => TreatmentRecommendation;
}

const FOCUSED_TREATMENT_TYPE_BY_ASSIST: Partial<Record<ConsultationAssistAction, TreatmentRecommendation['type']>> = {
  medication: 'medicine',
  examination: 'exam',
  lab_test: 'lab_test',
  procedure: 'procedure',
};

const PRIMARY_TREATMENT_TYPES = new Set<TreatmentRecommendation['type']>([
  'medicine',
  'exam',
  'lab_test',
  'procedure',
]);

function getFocusedTreatmentType(
  assistFocus: ConsultationAssistAction | null | undefined,
): TreatmentRecommendation['type'] | undefined {
  return assistFocus ? FOCUSED_TREATMENT_TYPE_BY_ASSIST[assistFocus] : undefined;
}

export function buildVisibleTreatmentRecommendations({
  assistFocus,
  medicines,
  examinations,
  labTests,
  procedures,
}: BuildVisibleTreatmentRecommendationsInput): TreatmentRecommendation[] {
  switch (getFocusedTreatmentType(assistFocus)) {
    case 'medicine':
      return medicines;
    case 'exam':
      return examinations;
    case 'lab_test':
      return labTests;
    case 'procedure':
      return procedures;
    default:
      return [
        ...medicines,
        ...examinations,
        ...labTests,
        ...procedures,
      ];
  }
}

export function filterOtherTreatmentRecommendations(
  recommendations: TreatmentRecommendation[],
): TreatmentRecommendation[] {
  return recommendations.filter((item) => !PRIMARY_TREATMENT_TYPES.has(item.type));
}

export function shouldShowDiagnosisCard(
  currentView: ConsultationRecordView,
  assistFocus: ConsultationAssistAction | null | undefined,
): boolean {
  return currentView === 'record' && !getFocusedTreatmentType(assistFocus);
}

export function shouldShowTreatmentCard(
  currentView: ConsultationRecordView,
  assistFocus: ConsultationAssistAction | null | undefined,
): boolean {
  return currentView === 'record' && assistFocus !== 'differential';
}

export function getTreatmentTagLabel(type: TreatmentRecommendation['type']): string {
  switch (type) {
    case 'medicine':
      return '药';
    case 'exam':
      return '查';
    case 'lab_test':
      return '验';
    case 'procedure':
      return '处';
    default:
      return '治';
  }
}

export function getDiagnosisRateClass(rate: string | undefined): string {
  if (!rate) return '';
  const num = parseInt(rate);
  if (isNaN(num)) return '';
  if (num >= 70) return 'rate-high';
  if (num >= 60) return 'rate-medium';
  return 'rate-low';
}

export function buildMedicineInlineSummary({
  recommendation,
  normalize,
}: BuildMedicineInlineSummaryInput): string {
  const normalized = normalize(recommendation);
  const parts = [
    normalized.dosage || normalized.dosageUnit
      ? `一次剂量 ${[normalized.dosage, normalized.dosageUnit].filter(Boolean).join(' ')}`
      : '',
    normalized.frequency ? `频次 ${normalized.frequency}` : '',
    normalized.route ? `用法 ${normalized.route}` : '',
    normalized.days ? `天数 ${normalized.days}天` : '',
    normalized.totalQty || normalized.totalUnit
      ? `总量 ${[normalized.totalQty, normalized.totalUnit].filter(Boolean).join(' ')}`
      : '',
  ].filter(Boolean);

  return parts.join(' / ');
}
