/**
 * 辅诊功能调用事件上报服务
 *
 * 这个入口只记录“用户实际调用了一次产品功能”的统计事实。
 * 审计日志仍由 auditUploader / operationTracker 负责，不能反向用于功能调用次数。
 */
import { getFeedbackActor } from './feedbackContext';
import { regionalPost } from './regionalClient';

export type FeatureCode =
  | 'voice_consultation'
  | 'smart_consultation'
  | 'report_interpretation'
  | 'chat'
  | 'diagnosis_checklist'
  | 'diagnosis_recommendation'
  | 'medication_recommendation'
  | 'examination_recommendation'
  | 'lab_test_recommendation'
  | 'procedure_recommendation'
  | 'treatment_plan_recommendation'
  | 'knowledge_usage';

export interface FeatureUsageDraft {
  featureCode: FeatureCode;
  eventAction?: string;
  idempotencyKey?: string;
  traceId?: string;
  consultationId?: string;
  sessionId?: string | null;
  sourceModule?: string;
  scene?: string;
  status?: 'success' | 'failure';
  doctorId?: string | null;
  doctorName?: string | null;
  deptId?: string | null;
  deptName?: string | null;
  hisOrgId?: string | null;
  hisOrgName?: string | null;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

interface FeatureUsageEvent extends FeatureUsageDraft {
  eventId: string;
  timestamp: number;
}

interface FeatureEventBatchResponse {
  accepted: number;
  skipped: number;
}

const QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_QUEUE';
const BATCH_SIZE = 50;
const UPLOAD_INTERVAL = 30_000;
const ENQUEUE_FLUSH_DELAY = 800;
const MAX_QUEUE_SIZE = 1000;

let eventQueue: FeatureUsageEvent[] = [];
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let flushSoonTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<number> | null = null;
let queueLoaded = false;

function loadQueue(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    eventQueue = raw ? JSON.parse(raw) as FeatureUsageEvent[] : [];
  } catch {
    eventQueue = [];
  }
  queueLoaded = true;
}

function ensureQueueLoaded(): void {
  if (!queueLoaded) {
    loadQueue();
  }
}

function saveQueue(): void {
  ensureQueueLoaded();
  try {
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      eventQueue = eventQueue.slice(-MAX_QUEUE_SIZE);
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(eventQueue));
  } catch (err) {
    console.warn('[FeatureUsageTracker] Failed to save queue:', err);
  }
}

function scheduleFlushSoon(): void {
  if (flushSoonTimer) return;

  flushSoonTimer = setTimeout(() => {
    flushSoonTimer = null;
    void flushFeatureUsageEvents();
  }, ENQUEUE_FLUSH_DELAY);
}

function clearScheduledFlush(): void {
  if (flushSoonTimer) {
    clearTimeout(flushSoonTimer);
    flushSoonTimer = null;
  }
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function randomId(): string {
  return crypto.randomUUID();
}

function buildIdempotencyKey(draft: FeatureUsageDraft, eventId: string): string {
  return `${draft.featureCode}:${draft.eventAction || 'invoke'}:${draft.traceId || eventId}`;
}

function normalizePayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) return undefined;

  const compact = Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  return Object.keys(compact).length > 0 ? compact : undefined;
}

function toRequestEvent(event: FeatureUsageEvent) {
  const actor = getFeedbackActor();

  return {
    eventId: event.eventId,
    featureCode: event.featureCode,
    eventAction: event.eventAction,
    idempotencyKey: event.idempotencyKey,
    traceId: event.traceId,
    consultationId: event.consultationId,
    sessionId: event.sessionId || undefined,
    sourceModule: event.sourceModule,
    scene: event.scene,
    status: event.status || 'success',
    doctorId: event.doctorId ?? actor.doctorId,
    doctorName: event.doctorName ?? actor.doctorName,
    deptId: event.deptId ?? actor.deptId,
    deptName: event.deptName ?? actor.deptName,
    hisOrgId: event.hisOrgId ?? actor.hisOrgId,
    hisOrgName: event.hisOrgName ?? actor.orgName,
    payload: normalizePayload(event.payload),
    timestamp: event.timestamp,
  };
}

export function trackFeatureUsage(draft: FeatureUsageDraft): void {
  ensureQueueLoaded();

  const eventId = randomId();
  const actor = getFeedbackActor();
  const event: FeatureUsageEvent = {
    ...draft,
    eventId,
    idempotencyKey: normalizeText(draft.idempotencyKey) || buildIdempotencyKey(draft, eventId),
    eventAction: normalizeText(draft.eventAction),
    traceId: normalizeText(draft.traceId),
    consultationId: normalizeText(draft.consultationId),
    sessionId: normalizeText(draft.sessionId),
    sourceModule: normalizeText(draft.sourceModule),
    scene: normalizeText(draft.scene),
    hisOrgId: normalizeText(draft.hisOrgId ?? actor.hisOrgId),
    hisOrgName: normalizeText(draft.hisOrgName ?? actor.orgName),
    timestamp: draft.timestamp || Date.now(),
  };

  eventQueue.push(event);
  saveQueue();
  scheduleFlushSoon();
}

export async function flushFeatureUsageEvents(): Promise<number> {
  ensureQueueLoaded();
  if (eventQueue.length === 0) return 0;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const batch = eventQueue.slice(0, BATCH_SIZE);

    try {
      await regionalPost<FeatureEventBatchResponse>('/v1/client/feature-events/batch', {
        events: batch.map(toRequestEvent),
      });

      const uploadedIds = new Set(batch.map(event => event.eventId));
      eventQueue = eventQueue.filter(event => !uploadedIds.has(event.eventId));
      saveQueue();

      if (eventQueue.length > 0) {
        scheduleFlushSoon();
      }

      console.log(`[FeatureUsageTracker] Flushed ${batch.length} events, remaining: ${eventQueue.length}`);
      return batch.length;
    } catch (err) {
      console.warn('[FeatureUsageTracker] Batch upload failed:', err);
      return 0;
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

export function startFeatureUsageUploader(): void {
  stopFeatureUsageUploader();
  ensureQueueLoaded();

  uploadTimer = setInterval(async () => {
    await flushFeatureUsageEvents();
  }, UPLOAD_INTERVAL);

  void flushFeatureUsageEvents();
  console.log(`[FeatureUsageTracker] Started, interval=${UPLOAD_INTERVAL}ms, pending=${eventQueue.length}`);
}

export function stopFeatureUsageUploader(): void {
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
  clearScheduledFlush();
}

export function getFeatureUsageQueueSize(): number {
  ensureQueueLoaded();
  return eventQueue.length;
}
