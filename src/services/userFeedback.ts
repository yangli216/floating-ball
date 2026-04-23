import { getLatestAiTrace } from './aiTrace';
import { isRegionalMode, regionalPost } from './regionalClient';

export interface UserFeedbackScreenshot {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface SubmitUserFeedbackPayload {
  score: number;
  comment: string;
  screenshot?: UserFeedbackScreenshot | null;
  sourceModule?: string;
}

interface SubmitUserFeedbackRequest {
  sessionId?: string | null;
  traceId?: string;
  sourceModule: string;
  score: number;
  comment: string;
  screenshot?: UserFeedbackScreenshot | null;
  chainContext?: Record<string, unknown>;
}

export interface SubmitUserFeedbackResponse {
  feedbackId: string;
  status: string;
}

function normalizeComment(value: string): string {
  return value.trim();
}

export async function submitUserFeedback(
  payload: SubmitUserFeedbackPayload
): Promise<SubmitUserFeedbackResponse> {
  if (!isRegionalMode()) {
    throw new Error('当前仅区域化模式支持提交后台反馈');
  }

  if (!Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5) {
    throw new Error('评分必须在 1 到 5 分之间');
  }

  const comment = normalizeComment(payload.comment);
  if (!comment) {
    throw new Error('请填写反馈说明');
  }

  const latestTrace = getLatestAiTrace();
  const request: SubmitUserFeedbackRequest = {
    sessionId: latestTrace?.sessionId || null,
    traceId: latestTrace?.traceId,
    sourceModule: payload.sourceModule || 'settings_feedback',
    score: payload.score,
    comment,
    screenshot: payload.screenshot || null,
    chainContext: latestTrace ? {
      channel: latestTrace.channel,
      scene: latestTrace.scene,
      sourceModule: latestTrace.sourceModule,
      configProfile: latestTrace.configProfile,
      model: latestTrace.model,
      requestSummary: latestTrace.requestSummary,
      responseSummary: latestTrace.responseSummary,
      startedAt: latestTrace.startedAt,
      finishedAt: latestTrace.finishedAt,
      durationMs: latestTrace.durationMs,
      success: latestTrace.success,
      errorMessage: latestTrace.errorMessage,
    } : undefined,
  };

  return regionalPost<SubmitUserFeedbackResponse>('/v1/client/feedbacks', request);
}
