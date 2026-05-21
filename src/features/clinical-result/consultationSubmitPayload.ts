import type { TreatmentRecommendation } from '@/types/consultation';

export interface BuildSelectedTreatmentsInput {
  items?: TreatmentRecommendation[];
  medicines?: TreatmentRecommendation[];
  examinations?: TreatmentRecommendation[];
  labTests?: TreatmentRecommendation[];
  procedures?: TreatmentRecommendation[];
}

export function buildSelectedTreatments(
  input: BuildSelectedTreatmentsInput,
): TreatmentRecommendation[] {
  if (input.items) {
    return input.items.filter((item) => item.selected);
  }

  return [
    ...(input.medicines ?? []),
    ...(input.examinations ?? []),
    ...(input.labTests ?? []),
    ...(input.procedures ?? []),
  ].filter((item) => item.selected);
}

export function buildInventoryBlockedSubmitMessage(
  items: TreatmentRecommendation[],
): string {
  if (items.length === 0) {
    return '存在库存不足的药品，请调整用药数量或药房后再提交';
  }

  const names = Array.from(new Set(items.map((item) => item.name).filter(Boolean)));
  if (names.length === 1) {
    return `${names[0]} 库存不足，请调整用药数量或药房后再提交`;
  }

  const preview = names.slice(0, 3).join('、');
  return `${preview}${names.length > 3 ? ` 等${names.length}种药品` : ''}库存不足，请调整用药数量或药房后再提交`;
}

export function buildTreatmentPlanSummary(
  selectedTreatments: TreatmentRecommendation[],
): string {
  const groupNames = (type: TreatmentRecommendation['type']) =>
    selectedTreatments.filter((item) => item.type === type).map((item) => item.name);

  return [
    groupNames('medicine').length ? `用药：${groupNames('medicine').join('；')}` : '',
    groupNames('exam').length ? `检查：${groupNames('exam').join('；')}` : '',
    groupNames('lab_test').length ? `检验：${groupNames('lab_test').join('；')}` : '',
    groupNames('procedure').length ? `处置：${groupNames('procedure').join('；')}` : '',
  ].filter(Boolean).join('。');
}
