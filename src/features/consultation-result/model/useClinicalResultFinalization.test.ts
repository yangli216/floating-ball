import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type {
  ClinicalResultChannel,
  ClinicalResultGenerationState,
} from '@features/clinical-result';
import { useClinicalResultFinalization } from './useClinicalResultFinalization';

describe('useClinicalResultFinalization', () => {
  it('keeps finalizing visible until the final result has been applied locally', () => {
    const channel = ref<ClinicalResultChannel>('chronic-refill');
    const generation = ref<ClinicalResultGenerationState>({
      status: 'complete',
      readySections: ['record_core', 'recommended_medicines', 'record_extra'],
    });
    const controller = useClinicalResultFinalization({
      getChannel: () => channel.value,
      getGeneration: () => generation.value,
    });

    expect(controller.begin()).toBe(true);
    expect(controller.applyingFinalResult.value).toBe(true);
    expect(controller.displayedGeneration.value).toMatchObject({
      status: 'streaming',
      stage: 'finalizing-result',
      message: '正在完成病历与药品信息整理',
    });

    controller.finish();
    expect(controller.applyingFinalResult.value).toBe(false);
    expect(controller.displayedGeneration.value?.status).toBe('complete');
  });

  it('disables generic post-result fact generation only for chronic refill', () => {
    const channel = ref<ClinicalResultChannel>('chronic-refill');
    const controller = useClinicalResultFinalization({
      getChannel: () => channel.value,
      getGeneration: () => undefined,
    });

    expect(controller.allowsPostResultFactSuggestions.value).toBe(false);
    channel.value = 'voice';
    expect(controller.allowsPostResultFactSuggestions.value).toBe(true);
  });

  it('allows normal voice treatment completion while finalizing but keeps chronic refill isolated', () => {
    const channel = ref<ClinicalResultChannel>('voice');
    const generation = ref<ClinicalResultGenerationState>({
      status: 'complete',
      readySections: ['record_core', 'diagnoses', 'recommendation_plan'],
    });
    const controller = useClinicalResultFinalization({
      getChannel: () => channel.value,
      getGeneration: () => generation.value,
    });

    controller.begin();
    expect(controller.allowsTreatmentAutoFetchWhileFinalizing.value).toBe(true);

    channel.value = 'chronic-refill';
    expect(controller.allowsTreatmentAutoFetchWhileFinalizing.value).toBe(false);

    channel.value = 'voice';
    controller.finish();
    expect(controller.allowsTreatmentAutoFetchWhileFinalizing.value).toBe(false);
  });
});
