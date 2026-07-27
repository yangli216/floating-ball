import { emitTo, listen } from '@tauri-apps/api/event';
import type { TcdVisitForm } from '../types';
import {
  CHRONIC_DISEASE_SAVE_REQUEST_EVENT,
  CHRONIC_DISEASE_SAVE_RESULT_EVENT,
  MAIN_WINDOW_LABEL,
  type ChronicDiseaseSaveRequest,
  type ChronicDiseaseSaveResult,
} from './chronicDiseaseWindowContract';

const SAVE_TIMEOUT_MS = 30_000;

function createRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `chronic-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveTcdForm(form: TcdVisitForm): Promise<unknown> {
  const requestId = createRequestId();
  let resolveResult!: (value: unknown) => void;
  let rejectResult!: (reason: Error) => void;
  const resultPromise = new Promise<unknown>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const unlisten = await listen<ChronicDiseaseSaveResult>(
    CHRONIC_DISEASE_SAVE_RESULT_EVENT,
    (event) => {
      if (event.payload.requestId !== requestId) return;
      if (event.payload.ok) {
        resolveResult(event.payload.data);
        return;
      }
      rejectResult(new Error(event.payload.error));
    },
  );
  const timeout = globalThis.setTimeout(() => {
    rejectResult(new Error('两慢病随访保存超时，请重试'));
  }, SAVE_TIMEOUT_MS);

  try {
    const request: ChronicDiseaseSaveRequest = {
      requestId,
      form,
    };
    await emitTo(MAIN_WINDOW_LABEL, CHRONIC_DISEASE_SAVE_REQUEST_EVENT, request);
    return await resultPromise;
  } finally {
    globalThis.clearTimeout(timeout);
    unlisten();
  }
}
