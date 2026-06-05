import { feedbackService } from './feedback';
import { trackBusinessOperation } from './operationTracker';
import { trackFeatureUsage, type FeatureCode } from './featureUsageTracker';

export type AiTraceChannel = 'chat' | 'speech_transcribe' | 'speech_realtime';

export interface AiTraceContext {
  traceId: string;
  channel: AiTraceChannel;
  scene?: string;
  sourceModule?: string;
  operationModule?: string;
  operationAction?: string;
  title?: string;
  sessionId?: string | null;
  configProfile?: string;
  model?: string;
  requestSummary?: string;
  requestPayload?: unknown;
  responseSummary?: string;
  responsePayload?: unknown;
  success?: boolean;
  errorMessage?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  updatedAt: number;
}

interface BeginAiTraceInput {
  channel: AiTraceChannel;
  scene?: string;
  sourceModule?: string;
  operationModule?: string;
  operationAction?: string;
  title?: string;
  configProfile?: string;
  model?: string;
  requestSummary?: string;
  requestPayload?: unknown;
}

interface FinishAiTraceInput {
  responseSummary?: string;
  responsePayload?: unknown;
  success?: boolean;
  errorMessage?: string;
  finishedAt?: number;
}

const STORAGE_KEY = 'LATEST_AI_TRACE_HISTORY';
const MAX_HISTORY = 20;

let traceHistory: AiTraceContext[] | null = null;

function ensureHistoryLoaded(): AiTraceContext[] {
  if (traceHistory) {
    return traceHistory;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    traceHistory = raw ? JSON.parse(raw) as AiTraceContext[] : [];
  } catch {
    traceHistory = [];
  }

  return traceHistory;
}

function persistHistory(): void {
  const history = ensureHistoryLoaded()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_HISTORY);
  traceHistory = history;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function upsertTrace(context: AiTraceContext): AiTraceContext {
  const history = ensureHistoryLoaded();
  const index = history.findIndex(item => item.traceId === context.traceId);
  if (index >= 0) {
    history.splice(index, 1, context);
  } else {
    history.unshift(context);
  }
  persistHistory();
  return context;
}

export function beginAiTrace(input: BeginAiTraceInput): AiTraceContext {
  const startedAt = Date.now();
  const context: AiTraceContext = {
    traceId: crypto.randomUUID(),
    channel: input.channel,
    scene: input.scene,
    sourceModule: input.sourceModule,
    operationModule: input.operationModule,
    operationAction: input.operationAction,
    title: input.title,
    sessionId: feedbackService.getCurrentSessionId(),
    configProfile: input.configProfile,
    model: input.model,
    requestSummary: input.requestSummary,
    requestPayload: input.requestPayload,
    startedAt,
    updatedAt: startedAt,
  };
  return upsertTrace(context);
}

export function updateAiTraceRequestPayload(
  traceId: string,
  requestPayload: unknown,
  requestSummary?: string
): AiTraceContext | null {
  const history = ensureHistoryLoaded();
  const matched = history.find(item => item.traceId === traceId);
  if (!matched) {
    return null;
  }
  const updatedAt = Date.now();
  return upsertTrace({
    ...matched,
    requestSummary: requestSummary ?? matched.requestSummary,
    requestPayload,
    updatedAt,
  });
}

export function finishAiTrace(traceId: string, input: FinishAiTraceInput): AiTraceContext | null {
  const history = ensureHistoryLoaded();
  const matched = history.find(item => item.traceId === traceId);
  if (!matched) {
    return null;
  }

  const finishedAt = input.finishedAt || Date.now();
  const next: AiTraceContext = {
    ...matched,
    responseSummary: input.responseSummary ?? matched.responseSummary,
    responsePayload: input.responsePayload ?? matched.responsePayload,
    success: input.success,
    errorMessage: input.errorMessage,
    finishedAt,
    durationMs: finishedAt - matched.startedAt,
    updatedAt: finishedAt,
  };
  const stored = upsertTrace(next);
  trackBusinessOperation({
    module: stored.operationModule || 'ai_proxy',
    action: stored.operationAction || stored.channel,
    title: stored.title || `AI 调用：${stored.operationAction || stored.channel}`,
    sourceModule: stored.sourceModule || 'llm',
    scene: stored.scene,
    operationType: 'api_call',
    operationName: stored.operationAction || stored.channel,
    success: stored.success !== false,
    durationMs: stored.durationMs,
    details: {
      traceId: stored.traceId,
      channel: stored.channel,
      scene: stored.scene,
      sourceModule: stored.sourceModule,
      model: stored.model,
      configProfile: stored.configProfile,
      requestSummary: stored.requestSummary,
      requestPayload: stored.requestPayload,
      responseSummary: stored.responseSummary,
      responsePayload: stored.responsePayload,
      errorMessage: stored.errorMessage,
    },
  });
  trackFeatureUsageFromAiTrace(stored);
  return stored;
}

export function failAiTrace(traceId: string, errorMessage: string): AiTraceContext | null {
  return finishAiTrace(traceId, {
    success: false,
    errorMessage,
    responseSummary: errorMessage,
    responsePayload: { errorMessage },
  });
}

export function getLatestAiTrace(): AiTraceContext | null {
  const history = ensureHistoryLoaded();
  return history.length > 0 ? history[0] : null;
}

export function getRecentAiTraces(): AiTraceContext[] {
  return [...ensureHistoryLoaded()];
}

function featureCodeForTrace(context: AiTraceContext): FeatureCode | null {
  switch (context.operationAction) {
    case 'stream_reply':
      return context.scene === 'chat-stream' ? 'chat' : null;
    case 'build_report_interpretation':
      return 'report_interpretation';
    default:
      return null;
  }
}

function trackFeatureUsageFromAiTrace(context: AiTraceContext): void {
  if (context.success === false) return;

  const featureCode = featureCodeForTrace(context);
  if (!featureCode) return;

  trackFeatureUsage({
    featureCode,
    eventAction: context.operationAction || context.channel,
    idempotencyKey: `ai:${context.traceId}`,
    traceId: context.traceId,
    sessionId: context.sessionId,
    sourceModule: context.sourceModule,
    scene: context.scene,
    status: 'success',
    payload: {
      channel: context.channel,
      operationModule: context.operationModule,
      configProfile: context.configProfile,
      model: context.model,
      durationMs: context.durationMs,
    },
    timestamp: context.finishedAt || context.updatedAt,
  });
}
