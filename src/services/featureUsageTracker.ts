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
  /** Legacy input only; ignored and never persisted or uploaded. */
  idempotencyKey?: string;
  /** Legacy input only; kept in the call shape for compatibility and discarded. */
  traceId?: string;
  /** Legacy input only; kept in the call shape for compatibility and discarded. */
  sessionId?: string | null;
  sourceModule?: string;
  scene?: string;
  status?: 'success' | 'failure';
  doctorId?: string | null;
  doctorWorkNo?: string | null;
  doctorName?: string | null;
  deptId?: string | null;
  deptName?: string | null;
  hisOrgId?: string | null;
  hisOrgName?: string | null;
  /** Legacy input only; ignored and never persisted or uploaded. */
  payload?: Record<string, unknown>;
  timestamp?: number;
}

interface FeatureUsageEvent extends FeatureUsageDraft {
  eventId: string;
  idempotencyKey: string;
  clientVersion?: string;
  timestamp: number;
}

interface FeatureEventBatchResponse {
  accepted: number;
  skipped: number;
  rejected: number;
  rejections: FeatureEventRejection[];
}

interface FeatureEventRejection {
  index: number;
  eventId: string;
  featureCode: string;
  reason: string;
}

export interface FeatureUsageRejectionDiagnostic {
  eventId: string;
  featureCode: FeatureCode;
  index: number;
  reason: string;
  rejectedAt: number;
}

const QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_QUEUE';
const REJECTION_QUEUE_KEY = 'REGIONAL_FEATURE_USAGE_REJECTION_QUEUE';
const BATCH_SIZE = 50;
const UPLOAD_INTERVAL = 30_000;
const ENQUEUE_FLUSH_DELAY = 800;
const MAX_QUEUE_SIZE = 1000;
const MAX_REJECTION_QUEUE_SIZE = 100;
const MAX_REJECTION_REASON_LENGTH = 256;
const EVENT_ID_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const TELEMETRY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FEATURE_CODES = new Set<FeatureCode>([
  'voice_consultation',
  'smart_consultation',
  'report_interpretation',
  'chat',
  'diagnosis_checklist',
  'diagnosis_recommendation',
  'medication_recommendation',
  'examination_recommendation',
  'lab_test_recommendation',
  'procedure_recommendation',
  'treatment_plan_recommendation',
  'knowledge_usage',
]);
const SAFE_REJECTION_REASONS = new Set([
  '事件不能为空',
  'featureCode 不能为空',
  'featureCode 不支持',
  'eventId 必须为 UUID',
]);

let eventQueue: FeatureUsageEvent[] = [];
let rejectionQueue: FeatureUsageRejectionDiagnostic[] = [];
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let flushSoonTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<number> | null = null;
let inFlightBatchSize = 0;
let queueLoaded = false;
let rejectionQueueLoaded = false;
let currentClientVersion: string | undefined;

function loadQueue(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    eventQueue = Array.isArray(parsed)
      ? parsed
        .map(sanitizeQueuedEvent)
        .filter((event): event is FeatureUsageEvent => Boolean(event))
      : [];
  } catch {
    eventQueue = [];
  }
  queueLoaded = true;
  if (!persistQueue()) {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch {
      console.warn('[FeatureUsageTracker] Failed to remove an unsanitized queue snapshot');
    }
  }
}

function loadRejectionQueue(): void {
  try {
    const raw = localStorage.getItem(REJECTION_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    rejectionQueue = Array.isArray(parsed)
      ? parsed
        .map(normalizeRejectionDiagnostic)
        .filter((item): item is FeatureUsageRejectionDiagnostic => Boolean(item))
        .slice(-MAX_REJECTION_QUEUE_SIZE)
      : [];
  } catch {
    rejectionQueue = [];
  }
  rejectionQueueLoaded = true;
  if (!persistRejectionQueue()) {
    try {
      localStorage.removeItem(REJECTION_QUEUE_KEY);
    } catch {
      console.warn('[FeatureUsageTracker] Failed to remove an unsanitized rejection snapshot');
    }
  }
}

function ensureQueueLoaded(): void {
  if (!queueLoaded) {
    loadQueue();
  }
}

function ensureRejectionQueueLoaded(): void {
  if (!rejectionQueueLoaded) {
    loadRejectionQueue();
  }
}

export function sanitizeFeatureUsageStorage(): void {
  ensureQueueLoaded();
  ensureRejectionQueueLoaded();
}

function persistQueue(): boolean {
  try {
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      const protectedCount = Math.min(inFlightBatchSize, eventQueue.length, MAX_QUEUE_SIZE);
      eventQueue = [
        ...eventQueue.slice(0, protectedCount),
        ...eventQueue.slice(protectedCount).slice(-(MAX_QUEUE_SIZE - protectedCount)),
      ];
      console.warn('[FeatureUsageTracker] Pending queue reached its capacity; oldest non-uploading events were dropped');
    }
    eventQueue = eventQueue
      .map(sanitizeQueuedEvent)
      .filter((event): event is FeatureUsageEvent => Boolean(event));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(eventQueue));
    return true;
  } catch {
    console.warn('[FeatureUsageTracker] Failed to save queue');
    return false;
  }
}

