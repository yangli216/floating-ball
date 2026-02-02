import { feedbackService } from './feedback';
import type { TargetType, FeedbackType } from '../types/feedback';

/**
 * 操作追踪工具层 - 封装 feedbackService 的便捷方法
 * 所有函数 fire-and-forget，不影响主流程
 */

/** 视图切换 */
export function trackViewChange(from: string, to: string, details?: Record<string, any>) {
  feedbackService.logOperation({
    operationType: 'view_change',
    operationName: `navigate:${from}->${to}`,
    details: { from, to, ...details },
    success: true,
  });
}

/** 按钮点击 */
export function trackClick(name: string, details?: Record<string, any>) {
  feedbackService.logOperation({
    operationType: 'button_click',
    operationName: name,
    details,
    success: true,
  });
}

/** 表单提交 */
export function trackFormSubmit(name: string, details?: Record<string, any>, durationMs?: number) {
  feedbackService.logOperation({
    operationType: 'form_submit',
    operationName: name,
    details,
    success: true,
    durationMs,
  });
}

/** API 调用 */
export function trackApiCall(name: string, success: boolean, durationMs?: number, details?: Record<string, any>) {
  feedbackService.logOperation({
    operationType: 'api_call',
    operationName: name,
    details,
    success,
    durationMs,
  });
}

/** 错误捕获 */
export function trackError(name: string, error: unknown, details?: Record<string, any>) {
  feedbackService.logOperation({
    operationType: 'error',
    operationName: name,
    details: {
      ...details,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
    },
    success: false,
  });
}

/** AI 推荐接受/拒绝/修改 */
export function trackRecommendationAction(
  targetType: TargetType,
  targetId: string,
  action: FeedbackType,
  options?: {
    originalValue?: string;
    modifiedValue?: string;
    reason?: string;
    rating?: number;
  }
) {
  const sessionId = feedbackService.getCurrentSessionId();
  if (!sessionId) return;

  feedbackService.saveFeedback({
    sessionId,
    targetType,
    targetId,
    feedbackType: action,
    originalValue: options?.originalValue,
    modifiedValue: options?.modifiedValue,
    reason: options?.reason,
    rating: options?.rating,
  });
}

/** 计时操作 - 返回结束函数 */
export function startTimedOperation(name: string): (success?: boolean, details?: Record<string, any>) => void {
  const start = Date.now();
  return (success = true, details?: Record<string, any>) => {
    const durationMs = Date.now() - start;
    feedbackService.logOperation({
      operationType: 'api_call',
      operationName: name,
      details: { ...details, durationMs },
      success,
      durationMs,
    });
  };
}
