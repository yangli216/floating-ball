import { describe, expect, it } from 'vitest';
import { getRecentReportedVisits, hasReportedApplyResult } from './reportedApplyResults';

describe('hasReportedApplyResult', () => {
  it('detects reported lab or exam apply items by sdApply=3', () => {
    expect(hasReportedApplyResult({
      applyList: [{
        items: [
          { naApply: '血常规', sdApply: '0' },
          { naApply: '胸部CT', sdApply: '3' },
        ],
      }],
    })).toBe(true);
  });

  it('does not treat ordered but unreported apply items as report follow-up evidence', () => {
    expect(hasReportedApplyResult({
      applyList: [{
        items: [
          { naApply: '血常规', sdApply: '0' },
        ],
      }],
      orderList: [{
        naOrd: '血常规（五分类）',
        sdOrd: '41',
      }],
    })).toBe(false);
  });

  it('keeps only reported visits from the latest fourteen calendar days', () => {
    const now = new Date(2026, 5, 30, 10, 0, 0);
    const visits = getRecentReportedVisits({
      patientId: 'p1',
      visits: [
        {
          visitId: 'fourteenth-day-reported',
          visitTime: new Date(2026, 5, 17, 0, 0, 0).getTime(),
          reportedApplications: [{
            applicationId: 'apply-1',
            name: '血常规',
            type: 'lab',
            status: 'reported',
          }],
        },
        {
          visitId: 'recent-empty',
          visitTime: new Date(2026, 5, 29, 8, 0, 0).getTime(),
        },
        {
          visitId: 'too-old',
          visitTime: new Date(2026, 5, 16, 23, 59, 59).getTime(),
          reportedApplications: [{
            applicationId: 'apply-2',
            name: '胸部CT',
            type: 'exam',
            status: 'reported',
          }],
        },
      ],
    }, now);

    expect(visits.map((visit) => visit.visitId)).toEqual(['fourteenth-day-reported']);
  });

});
