import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type {
  PerformanceMetric,
  RecommendationType,
  TargetType,
} from '@/types/feedback';

export interface SaveTreatmentRecommendationFeedbackInput {
  recType: RecommendationType;
  content: string;
  matched: boolean;
  matchConfidence: number;
  latencyMs: number;
}

export interface RegisterRecommendationTargetInput {
  recommendationKey: string;
  targetId: string;
  targetType: TargetType;
  recommendationType: RecommendationType;
}

interface RegisterRecommendationFeedbackTargetsInput<TRecommendation> {
  recommendations: TRecommendation[];
  recType: RecommendationType;
  targetType: TargetType;
  recommendationType?: RecommendationType;
  latencyMs: number;
  saveRecommendation: (rec: SaveTreatmentRecommendationFeedbackInput) => Promise<string>;
  registerTarget: (payload: RegisterRecommendationTargetInput) => void;
  getRecommendationKey: (rec: TRecommendation) => string;
  isMatched: (rec: TRecommendation) => boolean;
  recordMetric?: (
    metric: Omit<PerformanceMetric, 'metricId' | 'createdAt'>,
  ) => Promise<void>;
  metricContext?: Record<string, unknown>;
}

export interface RegisterDiagnosisRecommendationFeedbackInput
  extends Omit<
    RegisterRecommendationFeedbackTargetsInput<Diagnosis>,
    'recType' | 'targetType' | 'recommendationType' | 'isMatched'
  > {}

export interface RegisterTreatmentRecommendationFeedbackInput
  extends Omit<
    RegisterRecommendationFeedbackTargetsInput<TreatmentRecommendation>,
    'isMatched'
  > {}

async function registerRecommendationFeedbackTargets<TRecommendation>(
  input: RegisterRecommendationFeedbackTargetsInput<TRecommendation>,
): Promise<void> {
  for (const rec of input.recommendations) {
    const matched = input.isMatched(rec);
    const recommendationId = await input.saveRecommendation({
      recType: input.recType,
      content: JSON.stringify(rec),
      matched,
      matchConfidence: matched ? 1.0 : 0.0,
      latencyMs: input.latencyMs,
    });

    input.registerTarget({
      recommendationKey: input.getRecommendationKey(rec),
      targetId: recommendationId,
      targetType: input.targetType,
      recommendationType: input.recommendationType ?? input.recType,
    });
  }

  if (input.recordMetric && input.metricContext) {
    await input.recordMetric({
      metricType: 'llm_latency',
      metricValue: input.latencyMs,
      unit: 'ms',
      context: input.metricContext,
    });
  }
}

export async function registerDiagnosisRecommendationFeedbackTargets(
  input: RegisterDiagnosisRecommendationFeedbackInput,
): Promise<void> {
  await registerRecommendationFeedbackTargets({
    ...input,
    recType: 'diagnosis',
    targetType: 'diagnosis',
    recommendationType: 'diagnosis',
    isMatched: (diagnosis) => !!diagnosis.id,
  });
}

export async function registerTreatmentRecommendationFeedbackTargets(
  input: RegisterTreatmentRecommendationFeedbackInput,
): Promise<void> {
  await registerRecommendationFeedbackTargets({
    ...input,
    isMatched: (rec) => !!rec.matchedItem,
  });
}
