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
      'api/phis.aiAdapterService/queryVisitHistory',
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

describe('HisService queryPatientVisitHistoryData', () => {
  it('uses the real chronic-disease endpoint and idCard field without renaming', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body: {
        idPhr: 'PHR001',
        idRecord: 'RECORD001',
        naPi: '林女士',
        sdSexText: '女性',
        ageText: '62岁',
        rqflStatus: '3,6',
        pressureList: [],
        pressureHList: [],
        gluList: [],
        visitInfos: [],
      },
    });

    const result = await service.queryPatientVisitHistoryData('150206199306039948');

    expect(post).toHaveBeenCalledWith(
      'api/phis.aiAdapterService/queryPatientVisitHistoryData',
      [{ idCard: '150206199306039948' }],
    );
    expect(result).toEqual(expect.objectContaining({
      idPhr: 'PHR001',
      idRecord: 'RECORD001',
      naPi: '林女士',
      rqflStatus: '3,6',
    }));
  });
});

describe('HisService saveTcdForm', () => {
  it('rejects a missing idRecord before sending the adapter request', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post');
    const form = {
      idPhr: 'PHR001',
      idRecord: ' ',
    } as unknown as Parameters<HisService['saveTcdForm']>[0];

    await expect(service.saveTcdForm(form))
      .rejects.toThrow('缺少登记表主键 idRecord');
    expect(post).not.toHaveBeenCalled();
  });

  it('uses the AI adapter endpoint and wraps one original form in an array', async () => {
    const service = new HisService('http://localhost/', 'token');
    const body = { id: 'visit-follow-up-1' };
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body,
    });
    const form = {
      idPhr: 'PHR001',
      idRecord: 'RECORD001',
      id: '',
      status: '3',
      sdVisitKind: '1,2',
      advBmi: '23.89',
      drugList: [],
    } as unknown as Parameters<HisService['saveTcdForm']>[0];

    const result = await service.saveTcdForm(form);

    expect(post).toHaveBeenCalledWith(
      'api/phis.aiAdapterService/saveTcdForm',
      [form],
    );
    expect(result).toBe(body);
  });
});

describe('HisService fetchFrequencyDictionary', () => {
  it('passes an argument array through the AI adapter service', async () => {
    const service = new HisService('http://localhost/', 'token');
    const post = vi.spyOn(service, 'post').mockResolvedValue({
      code: 200,
      body: { items: [] },
    });

    await service.fetchFrequencyDictionary();

    expect(post).toHaveBeenCalledWith(
      'api/phis.aiAdapterService/frequency',
      [{}],
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
