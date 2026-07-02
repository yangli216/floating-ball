import { ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  buildDiagnosisChecklistMismatchError,
  normalizeDiagnosisChecklistItems,
  parseDiagnosisChecklistResponse,
  type DiagnosisChecklistItem,
} from '@features/clinical-result';

export interface ClinicalResultDiagnosisChecklistRequest {
  diagnosisName: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export interface ClinicalResultDiagnosisChecklistOptions {
  getChiefComplaint: () => string;
  getHistoryOfPresentIllness: () => string;
  request: (input: ClinicalResultDiagnosisChecklistRequest) => Promise<string>;
  formatError: (error: unknown) => string;
  notify?: (message: string, type?: string) => void;
}

export function useClinicalResultDiagnosisChecklist(
  options: ClinicalResultDiagnosisChecklistOptions,
) {
  const showChecklistModal = ref(false);
  const isChecklistLoading = ref(false);
  const checklistItems = ref<DiagnosisChecklistItem[]>([]);
  const checklistGenerationError = ref('');
  const activeChecklistDiagnosis = ref<Diagnosis | null>(null);
  let requestSequence = 0;

  function closeChecklistModal(): void {
    requestSequence += 1;
    showChecklistModal.value = false;
    isChecklistLoading.value = false;
    checklistGenerationError.value = '';
  }

  async function openDiagnosisChecklist(diagnosis: Diagnosis): Promise<void> {
    const currentRequest = ++requestSequence;
    activeChecklistDiagnosis.value = diagnosis;
    checklistItems.value = [];
    checklistGenerationError.value = '';
    showChecklistModal.value = true;
    isChecklistLoading.value = true;

    try {
      const response = await options.request({
        diagnosisName: diagnosis.name,
        chiefComplaint: options.getChiefComplaint(),
        historyOfPresentIllness: options.getHistoryOfPresentIllness(),
      });
      if (currentRequest !== requestSequence) return;

      const parsed = parseDiagnosisChecklistResponse(response);
      const mismatchError = buildDiagnosisChecklistMismatchError(parsed);
      if (mismatchError) {
        checklistItems.value = [];
        checklistGenerationError.value = mismatchError;
        return;
      }

      checklistItems.value = normalizeDiagnosisChecklistItems(parsed);
      if (checklistItems.value.length === 0) {
        options.notify?.('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
      }
    } catch (error: unknown) {
      if (currentRequest !== requestSequence) return;
      checklistItems.value = [];
      checklistGenerationError.value = options.formatError(error);
      options.notify?.(checklistGenerationError.value, 'error');
    } finally {
      if (currentRequest === requestSequence) {
        isChecklistLoading.value = false;
      }
    }
  }

  return {
    activeChecklistDiagnosis,
    checklistGenerationError,
    checklistItems,
    isChecklistLoading,
    showChecklistModal,
    closeChecklistModal,
    openDiagnosisChecklist,
  };
}

export type ClinicalResultDiagnosisChecklist = ReturnType<typeof useClinicalResultDiagnosisChecklist>;
