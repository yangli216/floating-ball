import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type {
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
  VoiceRecommendationFeedbackDraft,
} from '@/types/voiceFeedback';
import {
  buildDiagnosisRecommendationFeedbackSubmitPayload,
  buildTreatmentRecommendationFeedbackSubmitPayload,
  type RecommendationFeedbackSubmitPayload,
} from '@features/clinical-result';

export type VoiceFeedbackActionsNotify = (message: string, type?: string) => void;

export interface VoiceFeedbackActionsOptions {
  isDiagnosisSelected: (diag: Diagnosis) => boolean;
  isPrimaryDiagnosis: (diag: Diagnosis) => boolean;
  submitRecommendationFeedback: (payload: RecommendationFeedbackSubmitPayload) => Promise<void>;
  submitRecordFieldFeedback: (payload: {
    fieldKey: VoiceRecordFieldKey;
    draft: VoiceRecordFieldFeedbackDraft;
    originalValue: string;
    currentValue: string;
  }) => Promise<void>;
  submitSessionFeedback: (payload: {
    diagnoses: Diagnosis[];
    selectedTreatments: TreatmentRecommendation[];
  }) => Promise<void>;
  getRecordFieldOriginalValue: (fieldKey: VoiceRecordFieldKey) => string;
  getRecordFieldValue: (fieldKey: VoiceRecordFieldKey) => string;
  getRecordFieldLabel: (fieldKey: VoiceRecordFieldKey) => string;
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
  return error instanceof Error ? error.message : String(error);
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

  async function handleRecordFieldFeedbackSubmit(
    fieldKey: VoiceRecordFieldKey,
    draft: VoiceRecordFieldFeedbackDraft,
  ): Promise<void> {
    try {
      await options.submitRecordFieldFeedback({
        fieldKey,
        draft,
        originalValue: options.getRecordFieldOriginalValue(fieldKey),
        currentValue: options.getRecordFieldValue(fieldKey),
      });
      options.closeRecommendationFeedback();
      options.notify?.(`${options.getRecordFieldLabel(fieldKey)}反馈已记录`, 'success');
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
    handleRecordFieldFeedbackSubmit,
    handleSessionFeedbackSubmit,
    handleTreatmentFeedbackSubmit,
  };
}

export type VoiceFeedbackActions = ReturnType<typeof useVoiceFeedbackActions>;
