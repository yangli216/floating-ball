import { describe, expect, it } from 'vitest';
import type { HisVisitRecord } from '@/services/his/types';
import {
  assessChronicRefillCandidate,
  isReportFollowUpIntent,
} from './chronicRefillAssessment';

const DAY = 24 * 60 * 60 * 1000;

function history(visits: HisVisitRecord[]) {
  return {
    patientId: 'patient-1',
    visits,
  };
}

describe('assessChronicRefillCandidate', () => {
  it('accepts one chronic visit with medication in the latest three visits', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 3 * DAY,
        diagnoses: ['冠心病'],
        medications: ['阿司匹林肠溶片（100mg*30片）'],
      },
      {
        visitTime: now - 20 * DAY,
        diagnoses: ['普通感冒'],
      },
    ]));

    expect(result?.diagnosis).toBe('冠心病');
    expect(result?.chronicVisitCount).toBe(1);
    expect(result?.medications).toEqual(['阿司匹林肠溶片（100mg*30片）']);
    expect(result?.evidenceText).not.toMatch(/\d+次|最近3次/u);
  });

  it('collects chronic visits and medications from the latest three visits without requiring repetition', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 7 * DAY,
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片（5mg*28片）'],
      },
      {
        visitTime: now - 35 * DAY,
        diagnoses: ['糖尿病'],
        medications: ['盐酸二甲双胍片 0.5g'],
      },
      {
        visitTime: now - 50 * DAY,
        diagnoses: ['急性上呼吸道感染'],
        medications: ['阿莫西林胶囊'],
      },
    ]));

    expect(result?.diagnosis).toBe('高血压');
    expect(result?.diagnoses).toEqual(['高血压', '糖尿病']);
    expect(result?.chronicVisitCount).toBe(2);
    expect(result?.medications).toEqual([
      '苯磺酸氨氯地平片（5mg*28片）',
      '盐酸二甲双胍片 0.5g',
    ]);
    expect(result?.chronicVisits).toHaveLength(2);
  });

  it('ignores chronic visits outside the latest three visits', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 5 * DAY,
        diagnoses: ['普通感冒'],
      },
      {
        visitTime: now - 20 * DAY,
        diagnoses: ['急性胃肠炎'],
      },
      {
        visitTime: now - 30 * DAY,
        diagnoses: ['外伤'],
      },
      {
        visitTime: now - 40 * DAY,
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
      },
    ]));

    expect(result).toBeNull();
  });

  it('does not use medication from an unrelated acute visit as chronic refill evidence', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 5 * DAY,
        diagnoses: ['高血压'],
      },
      {
        visitTime: now - 30 * DAY,
        diagnoses: ['急性上呼吸道感染'],
        medications: ['苯磺酸氨氯地平片'],
      },
    ]));

    expect(result).toBeNull();
  });

  it('suppresses chronic refill when the current encounter is a report follow-up', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 7 * DAY,
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
      },
    ]), {
      chiefComplaint: '携上次化验结果回诊',
      historyOfPresentIllness: '血脂检查结果已出，本次希望医生解读并调整后续治疗。',
      diagnosis: '高血压',
    });

    expect(result).toBeNull();
  });

  it('keeps an explicit refill encounter eligible when no report-return intent exists', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 7 * DAY,
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
      },
    ]), {
      chiefComplaint: '高血压复诊配药',
      historyOfPresentIllness: '长期服药，本次续方。',
      diagnosis: '高血压',
    });

    expect(result?.diagnosis).toBe('高血压');
  });

  it('returns null if hasFollowUpReport parameter is true', () => {
    const now = new Date('2026-06-25T08:00:00+08:00').getTime();
    const result = assessChronicRefillCandidate(history([
      {
        visitTime: now - 7 * DAY,
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
      },
    ]), {
      chiefComplaint: '高血压复诊配药',
    }, true);

    expect(result).toBeNull();
  });
});

describe('isReportFollowUpIntent', () => {
  it.each([
    '携检查报告回诊',
    '回来查看化验结果',
    '检验结果已出',
    '本次复诊解读影像报告',
  ])('recognizes report follow-up wording: %s', (chiefComplaint) => {
    expect(isReportFollowUpIntent({ chiefComplaint })).toBe(true);
  });

  it.each([
    '高血压复诊配药',
    '糖尿病长期用药续方',
    '复查血常规',
  ])('does not treat ordinary refill or future recheck wording as report follow-up: %s', (chiefComplaint) => {
    expect(isReportFollowUpIntent({ chiefComplaint })).toBe(false);
  });
});
