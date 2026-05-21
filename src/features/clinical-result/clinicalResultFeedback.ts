import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { RecommendationType, TargetType } from '@/types/feedback';
import type { VoiceRecommendationFeedbackDraft } from '@/types/voiceFeedback';
import {
  buildDiagnosisFeedbackSnapshot,
  buildTreatmentFeedbackSnapshot,
} from './recommendationHelpers';

export interface RecommendationFeedbackSubmitPayload {
  recommendationKey: string;
  recommendationTitle: string;
  draft: VoiceRecommendationFeedbackDraft;
  snapshot: Record<string, unknown>;
  fallbackTargetType: TargetType;
  fallbackRecommendationType: RecommendationType;
}

export function getDiagnosisRecommendationFeedbackKey(
  diag: Pick<Diagnosis, 'id' | 'code' | 'name'>,
): string {
  return [diag.id || '', diag.code || '', diag.name || ''].join('|');
}

export function getTreatmentRecommendationFeedbackKey(
  rec: Pick<TreatmentRecommendation, 'type' | 'name' | 'originalName'>,
): string {
  return [rec.type || '', rec.originalName || rec.name || ''].join('|');
}

export function mapTreatmentTypeToRecommendationType(
  type: TreatmentRecommendation['type'],
): RecommendationType {
  switch (type) {
    case 'medicine':
      return 'medication';
    case 'exam':
      return 'examination';
    case 'lab_test':
      return 'lab_test';
    case 'procedure':
    case 'acupuncture':
      return 'procedure';
    default:
      return 'procedure';
  }
}

export function mapTreatmentTypeToTargetType(
  type: TreatmentRecommendation['type'],
): TargetType {
  switch (type) {
    case 'medicine':
      return 'medication';
    case 'exam':
      return 'examination';
    case 'lab_test':
      return 'lab_test';
    case 'procedure':
    case 'acupuncture':
      return 'procedure';
    default:
      return 'procedure';
  }
}

export function buildDiagnosisRecommendationFeedbackSubmitPayload(
  diag: Diagnosis,
  draft: VoiceRecommendationFeedbackDraft,
  options: {
    selected: boolean;
    primary?: boolean;
  },
): RecommendationFeedbackSubmitPayload {
  return {
    recommendationKey: getDiagnosisRecommendationFeedbackKey(diag),
    recommendationTitle: diag.name,
    draft,
    snapshot: buildDiagnosisFeedbackSnapshot(diag, options),
    fallbackTargetType: 'diagnosis',
    fallbackRecommendationType: 'diagnosis',
  };
}

export function buildTreatmentRecommendationFeedbackSubmitPayload(
  rec: TreatmentRecommendation,
  draft: VoiceRecommendationFeedbackDraft,
): RecommendationFeedbackSubmitPayload {
  return {
    recommendationKey: getTreatmentRecommendationFeedbackKey(rec),
    recommendationTitle: rec.name,
    draft,
    snapshot: buildTreatmentFeedbackSnapshot(rec),
    fallbackTargetType: mapTreatmentTypeToTargetType(rec.type),
    fallbackRecommendationType: mapTreatmentTypeToRecommendationType(rec.type),
  };
}
