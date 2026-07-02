import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { DiagnosisHint, TreatmentHint } from '@/prompts';
import type { OutpatientRecord } from './outpatientRecord';

export type ClinicalResultChannel = 'voice' | 'symptom' | 'chronic-refill';

export interface ClinicalResultMatchedItem {
  id: string;
  name: string;
  spec?: string;
  code?: string;
  idSrv?: string;
  naSrv?: string;
  sdSrv?: string;
  idDeptExec?: string;
  idPart?: string;
  jsonField?: string;
  fgCheckOrd?: string;
  fgSkintest?: string;
  storeIds?: string[];
  raw?: Record<string, unknown>;
}

export interface ClinicalResultMatchedDiagnosis extends DiagnosisHint {
  matchedItem?: { id: string; code: string; name: string } | null;
}

export interface ClinicalResultMatchedTreatment extends TreatmentHint {
  matchedItem?: ClinicalResultMatchedItem | null;
}

export type ClinicalResultDiagnosis = ClinicalResultMatchedDiagnosis & Partial<Diagnosis>;

export type ClinicalResultTreatment =
  Omit<ClinicalResultMatchedTreatment, 'matchedItem'>
  & Omit<Partial<TreatmentRecommendation>, 'type' | 'matchedItem'>
  & {
    matchedItem?:
      | TreatmentRecommendation['matchedItem']
      | ClinicalResultMatchedTreatment['matchedItem']
      | null;
  };

export interface ClinicalResultRecommendationPolicy {
  /** false 表示调用方已提供完整治疗清单，结果页不得自动补拉通用方案。 */
  autoFetchTreatments?: boolean;
  /** false 表示不向医生提供“刷新方案”入口。 */
  allowTreatmentRefresh?: boolean;
  /** 限定该场景允许出现的治疗类型。 */
  allowedTreatmentTypes?: Array<'medicine' | 'examination' | 'labTest' | 'procedure'>;
}

export interface ClinicalResultInput {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  allergyHistory: string;
  currentMedicationHistory: string;
  familyHistory: string;
  symptoms: string[];
  negativeSymptoms: string[];
  diagnoses: ClinicalResultDiagnosis[];
  treatments: ClinicalResultTreatment[];
  treatmentPlan: string;
  healthEducation: string;
  outpatientRecord?: OutpatientRecord;
  recommendationPolicy?: ClinicalResultRecommendationPolicy;
  channel?: ClinicalResultChannel;
}
