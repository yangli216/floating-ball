import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  buildMutualRecognitionDecisionPayload,
  normalizeMutualRecognitionItems,
  type MutualRecognitionDecisionType,
  type MutualRecognitionFeedbackLike,
  type MutualRecognitionItem,
} from '../../clinical-result/mutualRecognition';

export interface MutualRecognitionFeedbackPayload extends MutualRecognitionFeedbackLike {
  consultationId?: string;
}

export interface MutualRecognitionDecisionOptions {
  resolveConsultationId: () => string;
  resolvePendingRequestId: () => string;
  notify?: (message: string, type?: string) => void;
  sendDecision?: (payload: Record<string, unknown>) => Promise<void>;
}

export function useMutualRecognitionDecision(options: MutualRecognitionDecisionOptions) {
  const open = ref(false);
  const submitting = ref(false);
  const requestId = ref('');
  const message = ref('');
  const items = ref<MutualRecognitionItem[]>([]);
  const selectedItemIds = ref<string[]>([]);
  const decidedRequestIds = new Set<string>();

  const isAllSelected = computed(() => (
    items.value.length > 0 && selectedItemIds.value.length === items.value.length
  ));

  function clearDialog(): void {
    open.value = false;
    requestId.value = '';
    message.value = '';
    items.value = [];
    selectedItemIds.value = [];
  }

  function handleFeedback(payload: MutualRecognitionFeedbackPayload): boolean {
    if (payload.status !== 'pending') {
      if (requestId.value && payload.requestId === requestId.value) clearDialog();
      return false;
    }

    const expectedRequestId = options.resolvePendingRequestId().trim();
    if (!expectedRequestId || payload.requestId !== expectedRequestId) {
      console.warn('[MutualRecognition] Ignore pending feedback for a non-current writeback request', {
        expectedRequestId,
        actualRequestId: payload.requestId,
      });
      return true;
    }
    if (decidedRequestIds.has(payload.requestId)) return true;

    const normalizedItems = normalizeMutualRecognitionItems(payload);
    if (normalizedItems.length === 0) {
      console.error('[MutualRecognition] Pending feedback did not include recognizable items', {
        requestId: payload.requestId,
      });
      options.notify?.('HIS 返回了互认待决策状态，但未提供有效项目，请联系联调人员。', 'error');
      return true;
    }

    requestId.value = payload.requestId;
    message.value = payload.message || '以下项目存在可互认的近期报告，请确认本次是否互认。';
    items.value = normalizedItems;
    selectedItemIds.value = normalizedItems.map((item) => item.idSrv);
    open.value = true;
    return true;
  }

  function setItemSelected(idSrv: string, selected: boolean): void {
    const current = new Set(selectedItemIds.value);
    if (selected) current.add(idSrv);
    else current.delete(idSrv);
    selectedItemIds.value = items.value
      .map((item) => item.idSrv)
      .filter((id) => current.has(id));
  }

  function toggleAll(): void {
    selectedItemIds.value = isAllSelected.value ? [] : items.value.map((item) => item.idSrv);
  }

  async function submitDecision(decision: MutualRecognitionDecisionType): Promise<boolean> {
    if (submitting.value || !requestId.value) return false;
    try {
      submitting.value = true;
      const payload = buildMutualRecognitionDecisionPayload({
        consultationId: options.resolveConsultationId(),
        requestId: requestId.value,
        decision,
        recognizedItemIds: selectedItemIds.value,
      });
      if (options.sendDecision) await options.sendDecision(payload);
      else await invoke('complete_consultation', { result: payload });
      decidedRequestIds.add(requestId.value);
      clearDialog();
      options.notify?.('互认决策已发送至 HIS，等待最终保存结果。', 'info');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      options.notify?.(errorMessage || '互认决策发送失败，请重试。', 'error');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    open,
    submitting,
    requestId,
    message,
    items,
    selectedItemIds,
    isAllSelected,
    handleFeedback,
    setItemSelected,
    toggleAll,
    submitDecision,
    clearDialog,
  };
}

export type MutualRecognitionDecision = ReturnType<typeof useMutualRecognitionDecision>;
