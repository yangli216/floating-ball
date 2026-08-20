import { computed, ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  extractExplicitClinicalRecordFacts,
  normalizeClinicalRecordFactSuggestions,
  normalizeGeneratedClinicalRecordNarrative,
  type ClinicalRecordExplicitFact,
  type ClinicalRecordFactField,
  type ClinicalRecordFactRecord,
  type ClinicalRecordFactSuggestion,
} from '@features/clinical-result';

export interface ClinicalRecordFactConfirmationOptions {
  getRecord: () => ClinicalRecordFactRecord;
  getDiagnoses: () => readonly Diagnosis[];
  getNegativeSymptoms?: () => readonly string[];
  getPositiveSymptoms?: () => readonly string[];
  request: (input: {
    record: ClinicalRecordFactRecord;
    diagnoses: readonly Diagnosis[];
    explicitFacts: ClinicalRecordExplicitFact[];
  }) => Promise<string>;
  formatError: (error: unknown) => string;
  notify?: (message: string, type?: string) => void;
  mergeSuggestionIntoRecord: (suggestion: ClinicalRecordFactSuggestion) => boolean;
  onRecordChanged?: (suggestions: readonly ClinicalRecordFactSuggestion[]) => void;
}

export function useClinicalRecordFactConfirmation(options: ClinicalRecordFactConfirmationOptions) {
  const suggestions = ref<ClinicalRecordFactSuggestion[]>([]);
  const loading = ref(false);
  const error = ref('');
  let requestSequence = 0;

  const extractedFacts = computed(() => extractExplicitClinicalRecordFacts(
    options.getRecord(),
    options.getNegativeSymptoms?.() || [],
    options.getPositiveSymptoms?.() || [],
  ));
  const explicitFacts = computed<ClinicalRecordExplicitFact[]>(() => extractedFacts.value);

  function mergePendingSuggestions(items: readonly ClinicalRecordFactSuggestion[]): void {
    const merged = items.filter((item) => (
      item.status === 'pending' && options.mergeSuggestionIntoRecord(item)
    ));
    if (merged.length > 0) options.onRecordChanged?.(merged);
  }

  async function generateSuggestions(): Promise<void> {
    const currentRequest = ++requestSequence;
    loading.value = true;
    error.value = '';
    try {
      const response = await options.request({
        record: options.getRecord(),
        diagnoses: options.getDiagnoses(),
        explicitFacts: explicitFacts.value,
      });
      if (currentRequest !== requestSequence) return;
      const nextSuggestions = normalizeClinicalRecordFactSuggestions(response, explicitFacts.value);
      mergePendingSuggestions(nextSuggestions);
      suggestions.value = nextSuggestions;
    } catch (cause) {
      if (currentRequest !== requestSequence) return;
      error.value = options.formatError(cause);
      options.notify?.(error.value, 'error');
    } finally {
      if (currentRequest === requestSequence) {
        loading.value = false;
      }
    }
  }

  function getFieldHighlights(field: ClinicalRecordFactField): ClinicalRecordExplicitFact[] {
    return explicitFacts.value.filter((item) => item.field === field);
  }

  function getFieldSuggestions(field: ClinicalRecordFactField): ClinicalRecordFactSuggestion[] {
    return suggestions.value.filter((item) => item.field === field && item.status === 'pending');
  }

  function dismissSuggestion(id: string): void {
    suggestions.value = suggestions.value.map((item) => (
      item.id === id ? { ...item, status: 'dismissed' } : item
    ));
  }

  function restoreSuggestions(value: unknown): void {
    if (!Array.isArray(value)) return;
    const validFields = new Set<ClinicalRecordFactField>([
      'historyOfPresentIllness',
      'pastMedicalHistory',
      'personalHistory',
      'familyHistory',
      'physicalExam',
    ]);
    const restored = value
      .filter((item): item is ClinicalRecordFactSuggestion => Boolean(
        item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && validFields.has(item.field)
        && typeof item.question === 'string'
        && typeof item.negativeRecordText === 'string'
        && (item.priority === 'critical' || item.priority === 'general')
        && (item.status === 'pending' || item.status === 'dismissed')
      ))
      .map((item): ClinicalRecordFactSuggestion | null => {
        const negativeRecordText = normalizeGeneratedClinicalRecordNarrative(
          item.negativeRecordText,
          item.field,
        ).text;
        return negativeRecordText ? { ...item, negativeRecordText } : null;
      })
      .filter((item): item is ClinicalRecordFactSuggestion => Boolean(item));
    mergePendingSuggestions(restored);
    suggestions.value = restored;
  }

  function reset(): void {
    requestSequence += 1;
    suggestions.value = [];
    loading.value = false;
    error.value = '';
  }

  return {
    error,
    explicitFacts,
    loading,
    suggestions,
    generateSuggestions,
    getFieldHighlights,
    getFieldSuggestions,
    dismissSuggestion,
    reset,
    restoreSuggestions,
  };
}

export type ClinicalRecordFactConfirmation = ReturnType<typeof useClinicalRecordFactConfirmation>;
