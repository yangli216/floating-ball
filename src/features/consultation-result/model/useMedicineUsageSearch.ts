import { ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
import {
  filterUsageOptions,
  resolveUsageKeyFromKeyword,
  resolveUsageValueFromKeyword,
} from '@features/clinical-result';

export type MedicineUsageSearchField = 'frequency' | 'route';

interface UseMedicineUsageSearchInput {
  getEditorKey: (rec: TreatmentRecommendation) => string;
  getCurrentValue: (rec: TreatmentRecommendation, field: MedicineUsageSearchField) => string;
  getCurrentKey: (rec: TreatmentRecommendation, field: MedicineUsageSearchField) => string;
  getOptions: (field: MedicineUsageSearchField) => UsageOption[];
}

export function useMedicineUsageSearch(input: UseMedicineUsageSearchInput) {
  const keywordMaps = ref<Record<MedicineUsageSearchField, Record<string, string>>>({
    frequency: {},
    route: {},
  });

  function getSearchKey(rec: TreatmentRecommendation, field: MedicineUsageSearchField): string {
    return `${input.getEditorKey(rec)}:${field}-search`;
  }

  function getKeyword(rec: TreatmentRecommendation, field: MedicineUsageSearchField): string {
    const cached = keywordMaps.value[field][getSearchKey(rec, field)];
    if (typeof cached === 'string') {
      return cached;
    }
    return input.getCurrentValue(rec, field) || '';
  }

  function setKeyword(rec: TreatmentRecommendation, field: MedicineUsageSearchField, value: string): void {
    keywordMaps.value = {
      ...keywordMaps.value,
      [field]: {
        ...keywordMaps.value[field],
        [getSearchKey(rec, field)]: value,
      },
    };
  }

  function syncKeyword(rec: TreatmentRecommendation, field: MedicineUsageSearchField): void {
    setKeyword(rec, field, input.getCurrentValue(rec, field) || '');
  }

  function getFilteredOptions(rec: TreatmentRecommendation, field: MedicineUsageSearchField): UsageOption[] {
    const currentValue = input.getCurrentValue(rec, field).trim();
    return filterUsageOptions(input.getOptions(field), getKeyword(rec, field), currentValue);
  }

  function resolveValue(rec: TreatmentRecommendation, field: MedicineUsageSearchField): string {
    return resolveUsageValueFromKeyword({
      keyword: getKeyword(rec, field).trim(),
      options: input.getOptions(field),
      filteredOptions: getFilteredOptions(rec, field),
      fallbackValue: input.getCurrentValue(rec, field) || '',
    });
  }

  function resolveKey(rec: TreatmentRecommendation, field: MedicineUsageSearchField): string {
    return resolveUsageKeyFromKeyword({
      keyword: getKeyword(rec, field).trim(),
      options: input.getOptions(field),
      filteredOptions: getFilteredOptions(rec, field),
      fallbackKey: input.getCurrentKey(rec, field) || '',
    });
  }

  function resetAll(): void {
    keywordMaps.value = {
      frequency: {},
      route: {},
    };
  }

  return {
    getFilteredOptions,
    getKeyword,
    resetAll,
    resolveKey,
    resolveValue,
    setKeyword,
    syncKeyword,
  };
}
