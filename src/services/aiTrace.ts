import { feedbackService } from './feedback';

export type AiTraceChannel = 'chat' | 'speech_transcribe' | 'speech_realtime';

export interface AiTraceContext {
  traceId: string;
  channel: AiTraceChannel;
  scene?: string;
  sourceModule?: string;
  sessionId?: string | null;
  configProfile?: string;
  model?: string;
  requestSummary?: string;
  responseSummary?: string;
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
  configProfile?: string;
  model?: string;
  requestSummary?: string;
}

interface FinishAiTraceInput {
  responseSummary?: string;
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
    sessionId: feedbackService.getCurrentSessionId(),
    configProfile: input.configProfile,
    model: input.model,
    requestSummary: input.requestSummary,
    startedAt,
    updatedAt: startedAt,
  };
  return upsertTrace(context);
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
    success: input.success,
    errorMessage: input.errorMessage,
    finishedAt,
    durationMs: finishedAt - matched.startedAt,
    updatedAt: finishedAt,
  };
  return upsertTrace(next);
}

export function failAiTrace(traceId: string, errorMessage: string): AiTraceContext | null {
  return finishAiTrace(traceId, {
    success: false,
    errorMessage,
    responseSummary: errorMessage,
  });
}

export function getLatestAiTrace(): AiTraceContext | null {
  const history = ensureHistoryLoaded();
  return history.length > 0 ? history[0] : null;
}

export function getRecentAiTraces(): AiTraceContext[] {
  return [...ensureHistoryLoaded()];
}
