import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { DiagnosisPathPayload } from '../services/diagnosisPath';
import type { DiagnosisPathOption } from '../types/consultationAssist';

interface DiagnosisPathCacheEntry {
  sessionKey: string;
  targetKey: string;
  candidateSignature: string;
  payload: DiagnosisPathPayload;
  cachedAt: string;
}

function normalizeDiagnosisPathKeyPart(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildDiagnosisPathCacheKey(sessionKey: string, targetKey: string): string {
  return `${normalizeDiagnosisPathKeyPart(sessionKey)}::${normalizeDiagnosisPathKeyPart(targetKey)}`;
}

export const useDiagnosisPathStore = defineStore('diagnosisPath', () => {
  const diagnosisPathCache = ref<Record<string, DiagnosisPathCacheEntry>>({});

  function resolveDiagnosisPathSessionKey(source?: Record<string, unknown> | null): string {
    const sourceId = normalizeDiagnosisPathKeyPart(
      source?.idPi || source?.patientId || source?.id
    );
    if (sourceId) {
      return `patient:${sourceId}`;
    }

    const fallbackParts = [
      normalizeDiagnosisPathKeyPart(source?.naPi || source?.name),
      normalizeDiagnosisPathKeyPart(source?.birthday),
      normalizeDiagnosisPathKeyPart(source?.ageText),
      normalizeDiagnosisPathKeyPart(source?.sdSexText || source?.gender),
    ].filter(Boolean);

    return fallbackParts.length > 0 ? `patient:${fallbackParts.join('|')}` : 'patient:anonymous';
  }

  function resolveDiagnosisPathTargetKey(
    option?: Pick<DiagnosisPathOption, 'title' | 'code' | 'description' | 'meta'> | null
  ): string {
    if (!option) {
      return 'target:unknown';
    }

    const code = normalizeDiagnosisPathKeyPart(option.code);
    const title = normalizeDiagnosisPathKeyPart(option.title);
    const description = normalizeDiagnosisPathKeyPart(option.description);
    const primary = code || title || description || 'target';

    return [primary, title && title !== primary ? title : ''].filter(Boolean).join('|');
  }

  function resolveDiagnosisPathCandidateSignature(options: DiagnosisPathOption[]): string {
    return options
      .map((option) =>
        [
          normalizeDiagnosisPathKeyPart(option.code),
          normalizeDiagnosisPathKeyPart(option.title),
          normalizeDiagnosisPathKeyPart(option.description),
          normalizeDiagnosisPathKeyPart(option.meta),
          normalizeDiagnosisPathKeyPart(option.caption),
          option.matched ? '1' : '0',
        ].join('::')
      )
      .sort()
      .join('||');
  }

  function getDiagnosisPathCache(
    sessionKey: string,
    targetKey: string,
    candidateSignature: string
  ): DiagnosisPathPayload | null {
    const cacheKey = buildDiagnosisPathCacheKey(sessionKey, targetKey);
    const entry = diagnosisPathCache.value[cacheKey];

    if (!entry || entry.candidateSignature !== candidateSignature) {
      return null;
    }

    return entry.payload;
  }

  function setDiagnosisPathCache(
    sessionKey: string,
    targetKey: string,
    candidateSignature: string,
    payload: DiagnosisPathPayload
  ): void {
    const cacheKey = buildDiagnosisPathCacheKey(sessionKey, targetKey);
    diagnosisPathCache.value = {
      ...diagnosisPathCache.value,
      [cacheKey]: {
        sessionKey,
        targetKey,
        candidateSignature,
        payload,
        cachedAt: new Date().toISOString(),
      },
    };
  }

  function clearDiagnosisPathCache(): void {
    diagnosisPathCache.value = {};
  }

  return {
    diagnosisPathCache,
    resolveDiagnosisPathSessionKey,
    resolveDiagnosisPathTargetKey,
    resolveDiagnosisPathCandidateSignature,
    getDiagnosisPathCache,
    setDiagnosisPathCache,
    clearDiagnosisPathCache,
  };
});
