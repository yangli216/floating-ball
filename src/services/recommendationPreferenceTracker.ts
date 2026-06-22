import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { getLatestAiTrace } from './aiTrace';
import { getFeedbackActor } from './feedbackContext';
import { getCachedBootstrap, isRegionalMode, regionalPost } from './regionalClient';

export type RecommendationPreferenceType = 'diagnosis' | 'medicine' | 'exam' | 'lab_test' | 'procedure';
export type RecommendationPreferenceAction = 'final_select' | 'manual_match' | 'confirm_match';
type TreatmentPreferenceType = Extract<RecommendationPreferenceType, TreatmentRecommendation['type']>;

export interface RecommendationPreferenceContext {
  consultationId?: string;
  sessionId?: string | null;
  sourceModule?: string;
  scene?: string;
  traceId?: string | null;
}

interface RecommendationPreferenceDraft {
  recommendationType: RecommendationPreferenceType;
  action: RecommendationPreferenceAction;
  itemKey: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  selected?: boolean;
  primary?: boolean;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

interface RecommendationPreferenceEvent extends RecommendationPreferenceDraft {
  eventId: string;
  idempotencyKey: string;
  consultationId?: string;
  sessionId?: string | null;
  sourceModule?: string;
  scene?: string;
  traceId?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  deptId?: string | null;
  deptName?: string | null;
  promptVersion?: string;
  templateVersion?: string;
  modelVersion?: string;
  timestamp: number;
}

interface RecommendationPreferenceBatchResponse {
  accepted: number;
  skipped: number;
  rejected: number;
}

export interface RecommendationPreferenceRankCandidate {
  recommendationType: RecommendationPreferenceType;
  itemKey: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  originalRank: number;
}

interface RecommendationPreferenceRankResponse {
  enabled: boolean;
  recommendationType: RecommendationPreferenceType;
  items: Array<{
    itemKey: string;
    preferenceScore: number;
    boost: number;
    scope: string;
    reason: string;
  }>;
}

const QUEUE_KEY = 'REGIONAL_RECOMMENDATION_PREFERENCE_QUEUE';
const BATCH_SIZE = 50;
const UPLOAD_INTERVAL = 30_000;
const ENQUEUE_FLUSH_DELAY = 800;
const MAX_QUEUE_SIZE = 1000;

let eventQueue: RecommendationPreferenceEvent[] = [];
let queueLoaded = false;
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let flushSoonTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<number> | null = null;

function loadQueue(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    eventQueue = raw ? JSON.parse(raw) as RecommendationPreferenceEvent[] : [];
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
  } catch (error) {
    console.warn('[RecommendationPreferenceTracker] Failed to save queue', error);
  }
}

function isCollectionEnabled(): boolean {
  if (!isRegionalMode()) return false;
  return getCachedBootstrap()?.features?.recommendationPreferenceCollection !== false;
}

