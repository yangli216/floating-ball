import { type Ref } from 'vue';
import type { ConsultationAssistAction } from '../../../types/consultationAssist';
import type { Diagnosis, TreatmentRecommendation } from '../../../types/consultation';

export interface ConsultationAssistTrackPayload extends Record<string, unknown> {
  diagnosisCount?: number;
  diagnosisName?: string;
  diagnosisCode?: string;
  itemCount?: number;
}

export interface UseConsultationAssistControllerInput {
  assistFocus: Ref<ConsultationAssistAction | null>;
  aiDiagnoses: Ref<Diagnosis[]>;
  selectedDiagnosis: Ref<Diagnosis | null>;
  aiLoading: Ref<boolean>;
  treatmentLoading: Ref<boolean>;
  treatmentRecommendations: Ref<TreatmentRecommendation[]>;
  examLoading: Ref<boolean>;
  examRecommendations: Ref<TreatmentRecommendation[]>;
  labTestLoading: Ref<boolean>;
  labTestRecommendations: Ref<TreatmentRecommendation[]>;
  procedureLoading: Ref<boolean>;
  procedureRecommendations: Ref<TreatmentRecommendation[]>;
  hasRecordDraft: () => boolean;
  prefillRecord: (force?: boolean) => boolean;
  prefillDiagnosis: (force?: boolean) => boolean;
  setCurrentView: (view: 'consultation' | 'record') => void;
  notify: (message: string, level?: 'success' | 'error' | 'info') => void;
  afterContextReady: () => Promise<void>;
  fetchAIDiagnosis: () => Promise<void>;
  shouldRefreshDiagnosis?: () => boolean;
  fetchTreatmentRecommendation: () => Promise<void>;
  fetchExamRecommendation: () => Promise<void>;
  fetchLabTestRecommendation: () => Promise<void>;
  fetchProcedureRecommendation: () => Promise<void>;
  trackAssistFeatureUsage?: (
    kind: ConsultationAssistAction,
    payload?: ConsultationAssistTrackPayload,
  ) => void;
  consumeAutoTrigger: () => void;
}

export function useConsultationAssistController(input: UseConsultationAssistControllerInput) {
  function ensureRecordContext(): boolean {
    input.prefillRecord(true);
    if (input.hasRecordDraft()) {
      input.setCurrentView('record');
      return true;
    }

    input.setCurrentView('consultation');
    input.notify('当前患者暂无可直接复用的主诉和现病史，已进入症状选择页。', 'info');
    return false;
  }

  async function ensureDiagnosisContext(): Promise<boolean> {
    if (!ensureRecordContext()) {
      return false;
    }

    if (input.selectedDiagnosis.value || input.prefillDiagnosis(true)) {
      await input.afterContextReady();
      return true;
    }

    input.assistFocus.value = 'diagnosis';
    if (input.aiDiagnoses.value.length === 0 && !input.aiLoading.value) {
      await input.fetchAIDiagnosis();
    }
    input.notify('当前缺少主诊断，请先确认诊断。', 'info');
    return false;
  }

  async function triggerAssist(kind: ConsultationAssistAction): Promise<void> {
    input.assistFocus.value = kind;

    try {
      switch (kind) {
        case 'record': {
          if (!ensureRecordContext()) {
            return;
          }
          if (input.aiDiagnoses.value.length === 0 && !input.aiLoading.value) {
            await input.fetchAIDiagnosis();
          }
          return;
        }
        case 'diagnosis': {
          if (!ensureRecordContext()) {
            return;
          }
          if (
            !input.aiLoading.value
            && (input.aiDiagnoses.value.length === 0 || input.shouldRefreshDiagnosis?.())
          ) {
            await input.fetchAIDiagnosis();
          }
          if (input.aiDiagnoses.value.length > 0) {
            input.trackAssistFeatureUsage?.('diagnosis', {
              diagnosisCount: input.aiDiagnoses.value.length,
            });
          }
          return;
        }
        case 'medication': {
          const hasDiagnosis = await ensureDiagnosisContext();
          if (!hasDiagnosis) return;
          await input.afterContextReady();
          if (!input.treatmentLoading.value && input.treatmentRecommendations.value.length === 0) {
            await input.fetchTreatmentRecommendation();
          }
          if (input.treatmentRecommendations.value.length > 0) {
            input.trackAssistFeatureUsage?.('medication', {
              diagnosisName: input.selectedDiagnosis.value?.name,
              itemCount: input.treatmentRecommendations.value.length,
            });
          }
          return;
        }
        case 'examination': {
          const hasDiagnosis = await ensureDiagnosisContext();
          if (!hasDiagnosis) return;
          await input.afterContextReady();
          if (!input.examLoading.value && input.examRecommendations.value.length === 0) {
            await input.fetchExamRecommendation();
          }
          if (input.examRecommendations.value.length > 0) {
            input.trackAssistFeatureUsage?.('examination', {
              diagnosisName: input.selectedDiagnosis.value?.name,
              itemCount: input.examRecommendations.value.length,
            });
          }
          return;
        }
        case 'lab_test': {
          const hasDiagnosis = await ensureDiagnosisContext();
          if (!hasDiagnosis) return;
          await input.afterContextReady();
          if (!input.labTestLoading.value && input.labTestRecommendations.value.length === 0) {
            await input.fetchLabTestRecommendation();
          }
          if (input.labTestRecommendations.value.length > 0) {
            input.trackAssistFeatureUsage?.('lab_test', {
              diagnosisName: input.selectedDiagnosis.value?.name,
              itemCount: input.labTestRecommendations.value.length,
            });
          }
          return;
        }
        case 'procedure': {
          const hasDiagnosis = await ensureDiagnosisContext();
          if (!hasDiagnosis) return;
          await input.afterContextReady();
          if (!input.procedureLoading.value && input.procedureRecommendations.value.length === 0) {
            await input.fetchProcedureRecommendation();
          }
          if (input.procedureRecommendations.value.length > 0) {
            input.trackAssistFeatureUsage?.('procedure', {
              diagnosisName: input.selectedDiagnosis.value?.name,
              itemCount: input.procedureRecommendations.value.length,
            });
          }
          return;
        }
        case 'differential': {
          const hasDiagnosis = await ensureDiagnosisContext();
          if (!hasDiagnosis || !input.selectedDiagnosis.value) {
            return;
          }
          input.trackAssistFeatureUsage?.('differential', {
            diagnosisName: input.selectedDiagnosis.value.name,
            diagnosisCode: input.selectedDiagnosis.value.code,
          });
          input.notify('已进入结果页，可在诊断卡片上点击“诊断鉴别”。', 'info');
          return;
        }
        case 'reminder': {
          if (ensureRecordContext() && input.aiDiagnoses.value.length === 0 && !input.aiLoading.value) {
            await input.fetchAIDiagnosis();
          }
          input.notify('风险提醒已同步，可继续处理当前病历。', 'info');
          return;
        }
        default:
          return;
      }
    } finally {
      input.consumeAutoTrigger();
    }
  }

  return {
    ensureDiagnosisContext,
    ensureRecordContext,
    triggerAssist,
  };
}

export type ConsultationAssistController = ReturnType<typeof useConsultationAssistController>;
