import { describe, expect, it } from 'vitest';
import { buildClinicalGenerationProgress } from './clinicalGenerationProgress';

describe('buildClinicalGenerationProgress', () => {
  it('reports the next concrete record-analysis phase', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: ['record_core', 'history_context'],
      },
    });

    expect(progress.title).toBe('正在整理诊断建议');
    expect(progress.stepText).toBe('第 2/4 步');
    expect(progress.percent).toBe(41);
    expect(progress.detail).toBe('');
    expect(progress.steps.map((step) => step.status)).toEqual([
      'complete', 'active', 'pending', 'pending',
    ]);
  });

  it('does not expose treatment finalization as a standalone catalog-matching phase', () => {
    const progress = buildClinicalGenerationProgress({
      generation: { status: 'complete', readySections: [] },
      treatmentLoading: true,
      treatmentStates: {
        medicine: 'loading',
        exam: 'ready',
        lab_test: 'ready',
        procedure: 'skipped',
      },
      showTreatmentProgress: false,
    });

    expect(progress).toEqual({
      visible: false,
      title: '',
      detail: '',
      stepText: '',
      percent: 0,
      steps: [],
    });
  });

  it('keeps non-voice treatment feedback without describing it as catalog matching', () => {
    const progress = buildClinicalGenerationProgress({
      generation: { status: 'complete', readySections: [] },
      treatmentLoading: true,
      treatmentStates: {
        medicine: 'loading',
        exam: 'ready',
        lab_test: 'ready',
        procedure: 'skipped',
      },
      showTreatmentProgress: true,
    });

    expect(progress.title).toBe('正在生成诊疗方案');
    expect(progress.steps.map((step) => step.label)).toEqual([
      '药品方案', '检查方案', '检验方案',
    ]);
  });

  it('uses chronic refill phases when review and medicine sections stream in', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: ['record_core', 'history_context', 'diagnoses', 'review_plan'],
      },
    });

    expect(progress.title).toBe('正在整理用药方案');
    expect(progress.stepText).toBe('第 3/4 步');
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
    });

    expect(progress.title).toBe('正在生成高血压病历与核查项');
    expect(progress.stepText).toBe('第 2/3 步');
    expect(progress.percent).toBe(53);
    expect(progress.steps.map((step) => step.status)).toEqual(['complete', 'active', 'pending']);
  });

  it('keeps the bar label and fill aligned with the active final phase', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'streaming',
        readySections: ['record_core', 'history_context', 'diagnoses', 'recommendation_plan'],
        message: '正在整理语音病历',
      },
    });

    expect(progress).toMatchObject({
      title: '正在整理病历完善',
      detail: '',
      stepText: '第 4/4 步',
      percent: 88,
    });
    expect(progress.steps.map((step) => step.label)).toEqual([
      '病历要点', '诊断建议', '诊疗路由', '病历完善',
    ]);
  });

  it('ends the waiting state with a clear generation error', () => {
    const progress = buildClinicalGenerationProgress({
      generation: {
        status: 'error',
        readySections: [],
        message: '慢病复诊结果生成失败，请收起页面后重试',
      },
    });

    expect(progress).toMatchObject({
      visible: true,
      title: '生成未完成',
      detail: '慢病复诊结果生成失败，请收起页面后重试',
      stepText: '生成失败',
    });
    expect(progress.steps[0].status).toBe('error');
  });
});
