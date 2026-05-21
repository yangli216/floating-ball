/**
 * Treatment recommendation secondary selector state.
 *
 * Manages one active popover plus per-record search keywords for pharmacy,
 * exec dept, body site, and insurance fields. It does not filter options,
 * mutate recommendations, or trigger side effects.
 */

import { ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import { normalizeUsageKeyword } from '@/utils/medicalDictionaryHelpers';

export type SecondarySelectorField = 'pharmacy' | 'execDept' | 'bodySite' | 'insurance';

export interface SecondarySelectorFieldSpec {
  getCurrentValue: (rec: TreatmentRecommendation) => string;
}

interface Options {
  getEditorKey: (rec: TreatmentRecommendation) => string;
  fields: Record<SecondarySelectorField, SecondarySelectorFieldSpec>;
}

export function useSecondarySelector(options: Options) {
  const { getEditorKey, fields } = options;

  const activeKey = ref<string | null>(null);
  let keywordMaps: Record<SecondarySelectorField, Record<string, string>> = {
    pharmacy: {},
    execDept: {},
    bodySite: {},
    insurance: {},
  };

  function getKey(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    return `${getEditorKey(rec)}:${field}`;
  }

  function getSearchKey(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    return `${getEditorKey(rec)}:${field}-search`;
  }

  function isOpen(rec: TreatmentRecommendation, field: SecondarySelectorField): boolean {
    return activeKey.value === getKey(rec, field);
  }

  function syncKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
    const value = fields[field].getCurrentValue(rec) || '';
    keywordMaps[field][getSearchKey(rec, field)] = value;
  }

  function setKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField, value: string): void {
    keywordMaps[field][getSearchKey(rec, field)] = value;
  }

  function getKeyword(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
    const cached = keywordMaps[field][getSearchKey(rec, field)];
    if (typeof cached === 'string') return cached;
    return fields[field].getCurrentValue(rec) || '';
  }

  function handleInput(rec: TreatmentRecommendation, field: SecondarySelectorField, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    setKeyword(rec, field, target?.value || '');
  }

  function open(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
    activeKey.value = getKey(rec, field);
    syncKeyword(rec, field);
  }

  function close(rec: TreatmentRecommendation, field: SecondarySelectorField, event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const nextTarget = event.relatedTarget as Node | null;
    if (container && nextTarget && container.contains(nextTarget)) return;
    syncKeyword(rec, field);
    if (isOpen(rec, field)) {
      activeKey.value = null;
    }
  }

  function closeAll(): void {
    activeKey.value = null;
  }

  function resetAll(): void {
    activeKey.value = null;
    keywordMaps = {
      pharmacy: {},
      execDept: {},
      bodySite: {},
      insurance: {},
    };
  }

  function resolveFilterKeyword(keyword: string, currentValue?: string): string {
    const normalizedKeyword = normalizeUsageKeyword(keyword);
    if (!normalizedKeyword) return '';
    const normalizedCurrent = normalizeUsageKeyword((currentValue || '').trim());
    if (normalizedCurrent && normalizedKeyword === normalizedCurrent) return '';
    return normalizedKeyword;
  }

  return {
    activeKey,
    isOpen,
    open,
    close,
    closeAll,
    getKeyword,
    setKeyword,
    syncKeyword,
    handleInput,
    resetAll,
    resolveFilterKeyword,
  };
}

export type SecondarySelector = ReturnType<typeof useSecondarySelector>;
