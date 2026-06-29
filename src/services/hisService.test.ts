import { describe, expect, it, vi } from 'vitest';
import { HisService } from './hisService';

describe('HisService queryPatientVisitHistory', () => {
  it('passes current idVis so PHIS excludes the active visit', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body: { items: [] },
    });

    await service.queryPatientVisitHistory('patient-1', {
      limit: 5,
      idVis: 'visit-current',
    });

    expect(post).toHaveBeenCalledWith(
      'api/phis.clinicPatientService/queryVisitHistory',
      [{
        limit: 5,
        params: {
          idPi: 'patient-1',
          idVis: 'visit-current',
        },
      }],
    );
  });
});

describe('HisService buildOutpatientFollowUpReportResults', () => {
  it('calls the dedicated AI context service for report results only', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body: {
        followUpEligible: true,
        labReports: [],
        examReports: [{ examName: '胸部CT', conclusion: '未见明显异常。' }],
        ineligibleReason: null,
      },
    });

    await service.buildOutpatientFollowUpReportResults({
      patientId: 'patient-1',
      currentVisitId: 'visit-current',
      contextPolicy: {
        maxLabReports: 6,
        maxExamReports: 6,
      },
    });

    expect(post).toHaveBeenCalledWith(
      'api/phis.aiInpatientEmrContextService/buildOutpatientFollowUpReportResults',
      [{
        patientId: 'patient-1',
        currentVisitId: 'visit-current',
        contextPolicy: {
          maxLabReports: 6,
          maxExamReports: 6,
        },
      }],
    );
  });
});
