import { describe, expect, it, vi } from 'vitest';
import type { HisService } from '../hisService';
import { PhisHisAdapter } from './PhisHisAdapter';

describe('PhisHisAdapter.fetchPatientHistory', () => {
  it('maps medication orders and reported applications into neutral history', async () => {
    const service = {
      queryPatientAllergy: vi.fn().mockResolvedValue([]),
      queryPatientVisitHistory: vi.fn().mockResolvedValue([{
        idVis: 'visit-1',
        idPi: 'patient-1',
        dtBgn: '2026-06-20 08:00:00',
        idDeptText: '全科门诊',
      }]),
      loadClinicMedicalRecord: vi.fn().mockResolvedValue({
        diagList: [{ naDiag: '2型糖尿病' }],
        orderList: [
          {
            naOrd: '盐酸二甲双胍片',
            sdOrd: '11',
            desOrd: 'null',
            amount: 3,
            unitOrd: '瓶',
          },
          {
            naOrd: '空腹血糖（静脉）',
            sdOrd: '41',
            idApplySim: 'apply-group-1',
            desOrd: 'null',
            amount: 1,
            unitOrd: '次',
          },
          {
            naOrd: '胸部CT',
            sdOrd: '31',
            desOrd: 'undefined',
            amount: 1,
            unitOrd: '次',
          },
        ],
        applyList: [{
          idApplySim: 'apply-group-1',
          naApplySim: '空腹血糖（静脉）',
          naDeptExec: '检验科',
          items: [{
            idApply: 'apply-1',
            naApply: '空腹血糖（静脉）',
            sdApply: '3',
            naSpecimen: '静脉血',
          }, {
            idApply: 'apply-2',
            naApply: '糖化血红蛋白',
            sdApply: '0',
          }],
        }],
      }),
    } as unknown as HisService;

    const history = await new PhisHisAdapter(service).fetchPatientHistory('patient-1');

    expect(history?.visits?.[0]?.medications).toEqual(['盐酸二甲双胍片（3瓶）']);
    expect(history?.visits?.[0]).toMatchObject({
      visitId: 'visit-1',
      deptName: '全科门诊',
      reportedApplications: [{
        applicationId: 'apply-1',
        applicationGroupId: 'apply-group-1',
        name: '空腹血糖（静脉）',
        type: 'lab',
        status: 'reported',
      }],
    });
  });
});
