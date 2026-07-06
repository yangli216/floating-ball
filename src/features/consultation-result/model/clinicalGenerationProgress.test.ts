import { describe, expect, it } from 'vitest';
import { buildClinicalGenerationProgress } from './clinicalGenerationProgress';

const idleTreatmentStates = {
  medicine: 'idle' as const,
  exam: 'idle' as const,
  lab_test: 'idle' as const,
  procedure: 'idle' as const,
};

describe('buildClinicalGenerationProgress', () => {
  it('reports the next concrete record-analysis phase', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: ['record_core', 'history_context', 'explicit_orders'],
      },
      treatmentLoading: false,
      treatmentStates: idleTreatmentStates,
    });

    expect(progress.title).toBe('正在分析：诊断建议');
    expect(progress.steps.map((step) => step.status)).toEqual([
      'complete', 'complete', 'active', 'pending',
    ]);
  });

  it('reports per-category catalog matching without exposing partial treatment results', () => {
    const progress = buildClinicalGenerationProgress({
      generation: { status: 'complete', readySections: [] },
      treatmentLoading: true,
      treatmentStates: {
        ...idleTreatmentStates,
        medicine: 'loading',
        exam: 'ready',
        lab_test: 'ready',
      },
    });

    expect(progress.title).toBe('正在匹配院内诊疗目录');
    expect(progress.detail).toContain('2/3');
    expect(progress.steps.map((step) => step.label)).toEqual(['药品目录', '检查目录', '检验目录']);
  });
});
