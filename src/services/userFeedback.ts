import { getLatestAiTrace, type AiTraceContext } from './aiTrace';
import { regionalPost } from './regionalClient';
import { getFeedbackActor } from './feedbackContext';

export type FeedbackKind = 'general' | 'recommendation' | 'record_field' | 'session';
export type FeedbackSeverity = 'low' | 'medium' | 'high';

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
  /** 反馈类型，默认 'general' */
  kind?: FeedbackKind;
  /** 严重度，默认 'medium' */
  severity?: FeedbackSeverity;
  /** 问题标签 */
  tags?: string[];
  /** 是否包含医生修正（语音 record_field 反馈用） */
  hasCorrection?: boolean;
  /** 显式覆盖默认 chainContext，例如 voice payload 自带 aiTrace + diff */
  chainContextOverride?: Record<string, unknown>;
  /** 显式 traceId / sessionId（语音反馈带本身 trace） */
  traceId?: string | null;
  sessionId?: string | null;
}

interface SubmitUserFeedbackRequest {
  sessionId?: string | null;
  traceId?: string | null;
  sourceModule: string;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  doctorId?: string | null;
  doctorName?: string | null;
  orgName?: string | null;
  deptId?: string | null;
  deptName?: string | null;
  tags?: string[];
  hasCorrection?: boolean;
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

function buildDefaultChainContext(latestTrace: AiTraceContext | null | undefined): Record<string, unknown> | undefined {
  if (!latestTrace) {
    return undefined;
  }
  return {
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
  };
}

function mergeChainContext(
  latestTrace: AiTraceContext | null | undefined,
  override?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const base = buildDefaultChainContext(latestTrace);
  if (!base && !override) {
    return undefined;
  }

  return {
    ...(base || {}),
    ...(override || {}),
  };
}

export async function submitUserFeedback(
  payload: SubmitUserFeedbackPayload
): Promise<SubmitUserFeedbackResponse> {
  if (!Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5) {
    throw new Error('评分必须在 1 到 5 分之间');
  }

  const comment = normalizeComment(payload.comment);
  if (!comment) {
    throw new Error('请填写反馈说明');
  }

  const latestTrace = getLatestAiTrace();
  const actor = getFeedbackActor();

  const request: SubmitUserFeedbackRequest = {
    sessionId: payload.sessionId !== undefined ? payload.sessionId : (latestTrace?.sessionId || null),
    traceId: payload.traceId !== undefined ? payload.traceId : (latestTrace?.traceId || null),
    sourceModule: payload.sourceModule || 'settings_feedback',
    kind: payload.kind || 'general',
    severity: payload.severity || 'medium',
    doctorId: actor.doctorId,
    doctorName: actor.doctorName,
    orgName: actor.orgName,
    deptId: actor.deptId,
    deptName: actor.deptName,
    tags: payload.tags && payload.tags.length > 0 ? payload.tags : undefined,
    hasCorrection: payload.hasCorrection,
    score: payload.score,
    comment,
    screenshot: payload.screenshot || null,
    chainContext: mergeChainContext(latestTrace, payload.chainContextOverride),
  };

  return regionalPost<SubmitUserFeedbackResponse>('/v1/client/feedbacks', request);
}
