import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  updateChronicRefillReviewRecordText,
  useChronicRefillReview,
} from './useChronicRefillReview';

const plan = {
  summary: '请核查本次复诊信息',
  items: [
    {
      id: 'control',
      question: '近期控制情况如何？',
      description: '',
      options: [
        { value: 'stable', label: '控制平稳', recordText: '近期血压控制平稳' },
        { value: 'poor', label: '控制欠佳', recordText: '近期血压控制欠佳', treatmentReviewRequired: true },
        { value: 'unknown', label: '暂未评估', recordText: '' },
      ],
      recommendedValue: 'unknown',
      confidence: 'low' as const,
      evidence: 'unknown' as const,
      basis: '待本次核查',
      priority: 'critical' as const,
    },
  ],
};

describe('updateChronicRefillReviewRecordText', () => {
  it('appends and replaces only the review fragment', () => {
    const initial = '患者既往确诊高血压。今复诊配药。';
    const stable = updateChronicRefillReviewRecordText(initial, '', '近期血压控制平稳');
    expect(stable).toBe('患者既往确诊高血压。今复诊配药。近期血压控制平稳');
    expect(updateChronicRefillReviewRecordText(
      stable,
      '近期血压控制平稳',
      '近期血压控制欠佳',
    )).toBe('患者既往确诊高血压。今复诊配药。近期血压控制欠佳');
    expect(updateChronicRefillReviewRecordText(
      stable,
      '',
      '近期血压控制平稳',
    )).toBe(stable);
  });
});

describe('useChronicRefillReview', () => {
  it('keeps review optional and only writes explicitly selected facts', () => {
    let history = '患者既往确诊高血压。今复诊配药。';
    const controller = useChronicRefillReview({
      getHistoryOfPresentIllness: () => history,
      setHistoryOfPresentIllness: (value) => { history = value; },
      getTreatments: () => [],
    });

    controller.reset(plan);
    expect(controller.selections.value).toEqual({});
    expect('ensureWritebackReady' in controller).toBe(false);
    expect(history).toBe('患者既往确诊高血压。今复诊配药。');

    controller.select('control', plan.items[0].options[2]);
    expect(history).not.toContain('控制平稳');
  });

  it('writes a confirmed fact and clears selected medicines when the answer affects refill safety', () => {
    let history = '患者既往确诊高血压。今复诊配药。';
    const treatments = [{
      type: 'medicine',
      name: '苯磺酸氨氯地平片',
      reason: '历史续方',
      selected: true,
    }] as TreatmentRecommendation[];
    const controller = useChronicRefillReview({
      getHistoryOfPresentIllness: () => history,
      setHistoryOfPresentIllness: (value) => { history = value; },
      getTreatments: () => treatments,
    });

    controller.reset(plan);
    controller.select('control', plan.items[0].options[1]);

    expect(history).toContain('近期血压控制欠佳');
    expect(treatments[0].selected).toBe(false);
    expect(controller.treatmentReviewTriggered.value).toBe(true);
  });

  it('replaces an option fragment restored from an editor snapshot', () => {
    let history = '患者既往确诊高血压。今复诊配药。近期血压控制平稳';
    const controller = useChronicRefillReview({
      getHistoryOfPresentIllness: () => history,
      setHistoryOfPresentIllness: (value) => { history = value; },
      getTreatments: () => [],
    });

    controller.reset(plan);
    controller.select('control', plan.items[0].options[1]);

    expect(history).toContain('近期血压控制欠佳');
    expect(history).not.toContain('近期血压控制平稳');
  });
});
