import { computed, ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type {
  ChronicRefillReviewOption,
  ChronicRefillReviewPlan,
} from '@/types/consultation';

export function updateChronicRefillReviewRecordText(
  current: string,
  previousText: string,
  nextText: string,
): string {
  let result = current.trim();
  const previous = previousText.trim();
  const next = nextText.trim();
  if (previous) {
    result = result.replace(previous, '')
      .replace(/[；;]{2,}/gu, '；')
      .replace(/[。]{2,}/gu, '。')
      .replace(/^[，。；;、\s]+|[，；;、\s]+$/gu, '')
      .trim();
  }
  if (!next) return result;
  if (result.includes(next)) return result;
  if (!result) return next;
  const separator = /[。；;！？!?]$/u.test(result) ? '' : '；';
  return `${result}${separator}${next}`;
}

export interface ChronicRefillReviewOptions {
  getHistoryOfPresentIllness: () => string;
  setHistoryOfPresentIllness: (value: string) => void;
  getTreatments: () => TreatmentRecommendation[];
  notify?: (message: string, type?: string) => void;
}

export function useChronicRefillReview(options: ChronicRefillReviewOptions) {
  const plan = ref<ChronicRefillReviewPlan | null>(null);
  const selections = ref<Record<string, string>>({});
  const appliedRecordTexts = ref<Record<string, string>>({});
  const expanded = ref(true);
  const treatmentReviewTriggered = ref(false);

  const pendingCriticalCount = computed(() => (
    plan.value?.items.filter((item) => (
      item.priority === 'critical' && !selections.value[item.id]
    )).length || 0
  ));
  const reviewedCount = computed(() => Object.keys(selections.value).length);

  function reset(value?: ChronicRefillReviewPlan | null): void {
    plan.value = value || null;
    selections.value = {};
    appliedRecordTexts.value = {};
    expanded.value = Boolean(value?.items.length);
    treatmentReviewTriggered.value = false;
  }

  function select(itemId: string, option: ChronicRefillReviewOption): void {
    const item = plan.value?.items.find((candidate) => candidate.id === itemId);
    if (!item || !item.options.some((candidate) => candidate.value === option.value)) return;

    let nextHistory = options.getHistoryOfPresentIllness();
    const knownTexts = new Set([
      appliedRecordTexts.value[itemId] || '',
      ...item.options.map((candidate) => candidate.recordText),
    ]);
    knownTexts.forEach((recordText) => {
      if (!recordText || recordText === option.recordText) return;
      nextHistory = updateChronicRefillReviewRecordText(nextHistory, recordText, '');
    });
    options.setHistoryOfPresentIllness(updateChronicRefillReviewRecordText(
      nextHistory,
      '',
      option.recordText,
    ));
    selections.value = { ...selections.value, [itemId]: option.value };
    appliedRecordTexts.value = { ...appliedRecordTexts.value, [itemId]: option.recordText };

    if (option.treatmentReviewRequired) {
      const selectedMedicines = options.getTreatments().filter((treatment) => (
        treatment.type === 'medicine' && treatment.selected
      ));
      selectedMedicines.forEach((treatment) => {
        treatment.selected = false;
      });
      treatmentReviewTriggered.value = true;
      if (selectedMedicines.length > 0) {
        options.notify?.('该情况可能影响续方，已取消药品自动选中，请核查方案后重新选择', 'warning');
      }
    }
  }

  function ensureWritebackReady(): boolean {
    if (pendingCriticalCount.value === 0) return true;
    expanded.value = true;
    options.notify?.(`还有 ${pendingCriticalCount.value} 项重点复诊信息待核查，请处理后再回写`, 'warning');
    return false;
  }

  return {
    expanded,
    pendingCriticalCount,
    plan,
    reviewedCount,
    selections,
    treatmentReviewTriggered,
    ensureWritebackReady,
    reset,
    select,
    setExpanded: (value: boolean) => { expanded.value = value; },
  };
}

export type ChronicRefillReview = ReturnType<typeof useChronicRefillReview>;
