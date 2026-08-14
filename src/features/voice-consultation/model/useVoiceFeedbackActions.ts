import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type {
  VoiceRecommendationFeedbackDraft,
} from '@/types/voiceFeedback';
import {
  buildDiagnosisRecommendationFeedbackSubmitPayload,
  buildTreatmentRecommendationFeedbackSubmitPayload,
  type RecommendationFeedbackSubmitPayload,
} from '@features/clinical-result';
import { formatUserFacingError } from '@shared/lib/errorMessages';

export type VoiceFeedbackActionsNotify = (message: string, type?: string) => void;

export interface VoiceFeedbackActionsOptions {
  isDiagnosisSelected: (diag: Diagnosis) => boolean;
  isPrimaryDiagnosis: (diag: Diagnosis) => boolean;
  submitRecommendationFeedback: (payload: RecommendationFeedbackSubmitPayload) => Promise<void>;
  submitSessionFeedback: (payload: {
    diagnoses: Diagnosis[];
    selectedTreatments: TreatmentRecommendation[];
  }) => Promise<void>;
  getSelectedDiagnoses: () => Diagnosis[];
  getSelectedTreatments: () => TreatmentRecommendation[];
  closeRecommendationFeedback: () => void;
  closeSessionFeedback: () => void;
  clearVoiceFeedbackDraft: () => void;
  clearWritebackFeedback: () => void;
  closeResult: () => void;
  notify?: VoiceFeedbackActionsNotify;
}

function getErrorMessage(error: unknown): string {
  return formatUserFacingError(error, { fallback: '请稍后重试。' });
}

export function useVoiceFeedbackActions(options: VoiceFeedbackActionsOptions) {
  async function handleDiagnosisFeedbackSubmit(
    diag: Diagnosis,
    draft: VoiceRecommendationFeedbackDraft,
  ): Promise<void> {
    const payload = buildDiagnosisRecommendationFeedbackSubmitPayload(diag, draft, {
      selected: options.isDiagnosisSelected(diag),
      primary: options.isPrimaryDiagnosis(diag),
    });

    try {
      await options.submitRecommendationFeedback(payload);
      options.closeRecommendationFeedback();
      options.notify?.('诊断反馈已记录', 'success');
    } catch (error) {
      options.notify?.(`提交反馈失败: ${getErrorMessage(error)}`, 'error');
    }
  }

  async function handleTreatmentFeedbackSubmit(
    rec: TreatmentRecommendation,
    draft: VoiceRecommendationFeedbackDraft,
  ): Promise<void> {
    try {
      await options.submitRecommendationFeedback(buildTreatmentRecommendationFeedbackSubmitPayload(rec, draft));
      options.closeRecommendationFeedback();
      options.notify?.('推荐反馈已记录', 'success');
    } catch (error) {
      options.notify?.(`提交反馈失败: ${getErrorMessage(error)}`, 'error');
    }
  }

  async function handleSessionFeedbackSubmit(): Promise<void> {
    try {
      await options.submitSessionFeedback({
        diagnoses: options.getSelectedDiagnoses(),
        selectedTreatments: options.getSelectedTreatments(),
      });
      options.notify?.('整页反馈已记录', 'success');
      completeVoiceConsultationFlow();
    } catch (error) {
      options.notify?.(`提交整页反馈失败: ${getErrorMessage(error)}`, 'error');
    }
  }

  function completeVoiceConsultationFlow(): void {
    options.closeSessionFeedback();
    options.clearVoiceFeedbackDraft();
    options.clearWritebackFeedback();
    options.closeResult();
  }

  return {
    completeVoiceConsultationFlow,
    handleDiagnosisFeedbackSubmit,
    handleSessionFeedbackSubmit,
    handleTreatmentFeedbackSubmit,
  };
}

export type VoiceFeedbackActions = ReturnType<typeof useVoiceFeedbackActions>;
