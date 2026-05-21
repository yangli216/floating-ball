import { useKnowledgeSearchController } from '@features/knowledge';
import { trackClick, trackError } from '../../../services/operationTracker';
import { isPMPHAIConfigured, pmphaiService } from '../../../services/pmphai';
import type { GeneratedRecord } from '../../../types/voiceResult';

export function useVoiceKnowledgeSearch() {
  const controller = useKnowledgeSearchController({
    isConfigured: isPMPHAIConfigured,
    searchByCategories: (diagnoses, medications, examinations, options) =>
      pmphaiService.searchByCategories(diagnoses, medications, examinations, options),
    batchSearch: (queries, options) => pmphaiService.batchSearch(queries, options),
    onTrack: (action, details) => trackClick(action, details),
    onError: (error) => {
      console.error('Knowledge base search failed:', error);
      trackError('knowledge_search_failed', error);
    },
  });

  async function searchKnowledgeBase(rec: GeneratedRecord): Promise<void> {
    if (!rec) {
      return;
    }

    await controller.searchKnowledgeFromItems({
      diagnoses: rec.diagnosisList,
      medications: rec.medications,
      examinations: rec.examinations,
      action: 'knowledge_search_completed',
      openPanel: 'always',
    });
  }

  return {
    showKnowledgePanel: controller.showKnowledgePanel,
    knowledgeLoading: controller.knowledgeLoading,
    knowledgeResults: controller.knowledgeResults,
    hasKnowledgeResults: controller.hasKnowledgeResults,
    searchKnowledgeBase,
    toggleKnowledgePanel: controller.toggleKnowledgePanel,
  };
}
