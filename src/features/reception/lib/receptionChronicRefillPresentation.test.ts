import { describe, expect, it } from 'vitest';
import {
  buildReceptionChronicRefillPresentation,
} from './receptionChronicRefillPresentation';
import type { ChronicRefillCandidate } from '@features/reception-risk';

function candidate(
  overrides: Partial<ChronicRefillCandidate> = {},
): ChronicRefillCandidate {
  return {
    diagnosis: '2型糖尿病',
    diagnoses: ['2型糖尿病'],
    diagnosisGroups: ['糖尿病'],
    medications: ['盐酸二甲双胍片'],
    chronicVisitCount: 1,
    chronicVisits: [],
    diagnosisEvidenceText: '近期历史诊断',
    medicationEvidenceText: '近期历史处方',
    evidenceText: '近期慢病就诊',
    ...overrides,
  };
}

describe('buildReceptionChronicRefillPresentation', () => {
  it('preserves the specific clinical diagnosis and historical medication reference', () => {
    const presentation = buildReceptionChronicRefillPresentation(candidate({
      diagnoses: ['2型糖尿病', '2型糖尿病'],
      medications: ['盐酸二甲双胍片', '阿卡波糖片', '格列美脲片'],
      chronicVisitCount: 3,
    }));

    expect(presentation).toEqual({
      available: true,
      sectionSummary: '2型糖尿病 · 待医生确认',
      title: '2型糖尿病复诊配药',
      medicationStatus: '有历史用药参考 · 盐酸二甲双胍片、阿卡波糖片等',
    });
    expect(JSON.stringify(presentation)).not.toContain('3次');
  });

  it('explains the no-medication path without inventing a prescription', () => {
    const presentation = buildReceptionChronicRefillPresentation(candidate({
      medications: [],
    }));

    expect(presentation.medicationStatus).toBe(
      '暂无历史用药参考 · 确认后结合诊断与有效库存生成草稿',
    );
  });

  it('shows a stable empty state when no refill candidate exists', () => {
    expect(buildReceptionChronicRefillPresentation(null)).toEqual({
      available: false,
      sectionSummary: '暂无可确认的慢病续方候选',
      title: '暂未识别复诊配药需求',
      medicationStatus: '仅在近期慢病就诊符合续方条件时开放',
    });
  });

  it('exposes the generating state in the collapsed summary', () => {
    expect(buildReceptionChronicRefillPresentation(candidate(), true).sectionSummary)
      .toBe('2型糖尿病 · 正在准备确认项');
  });
});
