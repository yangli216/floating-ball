/**
 * 审计事件批量上报服务
 *
 * 审计事件通过此服务直接上报到 floating-ball-server。
 * 本地只保留轻量离线队列，供失败或断网时自动重传。
 */
import { regionalPost } from './regionalClient';

// ─── 类型定义 ─────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  eventType: 'operation' | 'feedback' | 'metric' | 'session';
  payload: Record<string, unknown>;
  timestamp: number;
  uploaded?: boolean;
}

// ─── 配置 ──────────────────────────────────────────────────────────────────

const QUEUE_KEY = 'REGIONAL_AUDIT_QUEUE';
const BATCH_SIZE = 50;
const UPLOAD_INTERVAL = 30_000; // 30 秒
const ENQUEUE_FLUSH_DELAY = 800; // 入队后短暂合并，再异步立即尝试上报
const MAX_QUEUE_SIZE = 1000; // 防止 localStorage 溢出

// ─── 事件队列 ──────────────────────────────────────────────────────────────

let eventQueue: AuditEvent[] = [];
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let flushSoonTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<number> | null = null;
let queueLoaded = false;

function loadQueue(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw) {
      eventQueue = JSON.parse(raw);
    }
  } catch { eventQueue = []; }
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
    // 限制队列大小
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      eventQueue = eventQueue.slice(-MAX_QUEUE_SIZE);
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(eventQueue));
  } catch (err) {
    console.warn('[AuditUploader] Failed to save queue:', err);
  }
}

function scheduleFlushSoon(): void {
  if (flushSoonTimer) return;

  flushSoonTimer = setTimeout(() => {
    flushSoonTimer = null;
    void flushAuditEvents();
  }, ENQUEUE_FLUSH_DELAY);
}

function clearScheduledFlush(): void {
  if (flushSoonTimer) {
    clearTimeout(flushSoonTimer);
    flushSoonTimer = null;
  }
}

// ─── 入队 ──────────────────────────────────────────────────────────────────

/**
 * 将审计事件加入上报队列
 */
export function enqueueAuditEvent(
  eventType: AuditEvent['eventType'],
  payload: Record<string, unknown>
): void {
  ensureQueueLoaded();

  eventQueue.push({
    id: crypto.randomUUID(),
    eventType,
    payload,
    timestamp: Date.now(),
  });

  saveQueue();
  scheduleFlushSoon();
}

// ─── 批量上报 ──────────────────────────────────────────────────────────────

/**
 * 立即执行一次批量上报
 */
export async function flushAuditEvents(): Promise<number> {
  ensureQueueLoaded();
  if (eventQueue.length === 0) return 0;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const batch = eventQueue.slice(0, BATCH_SIZE);

    try {
      await regionalPost<{ accepted: number }>('/v1/client/audit/events/batch', {
        events: batch.map(e => ({
          eventId: e.id,
          eventType: e.eventType,
          payload: e.payload,
          timestamp: e.timestamp,
        })),
      });

      // 上报成功，移除已上报事件
      const uploadedIds = new Set(batch.map(e => e.id));
      eventQueue = eventQueue.filter(e => !uploadedIds.has(e.id));
      saveQueue();

      if (eventQueue.length > 0) {
        scheduleFlushSoon();
      }

      console.log(`[AuditUploader] Flushed ${batch.length} events, remaining: ${eventQueue.length}`);
      return batch.length;
    } catch (err) {
      console.warn('[AuditUploader] Batch upload failed:', err);
      return 0;
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

// ─── 定时上报 ──────────────────────────────────────────────────────────────

/**
 * 启动定时上报（由 regionalClient 初始化时调用）
 */
export function startAuditUploader(): void {
  stopAuditUploader();
  ensureQueueLoaded();

  uploadTimer = setInterval(async () => {
    await flushAuditEvents();
  }, UPLOAD_INTERVAL);

  // 启动后先尝试补传上次遗留和当前已缓存的事件，避免必须等待下一个周期。
  void flushAuditEvents();

  console.log(`[AuditUploader] Started, interval=${UPLOAD_INTERVAL}ms, pending=${eventQueue.length}`);
}

/**
 * 停止定时上报
 */
export function stopAuditUploader(): void {
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
  clearScheduledFlush();
}

/**
 * 获取当前队列长度（调试用）
 */
export function getQueueSize(): number {
  ensureQueueLoaded();
  return eventQueue.length;
}