function saveQueue(): void {
  ensureQueueLoaded();
  persistQueue();
}

function persistRejectionQueue(): boolean {
  try {
    const boundedQueue = rejectionQueue.slice(-MAX_REJECTION_QUEUE_SIZE);
    localStorage.setItem(REJECTION_QUEUE_KEY, JSON.stringify(boundedQueue));
    rejectionQueue = boundedQueue;
    return true;
  } catch {
    console.warn('[FeatureUsageTracker] Failed to save rejection diagnostics');
    return false;
  }
}

function saveRejectionQueue(): boolean {
  ensureRejectionQueueLoaded();
  return persistRejectionQueue();
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

function normalizeClientVersion(value: unknown): string | undefined {
  const version = normalizeText(value);
  return version && version.toLowerCase() !== 'unknown' ? version : undefined;
}

function normalizeTelemetryCode(value: unknown, maxLength: number): string | undefined {
  const code = normalizeText(value);
  if (!code || code.length > maxLength || !TELEMETRY_CODE_PATTERN.test(code)) {
    return undefined;
  }
  return code;
}

export function setFeatureUsageClientVersion(version: string | null | undefined): void {
  currentClientVersion = normalizeClientVersion(version);
}

function randomId(): string {
  return crypto.randomUUID();
}

function buildEventIdempotencyKey(featureCode: FeatureCode, eventId: string): string {
  return `${featureCode}:event:${eventId}`;
}

function normalizeRejectionDiagnostic(value: unknown): FeatureUsageRejectionDiagnostic | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const eventId = normalizeText(record.eventId);
  const featureCode = isFeatureCode(record.featureCode) ? record.featureCode : undefined;
  const rawReason = normalizeText(record.reason);
  const rejectedAt = typeof record.rejectedAt === 'number' && Number.isFinite(record.rejectedAt)
    ? record.rejectedAt
    : null;
  if (
    !eventId
    || !EVENT_ID_PATTERN.test(eventId)
    || !featureCode
    || !isNonNegativeInteger(record.index)
    || !rawReason
    || rejectedAt === null
  ) {
    return null;
  }
  return {
    eventId: eventId.toLowerCase(),
    featureCode,
    index: record.index,
    reason: SAFE_REJECTION_REASONS.has(rawReason) ? rawReason : '事件被服务端拒绝',
    rejectedAt,
  };
}

function isFeatureCode(value: unknown): value is FeatureCode {
  return typeof value === 'string' && FEATURE_CODES.has(value as FeatureCode);
}

function sanitizeQueuedEvent(value: unknown): FeatureUsageEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (!isFeatureCode(event.featureCode)) return null;

  const sourceModule = normalizeTelemetryCode(event.sourceModule, 128);
  let eventId = normalizeText(event.eventId) || randomId();
  if (!EVENT_ID_PATTERN.test(eventId)) {
    eventId = randomId();
  }
  eventId = eventId.toLowerCase();
  const eventAction = normalizeTelemetryCode(event.eventAction, 128);
  const timestamp = typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) && event.timestamp > 0
    ? event.timestamp
    : Date.now();
  const idempotencyKey = buildEventIdempotencyKey(event.featureCode, eventId);

  return {
    eventId,
    featureCode: event.featureCode,
    eventAction,
    idempotencyKey,
    sourceModule,
    scene: normalizeTelemetryCode(event.scene, 256),
    status: event.status === 'failure' ? 'failure' : 'success',
    doctorId: normalizeText(event.doctorId),
    doctorWorkNo: normalizeText(event.doctorWorkNo),
    doctorName: normalizeText(event.doctorName),
    deptId: normalizeText(event.deptId),
    deptName: normalizeText(event.deptName),
    hisOrgId: normalizeText(event.hisOrgId),
    hisOrgName: normalizeText(event.hisOrgName),
    clientVersion: normalizeClientVersion(event.clientVersion),
    timestamp,
  };
}

function toRequestEvent(event: FeatureUsageEvent) {
  const actor = getFeedbackActor();

  return {
    eventId: event.eventId,
    featureCode: event.featureCode,
    eventAction: event.eventAction,
    idempotencyKey: event.idempotencyKey,
    sourceModule: event.sourceModule,
    scene: event.scene,
    status: event.status || 'success',
    doctorId: event.doctorId ?? actor.doctorId,
    doctorWorkNo: event.doctorWorkNo ?? actor.doctorWorkNo,
    doctorName: event.doctorName ?? actor.doctorName,
    deptId: event.deptId ?? actor.deptId,
    deptName: event.deptName ?? actor.deptName,
    hisOrgId: event.hisOrgId ?? actor.hisOrgId,
    hisOrgName: event.hisOrgName ?? actor.orgName,
    clientVersion: event.clientVersion ?? currentClientVersion,
    timestamp: event.timestamp,
  };
}

