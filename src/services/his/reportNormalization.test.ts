import { describe, expect, it } from 'vitest';
import {
  normalizeHisOutpatientExam,
  normalizeHisOutpatientFollowUpReportResults,
  normalizeHisReportText,
  normalizeHisReportUrl,
} from './reportNormalization';

describe('HIS report normalization', () => {
  it('treats transport null sentinels as empty report fields', () => {
    expect(normalizeHisReportText(null)).toBe('');
    expect(normalizeHisReportText(' null ')).toBe('');
    expect(normalizeHisReportText('UNDEFINED')).toBe('');
    expect(normalizeHisReportText('[NULL]')).toBe('');
  });

  it('keeps valid clinical text when another PACS field is empty', () => {
    expect(normalizeHisOutpatientExam({
      examName: '心电图',
      finding: 'null',
      conclusion: '窦性心律',
    })).toEqual({
      examName: '心电图',
      finding: undefined,
      conclusion: '窦性心律',
      reportUrl: undefined,
    });
  });

  it('separates the PACS report page from clinical content', () => {
    const reportUrl = 'http://192.168.201.53:8083/Report/Report/?AccessionNumber=XTUS32432';

    expect(normalizeHisReportUrl(reportUrl)).toBe(reportUrl);
    expect(normalizeHisReportUrl('javascript:alert(1)')).toBe('');
    expect(normalizeHisOutpatientExam({
      examName: '乳腺超声',
      finding: reportUrl,
      conclusion: '右乳结节 BI-RADS分类 3类',
    })).toEqual({
      examName: '乳腺超声',
      finding: undefined,
      conclusion: '右乳结节 BI-RADS分类 3类',
      reportUrl,
    });
  });

  it('normalizes all examination reports at the HIS adapter boundary', () => {
    const results = normalizeHisOutpatientFollowUpReportResults({
      followUpEligible: true,
      examReports: [
        { examName: '空报告', finding: '[NULL]', conclusion: 'undefined' },
        { finding: '[NULL]', conclusion: '窦性心律' },
        { finding: 'http://pacs.example/report/only' },
      ],
    });

    expect(results?.examReports).toEqual([
      {
        finding: undefined,
        conclusion: '窦性心律',
        reportUrl: undefined,
      },
      {
        finding: undefined,
        conclusion: undefined,
        reportUrl: 'http://pacs.example/report/only',
      },
    ]);
  });
});
