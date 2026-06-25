import { describe, expect, it } from 'vitest';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import { buildOutpatientFollowUpEvidence } from './outpatientFollowUpContext';

describe('buildOutpatientFollowUpEvidence', () => {
  it('includes the medical record and complete lab and exam result details', () => {
    const context: HisOutpatientFollowUpContext = {
      followUpEligible: true,
      source: {
        visitId: 'visit-history-1',
        visitTime: '2026-06-20 09:30:00',
        documentTitle: '门急诊病历',
      },
      medicalRecordText: '患者因咳嗽、咳痰就诊，完善血常规及胸部CT。',
      labReports: [{
        reportTime: '2026-06-21 10:00:00',
        reportName: '血常规',
        items: [
          {
            itemName: '白细胞计数',
            result: '12.8',
            unit: '10^9/L',
            referenceRange: '3.5-9.5',
            abnormalFlag: 'H',
          },
          {
            itemName: '血红蛋白',
            result: '135',
            unit: 'g/L',
            referenceRange: '115-150',
          },
        ],
      }],
      examReports: [{
        reportTime: '2026-06-21 11:00:00',
        examName: '胸部CT',
        finding: '右下肺见斑片状高密度影',
        conclusion: '右下肺感染性病变',
      }],
      ineligibleReason: null,
    };

    const evidence = buildOutpatientFollowUpEvidence(context);

    expect(evidence).toContain('患者因咳嗽、咳痰就诊');
    expect(evidence).toContain('白细胞计数：12.8 10^9/L（参考范围3.5-9.5，异常标记H）');
    expect(evidence).toContain('血红蛋白：135 g/L（参考范围115-150）');
    expect(evidence).toContain('所见：右下肺见斑片状高密度影');
    expect(evidence).toContain('结论：右下肺感染性病变');
  });

  it('returns no evidence when the context is not eligible', () => {
    expect(buildOutpatientFollowUpEvidence({
      followUpEligible: false,
      source: {},
      medicalRecordText: '',
      labReports: [],
      examReports: [],
      ineligibleReason: 'noEligibleSourceVisit',
    })).toBe('');
  });
});