function isRerankEnabled(): boolean {
  if (!isRegionalMode()) return false;
  return getCachedBootstrap()?.features?.recommendationPreferenceRerank === true;
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

function compactPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const compact = Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function scheduleFlushSoon(): void {
  if (!isCollectionEnabled() || flushSoonTimer) return;
  flushSoonTimer = setTimeout(() => {
    flushSoonTimer = null;
    void flushRecommendationPreferenceEvents();
  }, ENQUEUE_FLUSH_DELAY);
}

function clearScheduledFlush(): void {
  if (flushSoonTimer) {
    clearTimeout(flushSoonTimer);
    flushSoonTimer = null;
  }
}

function buildIdempotencyKey(event: RecommendationPreferenceEvent): string {
  return [
    'recommendation-preference',
    event.consultationId || event.sessionId || event.traceId || 'unknown',
    event.recommendationType,
    event.action,
    event.itemKey,
    event.eventId,
  ].join(':');
}

function enrichEvent(draft: RecommendationPreferenceDraft, context: RecommendationPreferenceContext): RecommendationPreferenceEvent {
  const actor = getFeedbackActor();
  const trace = getLatestAiTrace();
  const bootstrap = getCachedBootstrap();
  const eventId = crypto.randomUUID();
  const event: RecommendationPreferenceEvent = {
    ...draft,
    eventId,
    idempotencyKey: '',
    consultationId: normalizeText(context.consultationId),
    sessionId: normalizeText(context.sessionId),
    sourceModule: normalizeText(context.sourceModule),
    scene: normalizeText(context.scene),
    traceId: normalizeText(context.traceId) || trace?.traceId || undefined,
    doctorId: actor.doctorId,
    doctorName: actor.doctorName,
    deptId: actor.deptId,
    deptName: actor.deptName,
    promptVersion: bootstrap?.promptVersion,
    templateVersion: bootstrap?.templateVersion,
    modelVersion: trace?.model || bootstrap?.llm?.model,
    timestamp: draft.timestamp || Date.now(),
  };
  event.idempotencyKey = buildIdempotencyKey(event);
  return event;
}

function enqueuePreferenceEvent(draft: RecommendationPreferenceDraft, context: RecommendationPreferenceContext): void {
  if (!isCollectionEnabled() || !draft.itemKey) return;
  ensureQueueLoaded();
  eventQueue.push(enrichEvent(draft, context));
  saveQueue();
  scheduleFlushSoon();
}

function toRequestEvent(event: RecommendationPreferenceEvent) {
  return {
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    recommendationType: event.recommendationType,
    action: event.action,
    itemKey: event.itemKey,
    itemId: event.itemId,
    itemCode: event.itemCode,
    itemName: event.itemName,
    selected: event.selected,
    primary: event.primary,
    traceId: event.traceId || undefined,
    consultationId: event.consultationId,
    sessionId: event.sessionId || undefined,
    sourceModule: event.sourceModule,
    scene: event.scene,
    doctorId: event.doctorId,
    doctorName: event.doctorName,
    deptId: event.deptId,
    deptName: event.deptName,
    promptVersion: event.promptVersion,
    templateVersion: event.templateVersion,
    modelVersion: event.modelVersion,
    payload: compactPayload(event.payload),
    timestamp: event.timestamp,
  };
}

export async function flushRecommendationPreferenceEvents(): Promise<number> {
  ensureQueueLoaded();
  if (!isCollectionEnabled() || eventQueue.length === 0) return 0;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const batch = eventQueue.slice(0, BATCH_SIZE);
    try {
      await regionalPost<RecommendationPreferenceBatchResponse>('/v1/client/recommendation-preferences/events/batch', {
        events: batch.map(toRequestEvent),
      });
      const uploadedIds = new Set(batch.map(event => event.eventId));
      eventQueue = eventQueue.filter(event => !uploadedIds.has(event.eventId));
      saveQueue();
      if (eventQueue.length > 0) {
        scheduleFlushSoon();
      }
      return batch.length;
    } catch (error) {
      console.warn('[RecommendationPreferenceTracker] Batch upload failed', error);
      return 0;
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

export function startRecommendationPreferenceUploader(): void {
  stopRecommendationPreferenceUploader();
  ensureQueueLoaded();

  uploadTimer = setInterval(async () => {
    await flushRecommendationPreferenceEvents();
  }, UPLOAD_INTERVAL);

  void flushRecommendationPreferenceEvents();
}

export function stopRecommendationPreferenceUploader(): void {
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
  clearScheduledFlush();
}

export function buildDiagnosisPreferenceCandidate(
  diagnosis: Diagnosis,
  originalRank = 0,
): RecommendationPreferenceRankCandidate | null {
  const id = normalizeText(diagnosis.id);
  const code = normalizeText(diagnosis.code);
  const itemKey = id ? `diagnosis:${id}` : code ? `diagnosis-code:${code}` : '';
  if (!itemKey) return null;
  return {
    recommendationType: 'diagnosis',
    itemKey,
    itemId: id,
    itemCode: code,
    itemName: normalizeText(diagnosis.name),
    originalRank,
  };
}

export function buildTreatmentPreferenceCandidate(
  treatment: TreatmentRecommendation,
  originalRank = 0,
): RecommendationPreferenceRankCandidate | null {
  if (!isSupportedTreatmentType(treatment.type)) return null;
  const matched = treatment.matchedItem || treatment.suggestedMatchItem;
  const itemId = normalizeText(matched?.id) || normalizeText(matched?.idSrv);
  if (!itemId) return null;
  const itemKey = `order:${treatment.type}:${itemId}`;
  return {
    recommendationType: treatment.type,
    itemKey,
    itemId,
    itemCode: normalizeText(matched?.code) || normalizeText(matched?.sdSrv),
    itemName: normalizeText(matched?.name) || normalizeText(treatment.name),
    originalRank,
  };
}

function isSupportedTreatmentType(type: TreatmentRecommendation['type']): type is TreatmentPreferenceType {
  return type === 'medicine' || type === 'exam' || type === 'lab_test' || type === 'procedure';
}

export function trackFinalRecommendationPreferences(options: {
  diagnoses?: Diagnosis[];
  primaryDiagnosis?: Diagnosis | null;
  treatments?: TreatmentRecommendation[];
  context: RecommendationPreferenceContext;
}): void {
  const primaryKey = options.primaryDiagnosis ? buildDiagnosisPreferenceCandidate(options.primaryDiagnosis)?.itemKey : '';
  options.diagnoses?.forEach((diagnosis, index) => {
    const candidate = buildDiagnosisPreferenceCandidate(diagnosis, index);
    if (!candidate) return;
    enqueuePreferenceEvent({
      ...candidate,
      action: 'final_select',
      selected: true,
      primary: candidate.itemKey === primaryKey,
      payload: { rate: diagnosis.rate, isTCM: diagnosis.isTCM },
    }, options.context);
  });

  options.treatments?.filter(treatment => treatment.selected).forEach((treatment, index) => {
    const candidate = buildTreatmentPreferenceCandidate(treatment, index);
    if (!candidate) return;
    enqueuePreferenceEvent({
      ...candidate,
      action: 'final_select',
      selected: !!treatment.selected,
      payload: {
        matchStatus: treatment.matchStatus,
        manualMatched: treatment.manualMatched,
        originalName: treatment.originalName,
      },
    }, options.context);
  });
}

export function trackTreatmentMatchPreference(
  treatment: TreatmentRecommendation,
  action: Extract<RecommendationPreferenceAction, 'manual_match' | 'confirm_match'>,
  context: RecommendationPreferenceContext,
): void {
  const candidate = buildTreatmentPreferenceCandidate(treatment);
  if (!candidate) return;
  enqueuePreferenceEvent({
    ...candidate,
    action,
    selected: !!treatment.selected,
    payload: {
      matchStatus: treatment.matchStatus,
      manualMatched: treatment.manualMatched,
      originalName: treatment.originalName,
    },
  }, context);
}

export async function applyRecommendationPreferenceRanking<T>(
  items: T[],
  getCandidate: (item: T, index: number) => RecommendationPreferenceRankCandidate | null,
  context: RecommendationPreferenceContext,
): Promise<T[]> {
  if (!isRerankEnabled() || items.length < 2) {
    return items;
  }

  const indexedItems = items.map((item, index) => ({
    item,
    index,
    candidate: getCandidate(item, index),
  }));
  const candidates = indexedItems
    .map(entry => entry.candidate)
    .filter((item): item is RecommendationPreferenceRankCandidate => !!item);
  if (candidates.length < 2) {
    return items;
  }

  const type = candidates[0].recommendationType;
  if (!candidates.every(candidate => candidate.recommendationType === type)) {
    return items;
  }

  const actor = getFeedbackActor();
  try {
    const response = await regionalPost<RecommendationPreferenceRankResponse>('/v1/client/recommendation-preferences/rank', {
      recommendationType: type,
      scene: context.scene,
      doctorId: actor.doctorId,
      deptId: actor.deptId,
      candidates: candidates.map(candidate => ({
        itemKey: candidate.itemKey,
        itemId: candidate.itemId,
        itemCode: candidate.itemCode,
        itemName: candidate.itemName,
        originalRank: candidate.originalRank,
      })),
    });
    if (!response.enabled || !response.items.length) {
      return items;
    }
    const boostMap = new Map(response.items.map(item => [item.itemKey, item.boost || 0]));
    return [...indexedItems].sort((left, right) => {
      const leftBoost = left.candidate ? boostMap.get(left.candidate.itemKey) || 0 : 0;
      const rightBoost = right.candidate ? boostMap.get(right.candidate.itemKey) || 0 : 0;
      const leftRankScore = left.index - leftBoost;
      const rightRankScore = right.index - rightBoost;
      if (Math.abs(leftRankScore - rightRankScore) > 0.0001) {
        return leftRankScore - rightRankScore;
      }
      return left.index - right.index;
    }).map(entry => entry.item);
  } catch (error) {
    console.warn('[RecommendationPreferenceTracker] Ranking failed', error);
    return items;
  }
}
