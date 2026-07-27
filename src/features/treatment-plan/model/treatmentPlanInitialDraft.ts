import type { TreatmentRecommendation } from '@/types/consultation';

export type TreatmentPlanDraftItemType = 'exam' | 'lab_test';

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
