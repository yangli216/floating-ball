import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import {
  useConsultationAssistController,
  type UseConsultationAssistControllerInput,
} from './useConsultationAssistController';

function createControllerInput(
  overrides: Partial<UseConsultationAssistControllerInput> = {},
): UseConsultationAssistControllerInput {
  return {
    assistFocus: ref(null),
    aiDiagnoses: ref<Diagnosis[]>([]),
    selectedDiagnosis: ref(null),
    aiLoading: ref(false),
    treatmentLoading: ref(false),
    treatmentRecommendations: ref<TreatmentRecommendation[]>([]),
    examLoading: ref(false),
    examRecommendations: ref<TreatmentRecommendation[]>([]),
    labTestLoading: ref(false),
    labTestRecommendations: ref<TreatmentRecommendation[]>([]),
    procedureLoading: ref(false),
    procedureRecommendations: ref<TreatmentRecommendation[]>([]),
    hasRecordDraft: vi.fn(() => true),
    prefillRecord: vi.fn(() => true),
    prefillDiagnosis: vi.fn(() => false),
    setCurrentView: vi.fn(),
    notify: vi.fn(),
    afterContextReady: vi.fn(async () => undefined),
    fetchAIDiagnosis: vi.fn(async () => undefined),
    fetchTreatmentRecommendation: vi.fn(async () => undefined),
    fetchExamRecommendation: vi.fn(async () => undefined),
    fetchLabTestRecommendation: vi.fn(async () => undefined),
    fetchProcedureRecommendation: vi.fn(async () => undefined),
    consumeAutoTrigger: vi.fn(),
    ...overrides,
  };
}

describe('useConsultationAssistController', () => {
  it('refreshes AI diagnosis when the record context changed with existing diagnoses', async () => {
    const fetchAIDiagnosis = vi.fn(async () => undefined);
    const input = createControllerInput({
      aiDiagnoses: ref<Diagnosis[]>([{
        code: 'K59.000',
        name: '便秘',
        rate: '65%',
        rationale: '上一版推荐',
      } as Diagnosis]),
      fetchAIDiagnosis,
      shouldRefreshDiagnosis: vi.fn(() => true),
    });
    const controller = useConsultationAssistController(input);

    await controller.triggerAssist('diagnosis');

    expect(input.prefillRecord).toHaveBeenCalledWith(true);
    expect(input.setCurrentView).toHaveBeenCalledWith('record');
    expect(fetchAIDiagnosis).toHaveBeenCalledTimes(1);
    expect(input.consumeAutoTrigger).toHaveBeenCalledTimes(1);
  });

  it('reuses existing diagnoses when the record context did not change', async () => {
    const fetchAIDiagnosis = vi.fn(async () => undefined);
    const input = createControllerInput({
      aiDiagnoses: ref<Diagnosis[]>([{
        code: 'K59.000',
        name: '便秘',
        rate: '65%',
        rationale: '上一版推荐',
      } as Diagnosis]),
      fetchAIDiagnosis,
      shouldRefreshDiagnosis: vi.fn(() => false),
    });
    const controller = useConsultationAssistController(input);

    await controller.triggerAssist('diagnosis');

    expect(input.prefillRecord).toHaveBeenCalledWith(true);
    expect(input.setCurrentView).toHaveBeenCalledWith('record');
    expect(fetchAIDiagnosis).not.toHaveBeenCalled();
    expect(input.consumeAutoTrigger).toHaveBeenCalledTimes(1);
  });

  it('fetches AI diagnosis when there is no existing diagnosis', async () => {
    const fetchAIDiagnosis = vi.fn(async () => undefined);
    const input = createControllerInput({
      fetchAIDiagnosis,
      shouldRefreshDiagnosis: vi.fn(() => false),
    });
    const controller = useConsultationAssistController(input);

    await controller.triggerAssist('diagnosis');

    expect(fetchAIDiagnosis).toHaveBeenCalledTimes(1);
    expect(input.consumeAutoTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not start another diagnosis refresh while diagnosis loading is active', async () => {
    const fetchAIDiagnosis = vi.fn(async () => undefined);
    const input = createControllerInput({
      aiDiagnoses: ref<Diagnosis[]>([{
        code: 'K59.000',
        name: '便秘',
        rate: '65%',
        rationale: '上一版推荐',
      } as Diagnosis]),
      aiLoading: ref(true),
      fetchAIDiagnosis,
      shouldRefreshDiagnosis: vi.fn(() => true),
    });
    const controller = useConsultationAssistController(input);

    await controller.triggerAssist('diagnosis');

    expect(fetchAIDiagnosis).not.toHaveBeenCalled();
    expect(input.consumeAutoTrigger).toHaveBeenCalledTimes(1);
  });
});
