import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { FeedbackType, TargetType } from '@/types/feedback';

export type ConsultationCompletionMode = 'western' | 'tcm';

export interface TrackRecommendationActionInput {
  targetType: TargetType;
  targetId: string;
  action: FeedbackType;
  options?: {
    originalValue?: string;
    modifiedValue?: string;
    reason?: string;
    rating?: number;
  };
}

export interface TrackCompletionFormSubmitInput {
  name: string;
  details?: Record<string, unknown>;
}

export interface TrackConsultationCompletionInput {
  selectedDiagnosis: Diagnosis;
  diagnoses: Diagnosis[];
  medicines: TreatmentRecommendation[];
  selectedTreatmentCount: number;
  mode: ConsultationCompletionMode;
  getDiagnosisIdentity: (diagnosis: Diagnosis | null | undefined) => string;
  trackRecommendationAction: (input: TrackRecommendationActionInput) => void;
  trackFormSubmit: (input: TrackCompletionFormSubmitInput) => void;
}

function mapCompletionTreatmentTargetType(
  treatment: TreatmentRecommendation,
): TargetType | null {
  if (treatment.type === 'medicine') {
    return 'medication';
  }

  if (treatment.type === 'exam') {
    return 'examination';
  }

  return null;
}

export function trackConsultationCompletion(
  input: TrackConsultationCompletionInput,
): void {
  input.trackRecommendationAction({
    targetType: 'diagnosis',
    targetId: input.selectedDiagnosis.id || input.selectedDiagnosis.code,
    action: 'adopted',
    options: { originalValue: input.selectedDiagnosis.name },
  });

  const selectedDiagnosisIdentity = input.getDiagnosisIdentity(input.selectedDiagnosis);
  input.diagnoses
    .filter((diagnosis) => input.getDiagnosisIdentity(diagnosis) !== selectedDiagnosisIdentity)
    .forEach((diagnosis) => {
      input.trackRecommendationAction({
        targetType: 'diagnosis',
        targetId: diagnosis.id || diagnosis.code,
        action: 'rejected',
        options: { originalValue: diagnosis.name },
      });
    });

  input.medicines.forEach((treatment) => {
    const targetType = mapCompletionTreatmentTargetType(treatment);
    if (!targetType) {
      return;
    }

    input.trackRecommendationAction({
      targetType,
      targetId: treatment.name,
      action: treatment.selected ? 'adopted' : 'rejected',
      options: { originalValue: treatment.name },
    });
  });

  input.trackFormSubmit({
    name: 'generate_final_report',
    details: {
      diagnosisName: input.selectedDiagnosis.name,
      selectedTreatmentCount: input.selectedTreatmentCount,
      totalTreatmentCount: input.medicines.length,
      mode: input.mode,
    },
  });
}
