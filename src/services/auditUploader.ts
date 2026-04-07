/**
 * 审计事件批量上报服务
 *
 * 区域化模式下，操作日志和性能指标在本地 SQLite 写入后，
 * 通过此服务异步批量上报到 core-service。
 * 支持离线队列和网络恢复后自动重传。
 */
import { isRegionalMode, regionalPost } from './regionalClient';

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
const MAX_QUEUE_SIZE = 1000; // 防止 localStorage 溢出

// ─── 事件队列 ──────────────────────────────────────────────────────────────

let eventQueue: AuditEvent[] = [];
let uploadTimer: ReturnType<typeof setInterval> | null = null;

function loadQueue(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw) {
      eventQueue = JSON.parse(raw);
    }
  } catch { eventQueue = []; }
}

function saveQueue(): void {
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

// ─── 入队 ──────────────────────────────────────────────────────────────────

/**
 * 将审计事件加入上报队列
 */
export function enqueueAuditEvent(
  eventType: AuditEvent['eventType'],
  payload: Record<string, unknown>
): void {
  if (!isRegionalMode()) return;

  eventQueue.push({
    id: crypto.randomUUID(),
    eventType,
    payload,
    timestamp: Date.now(),
  });

  saveQueue();
}

// ─── 批量上报 ──────────────────────────────────────────────────────────────

/**
 * 立即执行一次批量上报
 */
export async function flushAuditEvents(): Promise<number> {
  if (!isRegionalMode() || eventQueue.length === 0) return 0;

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

    console.log(`[AuditUploader] Flushed ${batch.length} events, remaining: ${eventQueue.length}`);
    return batch.length;
  } catch (err) {
    console.warn('[AuditUploader] Batch upload failed:', err);
    return 0;
  }
}

// ─── 定时上报 ──────────────────────────────────────────────────────────────

/**
 * 启动定时上报（由 regionalClient 初始化时调用）
 */
export function startAuditUploader(): void {
  stopAuditUploader();
  loadQueue();

  uploadTimer = setInterval(async () => {
    await flushAuditEvents();
  }, UPLOAD_INTERVAL);

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
}

/**
 * 获取当前队列长度（调试用）
 */
export function getQueueSize(): number {
  return eventQueue.length;
}
