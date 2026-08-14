import { ref, watch } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  buildDiagnosisChecklistCacheKey,
  buildDiagnosisChecklistMismatchError,
  normalizeDiagnosisChecklistItems,
  parseDiagnosisChecklistResponse,
  type DiagnosisChecklistItem,
} from '@features/clinical-result';

export interface ClinicalResultDiagnosisChecklistRequest {
  diagnosisName: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export type DiagnosisChecklistPrefetchState =
  | 'idle'
  | 'loading'
  | 'clear'
  | 'ready'
  | 'risk'
  | 'error';

export interface DiagnosisChecklistPrefetchStatus {
  state: DiagnosisChecklistPrefetchState;
  itemCount: number;
}

export interface DiagnosisChecklistPreview {
  state: DiagnosisChecklistPrefetchState;
  items: DiagnosisChecklistItem[];
  message: string;
}

export interface ClinicalResultDiagnosisChecklistOptions {
  getConsultationId: () => string;
  getPrimaryDiagnosis: () => Diagnosis | null;
  getChiefComplaint: () => string;
  getHistoryOfPresentIllness: () => string;
  request: (input: ClinicalResultDiagnosisChecklistRequest) => Promise<string>;
  formatError: (error: unknown) => string;
  notify?: (message: string, type?: string) => void;
}

interface DiagnosisChecklistSnapshot {
  key: string;
  diagnosis: Diagnosis;
  request: ClinicalResultDiagnosisChecklistRequest;
}

interface DiagnosisChecklistCacheEntry {
  status: Exclude<DiagnosisChecklistPrefetchState, 'idle'>;
  items: DiagnosisChecklistItem[];
  error: string;
  promise?: Promise<void>;
}

const IDLE_STATUS: DiagnosisChecklistPrefetchStatus = { state: 'idle', itemCount: 0 };
const IDLE_PREVIEW: DiagnosisChecklistPreview = { state: 'idle', items: [], message: '' };

export function useClinicalResultDiagnosisChecklist(
  options: ClinicalResultDiagnosisChecklistOptions,
) {
  const floatingChecklistKey = ref('');
  const cacheRevision = ref(0);
  const cache = new Map<string, DiagnosisChecklistCacheEntry>();
  const dismissedKeys = new Set<string>();
  const riskNotifiedKeys = new Set<string>();

  function buildSnapshot(diagnosis: Diagnosis): DiagnosisChecklistSnapshot {
    const request = {
      diagnosisName: diagnosis.name,
      chiefComplaint: options.getChiefComplaint(),
      historyOfPresentIllness: options.getHistoryOfPresentIllness(),
    };
    return {
      key: buildDiagnosisChecklistCacheKey({
        consultationId: options.getConsultationId(),
        diagnosisIdentity: diagnosis.id || diagnosis.code || diagnosis.name,
        ...request,
      }),
      diagnosis,
      request,
    };
  }

  function isRequestable(snapshot: DiagnosisChecklistSnapshot): boolean {
    return Boolean(
      snapshot.request.diagnosisName.trim()
      && snapshot.request.chiefComplaint.trim()
      && snapshot.request.historyOfPresentIllness.trim(),
    );
  }

  function isCurrentPrimary(snapshot: DiagnosisChecklistSnapshot): boolean {
    const current = options.getPrimaryDiagnosis();
    return Boolean(current && buildSnapshot(current).key === snapshot.key);
  }

  function finishEntry(snapshot: DiagnosisChecklistSnapshot, entry: DiagnosisChecklistCacheEntry): void {
    cache.set(snapshot.key, entry);
    cacheRevision.value += 1;
    const isPrimary = isCurrentPrimary(snapshot);
    if (entry.status === 'risk' && isPrimary && !riskNotifiedKeys.has(snapshot.key)) {
      riskNotifiedKeys.add(snapshot.key);
      options.notify?.('发现需要优先确认的诊断鉴别风险，请复核当前诊断。', 'warning');
    }
    if (
      isPrimary
      && (entry.status === 'ready' || entry.status === 'risk')
      && !dismissedKeys.has(snapshot.key)
    ) {
      floatingChecklistKey.value = snapshot.key;
    }
  }

  function requestChecklist(
    snapshot: DiagnosisChecklistSnapshot,
    force = false,
  ): Promise<void> {
    const existing = cache.get(snapshot.key);
    if (!force && existing?.promise) return existing.promise;
    if (!force && existing && ['clear', 'ready', 'risk'].includes(existing.status)) {
      return Promise.resolve();
    }

    const loadingEntry: DiagnosisChecklistCacheEntry = {
      status: 'loading',
      items: existing?.items || [],
      error: '',
    };
    const promise = options.request(snapshot.request)
      .then((response) => {
        const parsed = parseDiagnosisChecklistResponse(response);
        const mismatchError = buildDiagnosisChecklistMismatchError(parsed);
        const items = normalizeDiagnosisChecklistItems(parsed);
        finishEntry(snapshot, {
          status: mismatchError ? 'risk' : items.length > 0 ? 'ready' : 'clear',
          items: mismatchError ? [] : items,
          error: mismatchError,
        });
      })
      .catch((error: unknown) => {
        finishEntry(snapshot, {
          status: 'error',
          items: existing?.items || [],
          error: options.formatError(error),
        });
      });
    loadingEntry.promise = promise;
    cache.set(snapshot.key, loadingEntry);
    cacheRevision.value += 1;
    return promise;
  }

  function closeDiagnosisChecklist(diagnosis?: Diagnosis): void {
    const key = diagnosis ? buildSnapshot(diagnosis).key : floatingChecklistKey.value;
    if (!key) return;
    dismissedKeys.add(key);
    if (floatingChecklistKey.value === key) floatingChecklistKey.value = '';
  }

  async function prefetchDiagnosisChecklist(diagnosis: Diagnosis): Promise<void> {
    const snapshot = buildSnapshot(diagnosis);
    if (!isRequestable(snapshot)) return;
    await requestChecklist(snapshot);
  }

  async function openDiagnosisChecklist(diagnosis: Diagnosis): Promise<void> {
    const snapshot = buildSnapshot(diagnosis);
    if (!isRequestable(snapshot)) {
      options.notify?.('当前缺少诊断、主诉或现病史，无法生成鉴别排查建议。', 'warning');
      return;
    }

    dismissedKeys.delete(snapshot.key);
    floatingChecklistKey.value = snapshot.key;
    const existing = cache.get(snapshot.key);
    if (existing?.status === 'clear') {
      floatingChecklistKey.value = '';
      options.notify?.('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
      return;
    }
    if (existing && ['ready', 'risk'].includes(existing.status)) return;

    await requestChecklist(snapshot, existing?.status === 'error');
    const resolved = cache.get(snapshot.key);
    if (resolved?.status === 'clear' && floatingChecklistKey.value === snapshot.key) {
      floatingChecklistKey.value = '';
      options.notify?.('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
    } else if (resolved?.status === 'error' && floatingChecklistKey.value === snapshot.key) {
      options.notify?.(resolved.error, 'error');
    }
  }

  function isDiagnosisChecklistOpen(diagnosis: Diagnosis): boolean {
    return floatingChecklistKey.value === buildSnapshot(diagnosis).key;
  }

  function getDiagnosisChecklistStatus(diagnosis: Diagnosis): DiagnosisChecklistPrefetchStatus {
    void cacheRevision.value;
    const entry = cache.get(buildSnapshot(diagnosis).key);
    return entry ? { state: entry.status, itemCount: entry.items.length } : IDLE_STATUS;
  }

  function getDiagnosisChecklistPreview(diagnosis: Diagnosis): DiagnosisChecklistPreview {
    void cacheRevision.value;
    const entry = cache.get(buildSnapshot(diagnosis).key);
    if (!entry) return IDLE_PREVIEW;
    return {
      state: entry.status,
      items: [...entry.items],
      message: entry.error,
    };
  }

  watch(
    () => {
      const diagnosis = options.getPrimaryDiagnosis();
      return diagnosis ? buildSnapshot(diagnosis).key : '';
    },
    () => {
      const diagnosis = options.getPrimaryDiagnosis();
      if (!diagnosis) {
        floatingChecklistKey.value = '';
        return;
      }
      const currentKey = buildSnapshot(diagnosis).key;
      if (floatingChecklistKey.value && floatingChecklistKey.value !== currentKey) {
        floatingChecklistKey.value = '';
      }
      void prefetchDiagnosisChecklist(diagnosis);
    },
  );

  return {
    floatingChecklistKey,
    closeDiagnosisChecklist,
    getDiagnosisChecklistPreview,
    getDiagnosisChecklistStatus,
    isDiagnosisChecklistOpen,
    openDiagnosisChecklist,
    prefetchDiagnosisChecklist,
  };
}

export type ClinicalResultDiagnosisChecklist = ReturnType<typeof useClinicalResultDiagnosisChecklist>;
