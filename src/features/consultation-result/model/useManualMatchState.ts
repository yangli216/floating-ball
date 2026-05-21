import { ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getManualMatchKey,
  getManualMatchSearchKey,
} from '@features/clinical-result';

export function useManualMatchState() {
  const activeManualMatchKey = ref<string | null>(null);
  const manualMatchKeywords = ref<Record<string, string>>({});

  function getManualMatchKeyword(rec: TreatmentRecommendation): string {
    const cached = manualMatchKeywords.value[getManualMatchSearchKey(rec)];
    return typeof cached === 'string' ? cached : rec.name;
  }

  function setManualMatchKeyword(rec: TreatmentRecommendation, value: string): void {
    manualMatchKeywords.value = {
      ...manualMatchKeywords.value,
      [getManualMatchSearchKey(rec)]: value,
    };
  }

  function isManualMatchOpen(rec: TreatmentRecommendation): boolean {
    return activeManualMatchKey.value === getManualMatchKey(rec);
  }

  function openManualMatch(rec: TreatmentRecommendation): void {
    activeManualMatchKey.value = getManualMatchKey(rec);
    setManualMatchKeyword(rec, getManualMatchKeyword(rec) || rec.name);
  }

  function closeManualMatch(): void {
    activeManualMatchKey.value = null;
  }

  function toggleManualMatch(rec: TreatmentRecommendation): void {
    if (isManualMatchOpen(rec)) {
      closeManualMatch();
      return;
    }
    openManualMatch(rec);
  }

  return {
    activeManualMatchKey,
    manualMatchKeywords,
    getManualMatchKeyword,
    setManualMatchKeyword,
    isManualMatchOpen,
    openManualMatch,
    closeManualMatch,
    toggleManualMatch,
  };
}

export type ManualMatchState = ReturnType<typeof useManualMatchState>;
