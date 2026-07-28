import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { ClinicalResultInput } from '@features/clinical-result';

export type TreatmentPlanDraftItemType = 'exam' | 'lab_test';

export interface TreatmentPlanInitialDraftStandardDiagnosis {
  id: string;
  code: string;
  name: string;
}

export interface TreatmentPlanInitialDraftRecordContext {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  allergyHistory: string;
}

export interface TreatmentPlanInitialDraftItem {
  sourceId: string;
  type: TreatmentPlanDraftItemType;
  name: string;
  reason: string;
  matchedItem?: TreatmentRecommendation['matchedItem'];
  matchStatus?: TreatmentRecommendation['matchStatus'];
}

export interface TreatmentPlanInitialDraft {
  requestId: string;
  patientAnchorId: string;
  sourceModule: 'chronic_disease';
  title: string;
  items: TreatmentPlanInitialDraftItem[];
  /**
   * 新版慢病草稿携带的 HIS 标准诊断快照。
   * 保持可选，以兼容升级前已经驻留在 runtime 中的旧草稿。
   */
  standardDiagnoses?: TreatmentPlanInitialDraftStandardDiagnosis[];
  /**
   * 同一就诊内上一步已生成、但尚不代表保存到 HIS 的病历上下文。
   * 保持可选，以兼容未经过复诊配药步骤及升级前的旧草稿。
   */
  recordContext?: TreatmentPlanInitialDraftRecordContext;
}

export interface MapTreatmentPlanInitialDraftItemsOptions {
  items: TreatmentPlanInitialDraftItem[];
  assessCatalogMatch: (
    type: TreatmentRecommendation['type'],
    name: string,
  ) => Pick<
    TreatmentRecommendation,
    'matchedItem' | 'suggestedMatchItem' | 'matchStatus'
  >;
  normalize: (
    recommendation: Partial<TreatmentRecommendation>,
  ) => TreatmentRecommendation;
}

export function mapTreatmentPlanInitialDraftItems(
  options: MapTreatmentPlanInitialDraftItemsOptions,
): TreatmentRecommendation[] {
  return options.items.map((item) => {
    const assessment = item.matchedItem
      ? {
          matchedItem: item.matchedItem,
          suggestedMatchItem: undefined,
          matchStatus: item.matchStatus || 'exact' as const,
        }
      : options.assessCatalogMatch(item.type, item.name);
    return options.normalize({
      type: item.type,
      name: assessment.matchedItem?.name || item.name,
      originalName: item.name,
      reason: item.reason,
      evidenceText: item.reason,
      sourceType: 'explicit',
      matchedItem: assessment.matchedItem,
      suggestedMatchItem: assessment.suggestedMatchItem,
      matchStatus: assessment.matchStatus,
      selected: Boolean(assessment.matchedItem),
    });
  });
}

export function mapTreatmentPlanInitialDraftStandardDiagnoses(
  standardDiagnoses: readonly TreatmentPlanInitialDraftStandardDiagnosis[],
): Diagnosis[] {
  return standardDiagnoses.map((diagnosis) => ({
    id: diagnosis.id,
    code: diagnosis.code,
    name: diagnosis.name,
    rate: 'HIS标准诊断',
    rationale: '来自慢病助手疾病标签与 HIS 标准诊断目录匹配',
  }));
}

export function buildTreatmentPlanInitialDraftRecordContext(
  result: ClinicalResultInput | null | undefined,
): TreatmentPlanInitialDraftRecordContext | undefined {
  if (!result) return undefined;

  const recordContext = {
    chiefComplaint: result.chiefComplaint.trim(),
    historyOfPresentIllness: result.historyOfPresentIllness.trim(),
    pastMedicalHistory: result.pastMedicalHistory.trim(),
    allergyHistory: result.allergyHistory.trim(),
  };
  return Object.values(recordContext).some(Boolean) ? recordContext : undefined;
}
