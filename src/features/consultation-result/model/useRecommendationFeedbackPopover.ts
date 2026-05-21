import { ref, type Ref } from 'vue';
import type {
  VoiceFeedbackSubmissionSummary,
  VoiceRecommendationFeedbackDraft,
} from '@/types/voiceFeedback';

export interface UseRecommendationFeedbackPopoverInput {
  ensureDraft: (recommendationKey: string) => VoiceRecommendationFeedbackDraft;
  submittedMap: Ref<Record<string, VoiceFeedbackSubmissionSummary>>;
}

export function useRecommendationFeedbackPopover(input: UseRecommendationFeedbackPopoverInput) {
  const activeKey = ref<string | null>(null);

  function getDraft(recommendationKey: string): VoiceRecommendationFeedbackDraft {
    return input.ensureDraft(recommendationKey);
  }

  function getSubmittedLabel(recommendationKey: string): string {
    return input.submittedMap.value[recommendationKey]?.actionLabel || '';
  }

  function isOpen(recommendationKey: string): boolean {
    return activeKey.value === recommendationKey;
  }

  function toggle(recommendationKey: string, event?: Event): void {
    event?.stopPropagation();
    activeKey.value = activeKey.value === recommendationKey ? null : recommendationKey;
  }

  function close(): void {
    activeKey.value = null;
  }

  function closeIfOpen(): void {
    if (activeKey.value) {
      close();
    }
  }

  return {
    activeKey,
    close,
    closeIfOpen,
    getDraft,
    getSubmittedLabel,
    isOpen,
    toggle,
  };
}
