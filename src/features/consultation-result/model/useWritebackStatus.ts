import { computed, ref } from 'vue';

export type WritebackLifecycleStatus = 'pending' | 'success' | 'failed';
export type WritebackReferenceType =
  | 'diagnosis'
  | 'medication'
  | 'examination'
  | 'lab_test'
  | 'procedure'
  | 'batch';

export interface WritebackFeedbackPayload {
  consultationId?: string;
  requestId: string;
  referenceType?: WritebackReferenceType;
  action?: WritebackReferenceType;
  status: WritebackLifecycleStatus;
  message?: string;
  timestamp?: number;
}

interface Options {
  isSubmitting?: () => boolean;
  pendingMessage?: string;
  failedMessage?: string;
}

export function useWritebackStatus(options: Options = {}) {
  const waitingWritebackFeedback = ref(false);
  const pendingWritebackRequestId = ref('');
  const pendingWritebackMessage = ref('');
  const lastWritebackFeedback = ref<WritebackFeedbackPayload | null>(null);

  const isWritebackBusy = computed(() => Boolean(options.isSubmitting?.()) || waitingWritebackFeedback.value);
  const submitButtonText = computed(() => {
    if (options.isSubmitting?.()) return '提交中...';
    if (waitingWritebackFeedback.value) return '等待 HIS 回执...';
    return '一键回写';
  });
  const writebackBannerTone = computed<'info' | 'error'>(() => {
    if (waitingWritebackFeedback.value) return 'info';
    if (lastWritebackFeedback.value?.status === 'failed') return 'error';
    return 'info';
  });
  const writebackBannerText = computed(() => {
    if (waitingWritebackFeedback.value) {
      return pendingWritebackMessage.value || options.pendingMessage || '病历已发送至 HIS，等待处理结果回执。';
    }
    if (lastWritebackFeedback.value?.status === 'failed') {
      return lastWritebackFeedback.value.message || options.failedMessage || 'HIS 回写失败，请根据提示修改后重试。';
    }
    return '';
  });

  function clearLastFeedback(): void {
    lastWritebackFeedback.value = null;
  }

  function resetWritebackState(): void {
    waitingWritebackFeedback.value = false;
    pendingWritebackRequestId.value = '';
    pendingWritebackMessage.value = '';
    lastWritebackFeedback.value = null;
  }

  function markWritebackPending(requestId: string, message?: string): void {
    pendingWritebackRequestId.value = requestId;
    pendingWritebackMessage.value = message || options.pendingMessage || '病历已发送至 HIS，等待处理结果回执。';
    waitingWritebackFeedback.value = true;
  }

  function applyWritebackFeedback(payload: WritebackFeedbackPayload): WritebackFeedbackPayload | null {
    if (!pendingWritebackRequestId.value || payload.requestId !== pendingWritebackRequestId.value) {
      return null;
    }

    const safePayload: WritebackFeedbackPayload = {
      ...payload,
      action: payload.referenceType || payload.action || 'batch',
      referenceType: payload.referenceType || payload.action || 'batch',
      timestamp: payload.timestamp || Date.now(),
    };
    lastWritebackFeedback.value = safePayload;
    waitingWritebackFeedback.value = false;
    pendingWritebackRequestId.value = '';
    pendingWritebackMessage.value = '';
    return safePayload;
  }

  return {
    waitingWritebackFeedback,
    pendingWritebackRequestId,
    pendingWritebackMessage,
    lastWritebackFeedback,
    isWritebackBusy,
    submitButtonText,
    writebackBannerTone,
    writebackBannerText,
    clearLastFeedback,
    resetWritebackState,
    markWritebackPending,
    applyWritebackFeedback,
  };
}

export type WritebackStatus = ReturnType<typeof useWritebackStatus>;
