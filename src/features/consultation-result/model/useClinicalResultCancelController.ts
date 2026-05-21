import { ref } from 'vue';

export type ClinicalResultCancelNotify = (message: string, type?: string) => void;

export interface ClinicalResultCancelControllerOptions {
  isSubmitting?: () => boolean;
  isWaitingWritebackFeedback?: () => boolean;
  notify?: ClinicalResultCancelNotify;
  onConfirm: () => void;
}

export function useClinicalResultCancelController(options: ClinicalResultCancelControllerOptions) {
  const showCancelConfirm = ref(false);

  function handleCancelClick(): void {
    if (options.isSubmitting?.()) {
      options.notify?.('正在提交中，请稍候', 'info');
      return;
    }

    if (options.isWaitingWritebackFeedback?.()) {
      options.notify?.('正在等待 HIS 回执，请先等待处理结果。', 'info');
      return;
    }

    showCancelConfirm.value = true;
  }

  function closeCancelConfirm(): void {
    showCancelConfirm.value = false;
  }

  function confirmCancel(): void {
    showCancelConfirm.value = false;
    options.onConfirm();
  }

  return {
    showCancelConfirm,
    handleCancelClick,
    closeCancelConfirm,
    confirmCancel,
  };
}

export type ClinicalResultCancelController = ReturnType<typeof useClinicalResultCancelController>;
