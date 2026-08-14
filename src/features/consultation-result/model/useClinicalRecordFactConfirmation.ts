import { computed, ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  extractExplicitClinicalRecordFacts,
  getPendingCriticalFactSuggestions,
  hasClinicalRecordCandidateText,
  normalizeClinicalRecordFactSuggestions,
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
  applyConfirmedFact: (field: ClinicalRecordFactField, text: string, replaceText?: string) => void;
  formatError: (error: unknown) => string;
  notify?: (message: string, type?: string) => void;
}

export function useClinicalRecordFactConfirmation(options: ClinicalRecordFactConfirmationOptions) {
  const suggestions = ref<ClinicalRecordFactSuggestion[]>([]);
  const loading = ref(false);
  const error = ref('');
  const expanded = ref(false);
  let requestSequence = 0;

  const extractedFacts = computed(() => extractExplicitClinicalRecordFacts(
    options.getRecord(),
    options.getNegativeSymptoms?.() || [],
    options.getPositiveSymptoms?.() || [],
  ));
  const explicitFacts = computed<ClinicalRecordExplicitFact[]>(() => {
    const confirmed = suggestions.value
      .filter((item) => item.status === 'confirmed-negative' || item.status === 'confirmed-positive')
      .map((item) => ({
        id: `doctor-confirmed-${item.id}`,
        field: item.field,
        text: item.confirmedText || item.negativeRecordText,
        source: 'doctor-confirmed' as const,
        polarity: item.status === 'confirmed-positive' ? 'positive' as const : 'negative' as const,
      }));
    const confirmedKeys = new Set(confirmed.map((item) => (
      `${item.field}:${item.text.replace(/[\s，。；、：:！？!?（）()]/gu, '')}`
    )));
    return [
      ...extractedFacts.value.filter((item) => !confirmedKeys.has(
        `${item.field}:${item.text.replace(/[\s，。；、：:！？!?（）()]/gu, '')}`,
      )),
      ...confirmed,
    ];
  });
  const pendingCriticalSuggestions = computed(() => getPendingCriticalFactSuggestions(suggestions.value));
  const hasPendingCritical = computed(() => pendingCriticalSuggestions.value.length > 0);

  function setExpanded(value: boolean): void {
    expanded.value = value;
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
      const resolved = suggestions.value.filter((item) => item.status !== 'pending');
      const resolvedKeys = new Set(resolved.map((item) => `${item.field}:${item.question}`));
      const pending = normalizeClinicalRecordFactSuggestions(response, explicitFacts.value)
        .filter((item) => !resolvedKeys.has(`${item.field}:${item.question}`));
      suggestions.value = [...resolved, ...pending];
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

  function updateSuggestion(
    id: string,
    status: ClinicalRecordFactSuggestion['status'],
    confirmedText?: string,
  ): void {
    suggestions.value = suggestions.value.map((item) => (
      item.id === id ? { ...item, status, confirmedText } : item
    ));
  }

  function confirmNegative(id: string): void {
    const item = suggestions.value.find((candidate) => candidate.id === id);
    if (!item || item.status !== 'pending') return;
    if (!hasClinicalRecordCandidateText(options.getRecord()[item.field], item.negativeRecordText)) {
      options.applyConfirmedFact(item.field, item.negativeRecordText);
    }
    updateSuggestion(id, 'confirmed-negative', item.negativeRecordText);
  }

  function confirmPositive(id: string, text: string): void {
    const item = suggestions.value.find((candidate) => candidate.id === id);
    const confirmedText = text.trim();
    if (!item || item.status !== 'pending' || !confirmedText) {
      options.notify?.('请先填写实际情况', 'warning');
      return;
    }
    options.applyConfirmedFact(item.field, confirmedText, item.negativeRecordText);
    updateSuggestion(id, 'confirmed-positive', confirmedText);
  }

  function markNotApplicable(id: string): void {
    const item = suggestions.value.find((candidate) => candidate.id === id);
    if (!item || item.status !== 'pending') return;
    updateSuggestion(id, 'not-applicable');
  }

  function ensureWritebackReady(fields?: readonly ClinicalRecordFactField[]): boolean {
    const fieldSet = fields ? new Set(fields) : null;
    const blockingSuggestions = fieldSet
      ? pendingCriticalSuggestions.value.filter((item) => fieldSet.has(item.field))
      : pendingCriticalSuggestions.value;
    if (blockingSuggestions.length === 0) return true;
    expanded.value = true;
    options.notify?.(`还有 ${blockingSuggestions.length} 项重点 AI 补充待核查，请处理后再回写`, 'warning');
    return false;
  }

  function getFieldHighlights(field: ClinicalRecordFactField): ClinicalRecordExplicitFact[] {
    return explicitFacts.value.filter((item) => item.field === field);
  }

  function getFieldSuggestions(field: ClinicalRecordFactField): ClinicalRecordFactSuggestion[] {
    return suggestions.value.filter((item) => item.field === field);
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
    const validStatuses = new Set<ClinicalRecordFactSuggestion['status']>([
      'pending',
      'confirmed-negative',
      'confirmed-positive',
      'not-applicable',
    ]);
    suggestions.value = value
      .filter((item): item is ClinicalRecordFactSuggestion => Boolean(
        item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && validFields.has(item.field)
        && typeof item.question === 'string'
        && typeof item.negativeRecordText === 'string'
        && (item.priority === 'critical' || item.priority === 'general')
        && validStatuses.has(item.status)
      ))
      .map((item) => ({ ...item }));
  }

  function reset(): void {
    requestSequence += 1;
    suggestions.value = [];
    loading.value = false;
    error.value = '';
    expanded.value = false;
  }

  return {
    error,
    expanded,
    explicitFacts,
    hasPendingCritical,
    loading,
    pendingCriticalSuggestions,
    suggestions,
    confirmNegative,
    confirmPositive,
    ensureWritebackReady,
    generateSuggestions,
    getFieldHighlights,
    getFieldSuggestions,
    markNotApplicable,
    reset,
    restoreSuggestions,
    setExpanded,
  };
}

export type ClinicalRecordFactConfirmation = ReturnType<typeof useClinicalRecordFactConfirmation>;
