import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { ClinicalResultInput } from '@features/clinical-result';
import { useGeneratedClinicalResultSession } from './useGeneratedClinicalResultSession';

const completedResult: ClinicalResultInput = {
  chiefComplaint: '高血压复诊配药',
  historyOfPresentIllness: '患者既往确诊高血压，今复诊配药。',
  pastMedicalHistory: '',
  allergyHistory: '',
  currentMedicationHistory: '',
  familyHistory: '',
  symptoms: [],
  negativeSymptoms: [],
  diagnoses: [],
  treatments: [],
  treatmentPlan: '',
  healthEducation: '',
  channel: 'chronic-refill',
};

describe('useGeneratedClinicalResultSession', () => {
  it('opens a visible placeholder first and fills the same session after completion', async () => {
    const intentResult = ref<ClinicalResultInput | null>(null);
    const intentSource = ref<'llm' | 'cache' | null>(null);
    const consultationRoundId = ref<string | null>(null);
    let resolveOpen!: () => void;
    const openResultView = vi.fn(() => new Promise<void>((resolve) => {
      resolveOpen = resolve;
    }));
    const controller = useGeneratedClinicalResultSession({
      intentResult,
      intentSource,
      consultationRoundId,
      resetCurrentSession: vi.fn(),
      openResultView,
      cloneResult: (value) => structuredClone(value),
    });

    const sessionId = await controller.begin({
      channel: 'chronic-refill',
      stage: 'preparing-context',
      message: '正在读取历史资料',
    });

    expect(openResultView).toHaveBeenCalledOnce();
    expect(intentResult.value?.generation).toMatchObject({
      status: 'streaming',
      stage: 'preparing-context',
    });
    expect(consultationRoundId.value).toBe(sessionId);
    resolveOpen();

    expect(controller.updateProgress(sessionId, {
      stage: 'generating-content',
      message: '正在生成病历与核查项',
    })).toBe(true);
    expect(intentResult.value?.generation?.stage).toBe('generating-content');

    expect(controller.updatePartial(sessionId, {
      ...completedResult,
      chiefComplaint: '高血压复诊配药（生成中）',
      generation: { status: 'streaming', readySections: ['record_core'] },
    })).toBe(true);
    expect(intentResult.value?.chiefComplaint).toBe('高血压复诊配药（生成中）');
    expect(intentResult.value?.generation).toEqual({
      status: 'streaming',
      readySections: ['record_core'],
      stage: undefined,
      message: undefined,
    });

    expect(controller.complete(sessionId, completedResult)).toBe(true);
    expect(intentResult.value?.chiefComplaint).toBe('高血压复诊配药');
    expect(intentResult.value?.generation?.status).toBe('complete');
  });

  it('rejects stale completion and exposes an explicit terminal error', async () => {
    const intentResult = ref<ClinicalResultInput | null>(null);
    const controller = useGeneratedClinicalResultSession({
      intentResult,
      intentSource: ref(null),
      consultationRoundId: ref(null),
      resetCurrentSession: vi.fn(),
      openResultView: vi.fn(async () => undefined),
      cloneResult: (value) => value,
    });

    const staleId = await controller.begin({ channel: 'chronic-refill', message: '准备中' });
    const activeId = await controller.begin({ channel: 'chronic-refill', message: '重新准备中' });
    expect(controller.updatePartial(staleId, completedResult)).toBe(false);
    expect(controller.complete(staleId, completedResult)).toBe(false);
    expect(controller.fail(activeId, '生成失败，请返回后重试')).toBe(true);
    expect(intentResult.value?.generation).toMatchObject({
      status: 'error',
      message: '生成失败，请返回后重试',
    });
  });
});