export function trackFeatureUsage(draft: FeatureUsageDraft): void {
  ensureQueueLoaded();

  const eventId = randomId();
  const actor = getFeedbackActor();
  const sourceModule = normalizeTelemetryCode(draft.sourceModule, 128);
  const event: FeatureUsageEvent = {
    eventId,
    featureCode: draft.featureCode,
    idempotencyKey: buildEventIdempotencyKey(draft.featureCode, eventId),
    eventAction: normalizeTelemetryCode(draft.eventAction, 128),
    sourceModule,
    scene: normalizeTelemetryCode(draft.scene, 256),
    doctorId: normalizeText(draft.doctorId ?? actor.doctorId),
    doctorWorkNo: normalizeText(draft.doctorWorkNo ?? actor.doctorWorkNo),
    doctorName: normalizeText(draft.doctorName ?? actor.doctorName),
    deptId: normalizeText(draft.deptId ?? actor.deptId),
    deptName: normalizeText(draft.deptName ?? actor.deptName),
    hisOrgId: normalizeText(draft.hisOrgId ?? actor.hisOrgId),
    hisOrgName: normalizeText(draft.hisOrgName ?? actor.orgName),
    clientVersion: currentClientVersion,
    status: draft.status === 'failure' ? 'failure' : 'success',
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
    inFlightBatchSize = batch.length;

    try {
      const response = await regionalPost<FeatureEventBatchResponse>('/v1/client/feature-events/batch', {
        events: batch.map(toRequestEvent),
      });

      const settlement = validateBatchResponse(response, batch);
      if (!settlement) {
        console.warn('[FeatureUsageTracker] Malformed batch response; keeping the entire batch for retry');
        return 0;
      }

      if (settlement.rejected.length > 0) {
        ensureRejectionQueueLoaded();
        const previousRejectionQueue = [...rejectionQueue];
        const rejectedEventIds = new Set(settlement.rejected.map(item => item.eventId));
        rejectionQueue = rejectionQueue
          .filter(item => !rejectedEventIds.has(item.eventId))
          .concat(settlement.rejected);
        if (!saveRejectionQueue()) {
          rejectionQueue = previousRejectionQueue;
          console.warn('[FeatureUsageTracker] Rejection diagnostics were not persisted; keeping the entire batch for retry');
          return 0;
        }
      }

      eventQueue = eventQueue.slice(batch.length);
      saveQueue();

      if (eventQueue.length > 0) {
        scheduleFlushSoon();
      }

      console.log(
        `[FeatureUsageTracker] Settled ${batch.length} events `
        + `(accepted=${response.accepted}, skipped=${response.skipped}, rejected=${response.rejected}), `
        + `remaining: ${eventQueue.length}`
      );
      return response.accepted + response.skipped;
    } catch {
      console.warn('[FeatureUsageTracker] Batch upload failed');
      return 0;
    } finally {
      inFlightBatchSize = 0;
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateBatchResponse(
  response: FeatureEventBatchResponse,
  batch: FeatureUsageEvent[],
): { rejected: FeatureUsageRejectionDiagnostic[] } | null {
  if (
    !response
    || !isNonNegativeInteger(response.accepted)
    || !isNonNegativeInteger(response.skipped)
    || !isNonNegativeInteger(response.rejected)
    || !Array.isArray(response.rejections)
    || response.accepted + response.skipped + response.rejected !== batch.length
    || response.rejections.length !== response.rejected
  ) {
    return null;
  }

  const rejectedIndexes = new Set<number>();
  const rejected: FeatureUsageRejectionDiagnostic[] = [];
  for (const rejection of response.rejections) {
    if (!rejection || !isNonNegativeInteger(rejection.index) || rejection.index >= batch.length) {
      return null;
    }
    if (rejectedIndexes.has(rejection.index)) {
      return null;
    }

    const event = batch[rejection.index];
    const rawReason = normalizeText(rejection.reason)?.slice(0, MAX_REJECTION_REASON_LENGTH);
    if (
      !event
      || normalizeText(rejection.eventId) !== event.eventId
      || normalizeText(rejection.featureCode) !== event.featureCode
      || !rawReason
    ) {
      return null;
    }

    rejectedIndexes.add(rejection.index);
    rejected.push({
      eventId: event.eventId,
      featureCode: event.featureCode,
      index: rejection.index,
      reason: SAFE_REJECTION_REASONS.has(rawReason) ? rawReason : '事件被服务端拒绝',
      rejectedAt: Date.now(),
    });
  }

  return { rejected };
}

export function startFeatureUsageUploader(): void {
  stopFeatureUsageUploader();
  sanitizeFeatureUsageStorage();

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

export function getFeatureUsageRejectionDiagnostics(): FeatureUsageRejectionDiagnostic[] {
  ensureRejectionQueueLoaded();
  return rejectionQueue.map(item => ({ ...item }));
}
