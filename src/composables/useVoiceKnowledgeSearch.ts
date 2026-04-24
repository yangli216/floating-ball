import { computed, ref } from 'vue';
import { trackClick, trackError } from '../services/operationTracker';
import { isPMPHAIConfigured, pmphaiService, type BatchSearchResults } from '../services/pmphai';
import type { GeneratedRecord } from '../types/voiceResult';

export function useVoiceKnowledgeSearch() {
  const showKnowledgePanel = ref(false);
  const knowledgeLoading = ref(false);
  const knowledgeResults = ref<BatchSearchResults>({
    diagnoses: new Map(),
    medications: new Map(),
    examinations: new Map(),
  });
  const hasKnowledgeResults = ref(false);

  const totalKnowledgeResults = computed(() => (
    Array.from(knowledgeResults.value.diagnoses.values()).flat().length +
    Array.from(knowledgeResults.value.medications.values()).flat().length +
    Array.from(knowledgeResults.value.examinations.values()).flat().length
  ));

  async function searchKnowledgeBase(rec: GeneratedRecord): Promise<void> {
    if (!rec || !isPMPHAIConfigured()) {
      return;
    }

    knowledgeLoading.value = true;
    hasKnowledgeResults.value = false;

    try {
      const diagnoses = rec.diagnosisList?.map(diagnosis => diagnosis.name).filter(Boolean) || [];
      const medications = rec.medications?.map(medicine => medicine.name).filter(Boolean) || [];
      const examinations = rec.examinations?.map(examination => examination.name).filter(Boolean) || [];
      const results = await pmphaiService.searchByCategories(diagnoses, medications, examinations);

      knowledgeResults.value = results;
      hasKnowledgeResults.value = totalKnowledgeResults.value > 0;

      if (hasKnowledgeResults.value) {
        showKnowledgePanel.value = true;
        trackClick('knowledge_search_completed', { totalResults: totalKnowledgeResults.value });
      }
    } catch (error) {
      console.error('Knowledge base search failed:', error);
      trackError('knowledge_search_failed', error);
    } finally {
      knowledgeLoading.value = false;
    }
  }

  function toggleKnowledgePanel(): void {
    showKnowledgePanel.value = !showKnowledgePanel.value;
    trackClick('knowledge_panel_toggle', { visible: showKnowledgePanel.value });
  }

  return {
    showKnowledgePanel,
    knowledgeLoading,
    knowledgeResults,
    hasKnowledgeResults,
    searchKnowledgeBase,
    toggleKnowledgePanel,
  };
}
