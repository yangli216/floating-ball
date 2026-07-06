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

describe('HisService fetchInstitutionMedicalItemsCatalog', () => {
  it('uses the AI context service exam/lab catalog instead of the synchronized institution catalog', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body: {
        items: [
          { id: 'exam-part-1', code: 'exam-1', name: '胸部CT（胸部）', category: '检查', idSrv: 'exam-1' },
          { id: 'lab-1', code: 'lab-1', name: '血常规', category: '检验', idSrv: 'lab-1' },
        ],
        examinationCount: 1,
        labTestCount: 1,
        total: 2,
      },
    });

    const result = await service.fetchInstitutionMedicalItemsCatalog('org-1');

    expect(post).toHaveBeenCalledWith(
      'api/phis.aiInpatientEmrContextService/queryAvailableExamLabItems',
      [{ orgCode: 'org-1' }],
    );
    expect(result.map((item) => [item.name, item.category])).toEqual([
      ['胸部CT（胸部）', '检查'],
      ['血常规', '检验'],
    ]);
  });
});
