import { computed, ref } from 'vue';
import type {
  ClinicalResultChannel,
  ClinicalResultGenerationState,
} from '@features/clinical-result';

export interface ClinicalResultFinalizationOptions {
  getChannel: () => ClinicalResultChannel;
  getGeneration: () => ClinicalResultGenerationState | undefined;
  getTreatmentPending?: () => boolean;
}

export function useClinicalResultFinalization(options: ClinicalResultFinalizationOptions) {
  const applyingFinalResult = ref(false);

  const allowsTreatmentAutoFetchInBackground = computed(() => {
    if (options.getChannel() === 'chronic-refill') return false;
    const generation = options.getGeneration();
    if (applyingFinalResult.value && generation?.status === 'complete') return true;
    if (generation?.status !== 'streaming') return false;
    const ready = new Set(generation.readySections);
    return ready.has('diagnoses') && ready.has('recommendation_plan');
  });

  const displayedGeneration = computed<ClinicalResultGenerationState | undefined>(() => {
    const generation = options.getGeneration();
    if (options.getTreatmentPending?.() && generation?.status === 'complete') {
      return {
        ...generation,
        status: 'streaming',
        stage: 'finalizing-result',
        message: '病历已可编辑，正在补全诊疗方案',
      };
    }
    if (!applyingFinalResult.value || generation?.status !== 'complete') return generation;
    return {
      ...generation,
      status: 'streaming',
      stage: 'finalizing-result',
      message: '正在完成病历与药品信息整理',
    };
  });

  const allowsPostResultFactSuggestions = computed(() => (
    options.getChannel() !== 'chronic-refill'
  ));

  function begin(generation = options.getGeneration()): boolean {
    const shouldFinalize = generation?.status === 'complete';
    applyingFinalResult.value = shouldFinalize;
    return shouldFinalize;
  }

  function finish(): void {
    applyingFinalResult.value = false;
  }

  function reset(): void {
    applyingFinalResult.value = false;
  }

  return {
    allowsPostResultFactSuggestions,
    allowsTreatmentAutoFetchInBackground,
    applyingFinalResult,
    begin,
    displayedGeneration,
    finish,
    reset,
  };
}

export type ClinicalResultFinalization = ReturnType<typeof useClinicalResultFinalization>;
