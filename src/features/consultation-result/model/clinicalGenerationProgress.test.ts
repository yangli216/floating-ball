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

  it('uses chronic refill phases when review and medicine sections stream in', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: ['record_core', 'history_context', 'diagnoses', 'review_plan'],
      },
      treatmentLoading: false,
      treatmentStates: idleTreatmentStates,
    });

    expect(progress.title).toBe('正在分析：用药方案');
    expect(progress.steps.map((step) => step.label)).toEqual([
      '病历基础', '复诊核查', '用药方案', '健康指导',
    ]);
    expect(progress.steps.map((step) => step.status)).toEqual([
      'complete', 'complete', 'active', 'pending',
    ]);
  });

  it('shows real non-streaming task stages without fake timer progress', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: [],
        stage: 'generating-content',
        message: '正在生成高血压病历与核查项',
      },
      treatmentLoading: false,
      treatmentStates: idleTreatmentStates,
    });

    expect(progress.title).toBe('正在生成高血压病历与核查项');
    expect(progress.percent).toBe(48);
    expect(progress.steps.map((step) => step.status)).toEqual(['complete', 'active', 'pending']);
  });

  it('ends the waiting state with a clear generation error', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'error',
        readySections: [],
        message: '慢病复诊结果生成失败，请收起页面后重试',
      },
      treatmentLoading: false,
      treatmentStates: idleTreatmentStates,
    });

    expect(progress).toMatchObject({
      visible: true,
      title: '生成未完成',
      detail: '慢病复诊结果生成失败，请收起页面后重试',
    });
    expect(progress.steps[0].status).toBe('error');
  });
});
