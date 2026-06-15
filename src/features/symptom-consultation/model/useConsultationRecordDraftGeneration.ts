import type { Ref } from 'vue';
import type { ChatMessage, LLMConfigOverride, RetryConfig } from '@services/llm';
import {
  buildConsultationGeneratedRecord,
  type ConsultationGeneratedRecordDraft,
  type ConsultationGeneratedRecordMode,
  type ConsultationGeneratedRecordSymptom,
  type ConsultationGeneratedRecordTarget,
} from '../lib/consultationGeneratedRecord';
import {
  buildConsultationRecordAiDraftMessages,
  normalizeConsultationRecordAiDraftOutput,
  type ConsultationRecordAiDraftPatientProfile,
} from '../lib/consultationRecordAiDraft';
import { buildGeneralConditionHistoryText } from '../lib/consultationGeneralCondition';
import type { GeneralConditionData } from '../lib/consultationGeneralCondition';
import {
  buildTcmSignsReportText,
  type TcmSignsConfigLike,
  type TcmSignsFormData,
} from '../lib/consultationTcmSigns';
import { parseLLMJson } from '../lib/consultationLlmJsonParser';

export interface UseConsultationRecordDraftGenerationInput<
  TSymptom extends ConsultationGeneratedRecordSymptom,
> {
  selectedSymptoms: Ref<TSymptom[]>;
  formData: Ref<Record<string, Record<string, unknown> | undefined>>;
  mode: Ref<ConsultationGeneratedRecordMode>;
  companionSymptomNames: Ref<string[]>;
  patientProfile: Ref<ConsultationRecordAiDraftPatientProfile>;
  tcmConfig: TcmSignsConfigLike;
  chatFast: (
    messages: ChatMessage[],
    apiKey?: string,
    retryConfig?: RetryConfig,
    onRetry?: ((attempt: number, error: any) => void),
    customConfig?: LLMConfigOverride,
  ) => Promise<string>;
  buildSymptomTexts: (
    symptom: TSymptom,
    data: Record<string, unknown>,
    target: ConsultationGeneratedRecordTarget,
    excludeKeys?: string[],
  ) => string[];
  onAiFallback?: (error: unknown) => void;
}

export function useConsultationRecordDraftGeneration<
  TSymptom extends ConsultationGeneratedRecordSymptom,
>(input: UseConsultationRecordDraftGenerationInput<TSymptom>) {
  function buildLocalDraft(): ConsultationGeneratedRecordDraft {
    return buildConsultationGeneratedRecord({
      selectedSymptoms: input.selectedSymptoms.value,
      formData: input.formData.value,
      mode: input.mode.value,
      companionSymptomNames: input.companionSymptomNames.value,
      buildSymptomTexts: input.buildSymptomTexts,
      buildGeneralConditionText: buildGeneralConditionHistoryText,
      buildTcmSignsText: (data) => buildTcmSignsReportText(input.tcmConfig, data),
    });
  }

  async function generateRecordDraft(): Promise<ConsultationGeneratedRecordDraft> {
    const fallbackDraft = buildLocalDraft();

    try {
      const generalData = input.formData.value.general as GeneralConditionData | undefined;
      const tcmData = input.formData.value.tcm_signs as TcmSignsFormData | undefined;
      const generalConditionText = buildGeneralConditionHistoryText(generalData);
      const tcmFourExaminationsText = input.mode.value === 'tcm'
        ? buildTcmSignsReportText(input.tcmConfig, tcmData)
        : '';
      const requestSpec = buildConsultationRecordAiDraftMessages({
        selectedSymptoms: input.selectedSymptoms.value,
        formData: input.formData.value,
        mode: input.mode.value,
        patientProfile: input.patientProfile.value,
        companionSymptomNames: input.companionSymptomNames.value,
        localFallbackDraft: fallbackDraft,
        generalConditionText,
        tcmFourExaminationsText,
      });
      const response = await input.chatFast(
        requestSpec.messages,
        undefined,
        undefined,
        undefined,
        requestSpec.config,
      );
      const aiDraft = normalizeConsultationRecordAiDraftOutput(parseLLMJson(response));

      return {
        ...fallbackDraft,
        chiefComplaint: aiDraft.chiefComplaint,
        historyOfPresentIllness: aiDraft.historyOfPresentIllness,
        tcmFourExaminations: fallbackDraft.tcmFourExaminations || tcmFourExaminationsText,
      };
    } catch (error) {
      input.onAiFallback?.(error);
      return fallbackDraft;
    }
  }

  return {
    buildLocalDraft,
    generateRecordDraft,
  };
}
