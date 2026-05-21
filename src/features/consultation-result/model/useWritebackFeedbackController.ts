import type { WritebackFeedbackPayload } from './useWritebackStatus';

export type WritebackFeedbackNotify = (message: string, type?: string) => void;

export interface WritebackFeedbackControllerOptions {
  applyFeedback: (payload: WritebackFeedbackPayload) => WritebackFeedbackPayload | null;
  notify?: WritebackFeedbackNotify;
  onSuccess?: (payload: WritebackFeedbackPayload) => void;
  onFailed?: (payload: WritebackFeedbackPayload) => void;
  successMessage?: string;
  failedMessage?: string;
}

export function useWritebackFeedbackController(options: WritebackFeedbackControllerOptions) {
  function applyWritebackFeedback(payload: WritebackFeedbackPayload): WritebackFeedbackPayload | null {
    const safePayload = options.applyFeedback(payload);
    if (!safePayload) {
      return null;
    }

    if (safePayload.status === 'success') {
      options.onSuccess?.(safePayload);
      options.notify?.(safePayload.message || options.successMessage || 'HIS 已完成回写。', 'success');
      return safePayload;
    }

    options.onFailed?.(safePayload);
    options.notify?.(safePayload.message || options.failedMessage || 'HIS 回写失败，请根据提示修改后重试。', 'error');
    return safePayload;
  }

  return {
    applyWritebackFeedback,
  };
}

export type WritebackFeedbackController = ReturnType<typeof useWritebackFeedbackController>;
