import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseType,
  ChronicDiseaseWindowKind,
  ChronicDiseaseWindowPayload,
} from '../types';
import { isChronicFollowUpEligible } from '../lib/chronicDiseaseEligibility';
import { CHRONIC_DISEASE_WINDOW_LABEL } from './chronicDiseaseWindowContract';

const WINDOW_LABEL = CHRONIC_DISEASE_WINDOW_LABEL;
const WINDOW_URL = 'index.html?window=chronic-disease';
export const CHRONIC_DISEASE_WINDOW_UPDATE_EVENT = 'chronic-disease:update';
export const CHRONIC_DISEASE_WINDOW_READY_EVENT = 'chronic-disease:ready';
const READY_TIMEOUT_MS = 8_000;
const RETRY_DELAYS = [0, 120, 320] as const;

function createRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `chronic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

async function createReadyWaiter(expectedLabel: string): Promise<{
  wait: () => Promise<void>;
  cancel: () => void;
}> {
  let settled = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const unlisten = await listen<{ label?: string }>(CHRONIC_DISEASE_WINDOW_READY_EVENT, (event) => {
    if (event.payload?.label !== expectedLabel) return;
    settled = true;
    resolveReady();
  });
  const cleanup = () => {
    unlisten();
    if (settled) return;
    settled = true;
    resolveReady();
  };
  return {
    wait: async () => {
      try {
        await withTimeout(ready, READY_TIMEOUT_MS, '慢病业务窗口初始化超时，请关闭后重试。');
      } finally {
        cleanup();
      }
    },
    cancel: cleanup,
  };
}

async function ensureWindow(): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL);
  if (existing) return existing;

  const readyWaiter = await createReadyWaiter(WINDOW_LABEL);
  const created = new WebviewWindow(WINDOW_LABEL, {
    url: WINDOW_URL,
    title: '慢病管理',
    decorations: false,
    width: 1080,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    resizable: true,
    center: true,
    focus: true,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        action();
      };
      void created.once('tauri://created', () => finish(resolve));
      void created.once('tauri://error', (event) => finish(() => reject(new Error(String(event.payload || '慢病业务窗口创建失败')))));
    });
    await readyWaiter.wait();
  } catch (error) {
    readyWaiter.cancel();
    throw error;
  }
  return created;
}

export async function closeChronicDiseaseWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL);
  if (!existing) return;
  try {
    await existing.close();
  } catch (error) {
    console.warn('[ChronicDiseaseWindow] Unable to close stale patient window, hiding it instead:', error);
    await existing.hide();
  }
}

async function emitWithRetry<T>(target: WebviewWindow, payload: T): Promise<void> {
  let lastError: unknown = null;
  for (const delay of RETRY_DELAYS) {
    if (delay > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
    }
    try {
      await target.emit(CHRONIC_DISEASE_WINDOW_UPDATE_EVENT, payload);
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
}

export async function openChronicDiseaseWindow(input: {
  kind: ChronicDiseaseWindowKind;
  summary: ChronicDiseasePatientSummary;
  diseaseType?: ChronicDiseaseType;
}): Promise<ChronicDiseaseWindowPayload> {
  if (!input.summary.patientId) {
    throw new Error('缺少患者标识，无法打开慢病业务窗口。');
  }
  if (!input.summary.hasSupportedDisease) {
    throw new Error('当前患者未识别为高血压或 2 型糖尿病对象。');
  }
  if (input.kind === 'follow-up' && !isChronicFollowUpEligible(input.summary)) {
    throw new Error('当前患者缺少明确公卫管理身份，不能打开正式慢病随访。');
  }

  const payload: ChronicDiseaseWindowPayload = {
    requestId: createRequestId(),
    kind: input.kind,
    diseaseType: input.kind === 'follow-up' ? undefined : input.diseaseType,
    patientAnchor: `${input.summary.patientId}:${input.summary.visitId || '-'}`,
    summary: input.summary,
    openedAt: new Date().toISOString(),
  };
  const target = await ensureWindow();
  await target.show();
  await emitWithRetry(target, payload);
  try {
    await target.setFocus();
  } catch (error) {
    console.warn('[ChronicDiseaseWindow] Unable to focus window:', error);
  }
  return payload;
}
