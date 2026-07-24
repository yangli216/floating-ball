export type TreatmentPlanDraftItemType = 'exam' | 'lab_test';

export interface TreatmentPlanInitialDraftItem {
  sourceId: string;
  type: TreatmentPlanDraftItemType;
  name: string;
  reason: string;
}

export interface TreatmentPlanInitialDraft {
  requestId: string;
  patientAnchorId: string;
  sourceModule: 'chronic_disease';
  title: string;
  items: TreatmentPlanInitialDraftItem[];
}
