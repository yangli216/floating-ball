import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import {
  buildDiagList,
  buildOrderListItem,
  buildRecordConfirmedPayload,
  type OrderItemResolvers,
} from '../../clinical-result/recordConfirmedPayload';
import { buildTreatmentPlanSummary } from '../../clinical-result/consultationSubmitPayload';
import {
  useMutualRecognitionDecision,
  type MutualRecognitionFeedbackPayload,
} from '../../consultation-result/model/useMutualRecognitionDecision';

export interface SymptomFinalWritebackPreflightResult {
  ready: boolean;
  selected: TreatmentRecommendation[];
}

export interface SymptomConsultationFinalWritebackOptions {
  resolveConsultationId: () => string;
  canSubmit: () => boolean;
  getSelectedDiagnosis: () => Diagnosis | null;
  getPatientTetId: () => string;
  getRecord: () => { chiefComplaint: string; historyOfPresentIllness: string };
  getPastMedicalHistory: () => string;
  runPreflight: () => Promise<SymptomFinalWritebackPreflightResult>;
  orderItemResolvers: OrderItemResolvers;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
  formatError: (error: unknown) => string;
  onBeforeSubmit?: (context: {
    consultationId: string;
    diagnosis: Diagnosis;
    treatments: TreatmentRecommendation[];
  }) => void;
  onSuccess?: (consultationId: string) => void;
  onError?: (error: unknown) => void;
}

export function useSymptomConsultationFinalWriteback(
  options: SymptomConsultationFinalWritebackOptions,
) {
  const busy = ref(false);
  const pendingRequestId = ref('');

  const mutualRecognition = useMutualRecognitionDecision({
    resolveConsultationId: options.resolveConsultationId,
    resolvePendingRequestId: () => pendingRequestId.value,
    notify: (message, type) => options.notify(message, type === 'error' ? 'error' : 'info'),
  });

  function reset(): void {
    busy.value = false;
    pendingRequestId.value = '';
    mutualRecognition.clearDialog();
  }

  async function submit(): Promise<void> {
    if (busy.value) return;
    const diagnosis = options.getSelectedDiagnosis();
    if (!options.canSubmit() || !diagnosis) {
      options.notify(
        diagnosis ? '请先完善主诉和现病史后再提交' : '请先选择一个诊断结果',
        'info',
      );
      return;
    }

    busy.value = true;
    const requestId = `record-confirmed-${Date.now()}`;
    const consultationId = options.resolveConsultationId();
    try {
      const preflight = await options.runPreflight();
      if (!preflight.ready) {
        busy.value = false;
        return;
      }

      const record = options.getRecord();
      const diagList = buildDiagList({
        selectedDiagnoses: [diagnosis],
        primaryDiagnosis: diagnosis,
        patientTetId: options.getPatientTetId(),
      });
      const orderList = preflight.selected.map((item) => (
        buildOrderListItem(item, options.orderItemResolvers)
      ));
      const result = buildRecordConfirmedPayload({
        consultationId,
        requestId,
        ...record,
        pastMedicalHistory: options.getPastMedicalHistory(),
        diagList,
        orderList,
        treatmentPlan: buildTreatmentPlanSummary(preflight.selected),
        extra: {
          referenceType: 'batch',
          action: 'batch',
          referenceStatus: 'pending',
          referenceMessage: '等待 PHIS 完成最终回写并回执。',
        },
      });

      options.onBeforeSubmit?.({ consultationId, diagnosis, treatments: preflight.selected });
      pendingRequestId.value = requestId;
      await invoke('complete_consultation', { result });
      if (pendingRequestId.value === requestId) {
        options.notify('数据已发送至 HIS，等待保存结果。', 'info');
      }
    } catch (error) {
      reset();
      options.onError?.(error);
      options.notify(options.formatError(error), 'error');
    }
  }

  function consumeMutualRecognitionFeedback(payload: MutualRecognitionFeedbackPayload): boolean {
    return mutualRecognition.handleFeedback(payload);
  }

  function finalizeFeedback(payload: MutualRecognitionFeedbackPayload): void {
    if (!pendingRequestId.value || payload.requestId !== pendingRequestId.value || payload.status === 'pending') {
      return;
    }
    pendingRequestId.value = '';
    busy.value = false;
    if (payload.status === 'success') options.onSuccess?.(options.resolveConsultationId());
  }

  return {
    busy,
    pendingRequestId,
    mutualRecognition,
    submit,
    consumeMutualRecognitionFeedback,
    finalizeFeedback,
    reset,
  };
}

export type SymptomConsultationFinalWriteback = ReturnType<
  typeof useSymptomConsultationFinalWriteback
>;
