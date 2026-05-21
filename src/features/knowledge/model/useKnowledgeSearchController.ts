import { computed, ref, shallowRef } from 'vue';
import {
  buildKnowledgeSearchCategories,
  countKnowledgeBatchResults,
  resolveKnowledgeSearchType,
  type KnowledgeBatchResultsLike,
  type KnowledgeNamedItem,
  type KnowledgeSearchCategories,
  type KnowledgeSearchType,
  type KnowledgeTreatmentItem,
} from '../lib/knowledgeSearchCategories';

export interface KnowledgeSearchControllerResults<TResult = unknown> extends KnowledgeBatchResultsLike<TResult> {}

export interface KnowledgeSearchControllerOptions<TResult = unknown> {
  isConfigured: () => boolean;
  searchByCategories: (
    diagnoses: string[],
    medications: string[],
    examinations: string[],
    options?: { trackUsage?: boolean }
  ) => Promise<KnowledgeSearchControllerResults<TResult>>;
  batchSearch: (
    queries: string[],
    options?: { limit?: number; enableAbstract?: boolean }
  ) => Promise<Map<string, TResult[]>>;
  onTrack?: (action: string, details?: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
  onNotConfigured?: () => void;
}

export interface SearchKnowledgeByCategoriesInput {
  categories: KnowledgeSearchCategories;
  action: string;
  trackUsage?: boolean;
  openPanel?: 'always' | 'whenClosed' | 'never';
}

export interface SearchKnowledgeByDiagnosesInput {
  diagnoses: readonly KnowledgeNamedItem[];
  action: string;
}

export interface SearchKnowledgeByTreatmentInput {
  medications: string[];
  examinations: string[];
  action: string;
}

export interface SearchKnowledgeForItemInput {
  item: { name?: string | null; type?: string | null };
}

export function createEmptyKnowledgeResults<TResult = unknown>(): KnowledgeSearchControllerResults<TResult> {
  return {
    diagnoses: new Map(),
    medications: new Map(),
    examinations: new Map(),
  };
}

export function useKnowledgeSearchController<TResult = unknown>(
  options: KnowledgeSearchControllerOptions<TResult>
) {
  const showKnowledgePanel = ref(false);
  const knowledgeLoading = ref(false);
  const knowledgeSearchKeyword = ref('');
  const knowledgeSearchType = ref<KnowledgeSearchType>('diagnosis');
  const knowledgeResults = shallowRef<KnowledgeSearchControllerResults<TResult>>(createEmptyKnowledgeResults());
  const hasKnowledgeResults = ref(false);
  const totalKnowledgeResults = computed(() => countKnowledgeBatchResults(knowledgeResults.value));

  function toggleKnowledgePanel(): void {
    showKnowledgePanel.value = !showKnowledgePanel.value;
    options.onTrack?.('knowledge_panel_toggle', { visible: showKnowledgePanel.value });
  }

  async function searchKnowledgeByDiagnoses({
    diagnoses,
    action,
  }: SearchKnowledgeByDiagnosesInput): Promise<void> {
    if (!options.isConfigured() || diagnoses.length === 0) {
      return;
    }

    knowledgeLoading.value = true;
    hasKnowledgeResults.value = false;

    try {
      const { diagnoses: diagnosisNames } = buildKnowledgeSearchCategories({ diagnoses });
      const results = await options.batchSearch(diagnosisNames, { limit: 3, enableAbstract: true });

      knowledgeResults.value = {
        diagnoses: results,
        medications: new Map(),
        examinations: new Map(),
      };
      hasKnowledgeResults.value = totalKnowledgeResults.value > 0;

      if (hasKnowledgeResults.value) {
        showKnowledgePanel.value = true;
        options.onTrack?.(action, { totalResults: totalKnowledgeResults.value });
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      knowledgeLoading.value = false;
    }
  }

  async function searchKnowledgeByTreatment({
    medications,
    examinations,
    action,
  }: SearchKnowledgeByTreatmentInput): Promise<void> {
    if (!options.isConfigured()) {
      return;
    }

    knowledgeLoading.value = true;

    try {
      const [medResults, examResults] = await Promise.all([
        options.batchSearch(medications, { limit: 3, enableAbstract: true }),
        options.batchSearch(examinations, { limit: 3, enableAbstract: true }),
      ]);

      knowledgeResults.value = {
        ...knowledgeResults.value,
        medications: medResults,
        examinations: examResults,
      };
      hasKnowledgeResults.value = totalKnowledgeResults.value > 0;

      if (hasKnowledgeResults.value && !showKnowledgePanel.value) {
        options.onTrack?.(action, { totalResults: totalKnowledgeResults.value });
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      knowledgeLoading.value = false;
    }
  }

  async function searchKnowledgeByCategories({
    categories,
    action,
    trackUsage = true,
    openPanel = 'whenClosed',
  }: SearchKnowledgeByCategoriesInput): Promise<void> {
    if (!options.isConfigured()) {
      return;
    }

    knowledgeLoading.value = true;
    hasKnowledgeResults.value = false;

    try {
      const results = await options.searchByCategories(
        categories.diagnoses,
        categories.medications,
        categories.examinations,
        { trackUsage }
      );
      knowledgeResults.value = results;
      hasKnowledgeResults.value = totalKnowledgeResults.value > 0;

      const shouldOpen =
        hasKnowledgeResults.value &&
        (openPanel === 'always' || (openPanel === 'whenClosed' && !showKnowledgePanel.value));

      if (shouldOpen) {
        options.onTrack?.(action, { totalResults: totalKnowledgeResults.value });
        showKnowledgePanel.value = true;
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      knowledgeLoading.value = false;
    }
  }

  async function searchKnowledgeFromItems(input: {
    diagnoses?: readonly KnowledgeNamedItem[];
    medications?: readonly KnowledgeNamedItem[];
    examinations?: readonly KnowledgeNamedItem[];
    treatments?: readonly KnowledgeTreatmentItem[];
    action: string;
    openPanel?: 'always' | 'whenClosed' | 'never';
  }): Promise<void> {
    await searchKnowledgeByCategories({
      categories: buildKnowledgeSearchCategories(input),
      action: input.action,
      openPanel: input.openPanel,
      trackUsage: true,
    });
  }

  function searchKnowledgeForItem({ item }: SearchKnowledgeForItemInput): boolean {
    const itemName = item.name || '';
    if (!itemName) {
      return false;
    }

    if (!options.isConfigured()) {
      options.onNotConfigured?.();
      return false;
    }

    knowledgeSearchKeyword.value = itemName;
    knowledgeSearchType.value = resolveKnowledgeSearchType(item);
    showKnowledgePanel.value = true;
    options.onTrack?.('knowledge_search_item', {
      itemName,
      type: knowledgeSearchType.value,
    });
    return true;
  }

  return {
    showKnowledgePanel,
    knowledgeLoading,
    knowledgeSearchKeyword,
    knowledgeSearchType,
    knowledgeResults,
    hasKnowledgeResults,
    totalKnowledgeResults,
    toggleKnowledgePanel,
    searchKnowledgeByDiagnoses,
    searchKnowledgeByTreatment,
    searchKnowledgeByCategories,
    searchKnowledgeFromItems,
    searchKnowledgeForItem,
  };
}
