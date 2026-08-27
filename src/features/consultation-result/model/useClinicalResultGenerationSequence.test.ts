import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type {
  ClinicalResultChannel,
  ClinicalResultGenerationState,
} from '@features/clinical-result';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  mergeGeneratedTreatmentBranches,
  useClinicalResultGenerationSequence,
} from './useClinicalResultGenerationSequence';

function createHarness() {
  const channel = ref<ClinicalResultChannel>('voice');
  const generation = ref<ClinicalResultGenerationState | undefined>({
    status: 'streaming',
    readySections: ['record_core'],
  });
  const formalDiagnosisCount = ref(0);
  const selectedDiagnosisKey = ref('');
  const lastTreatmentDiagnosisKey = ref('');
  const controller = useClinicalResultGenerationSequence({
    getChannel: () => channel.value,
    getGeneration: () => generation.value,
    getFormalDiagnosisCount: () => formalDiagnosisCount.value,
    getSelectedDiagnosisKey: () => selectedDiagnosisKey.value,
    getLastTreatmentDiagnosisKey: () => lastTreatmentDiagnosisKey.value,
  });
  return {
    channel,
    controller,
    formalDiagnosisCount,
    generation,
    lastTreatmentDiagnosisKey,
    selectedDiagnosisKey,
  };
}

describe('useClinicalResultGenerationSequence', () => {
  it('replaces one generated branch atomically while preserving doctor-owned items', () => {
    const explicit: TreatmentRecommendation = {
      type: 'medicine',
      name: '医生明确用药',
      reason: '',
      sourceType: 'explicit',
    };
    const oldGenerated: TreatmentRecommendation = {
      type: 'medicine',
      name: '旧推荐',
      reason: '',
      sourceType: 'inferred',
    };
    const existingExam: TreatmentRecommendation = {
      type: 'exam',
      name: '既有检查',
      reason: '',
    };
    const replacement: TreatmentRecommendation = {
      type: 'medicine',
      name: '新推荐',
      reason: '',
      sourceType: 'inferred',
    };

    expect(mergeGeneratedTreatmentBranches(
      [explicit, oldGenerated, existingExam],
      ['medicine'],
      [replacement, explicit],
    )).toEqual([explicit, existingExam, replacement]);
  });

  it('starts ordinary voice treatment only after a formal diagnosis and route are ready', () => {
    const harness = createHarness();
    harness.formalDiagnosisCount.value = 1;
    harness.selectedDiagnosisKey.value = 'I10';

    expect(harness.controller.canStartAutoTreatment.value).toBe(false);
    expect(harness.controller.coreRecordEditable.value).toBe(false);
    harness.generation.value = {
      status: 'streaming',
      readySections: ['record_core', 'history_context'],
    };
    expect(harness.controller.coreRecordEditable.value).toBe(true);
    harness.generation.value = {
      status: 'streaming',
      readySections: ['record_core', 'diagnoses', 'recommendation_plan'],
    };
    expect(harness.controller.canStartAutoTreatment.value).toBe(true);
    harness.controller.beginTreatment('I10');
    expect(harness.controller.treatmentGenerationIsInitial.value).toBe(true);
    harness.lastTreatmentDiagnosisKey.value = 'I10';
    expect(harness.controller.treatmentGenerationIsInitial.value).toBe(false);
    harness.controller.finishTreatment('I10');
  });

  it('treats a declared differential-only diagnosis section as valid without a second request', () => {
    const harness = createHarness();
    harness.generation.value = {
      status: 'complete',
      readySections: ['record_core', 'diagnoses', 'recommendation_plan', 'record_extra'],
    };

    expect(harness.controller.shouldRecoverMissingDiagnosis(true)).toBe(false);
    expect(harness.controller.canStartAutoTreatment.value).toBe(false);
  });

  it('recovers a legacy result with no diagnosis section once', () => {
    const harness = createHarness();
    harness.generation.value = {
      status: 'complete',
      readySections: ['record_core', 'history_context'],
    };

    expect(harness.controller.shouldRecoverMissingDiagnosis(true)).toBe(true);
    expect(harness.controller.beginDiagnosis('initial-recovery')).toBe(true);
    expect(harness.controller.initialDiagnosisPending.value).toBe(true);
    expect(harness.controller.showBlockingDiagnosisLoading.value).toBe(true);
    harness.controller.finishDiagnosis('initial-recovery');
    expect(harness.controller.shouldRecoverMissingDiagnosis(true)).toBe(false);
  });

  it('keeps a stable diagnosis visible during a manual refresh', () => {
    const harness = createHarness();
    harness.formalDiagnosisCount.value = 1;
    harness.selectedDiagnosisKey.value = 'I10';
    harness.generation.value = {
      status: 'complete',
      readySections: ['diagnoses', 'recommendation_plan'],
    };

    harness.controller.beginDiagnosis('manual-refresh');
    expect(harness.controller.diagnosisLoading.value).toBe(true);
    expect(harness.controller.showBlockingDiagnosisLoading.value).toBe(false);
    expect(harness.controller.canShowGeneratedTreatments.value).toBe(true);
    expect(harness.controller.canStartAutoTreatment.value).toBe(false);
  });

  it.each<ClinicalResultChannel>(['symptom', 'chronic-refill'])(
    'does not apply ordinary voice recovery or display gates to %s',
    (channel) => {
      const harness = createHarness();
      harness.channel.value = channel;
      harness.generation.value = {
        status: 'complete',
        readySections: ['record_core'],
      };

      expect(harness.controller.shouldRecoverMissingDiagnosis(true)).toBe(false);
      expect(harness.controller.canStartAutoTreatment.value).toBe(true);
      expect(harness.controller.canShowGeneratedTreatments.value).toBe(true);
      expect(harness.controller.coreRecordEditable.value).toBe(false);
    },
  );
});
