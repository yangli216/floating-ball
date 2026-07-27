import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { buildOdsImpRequest } from './odsImportPayload';

describe('buildOdsImpRequest', () => {
  it('maps doctor-confirmed chronic exam and lab items into applyVOS', () => {
    const treatments: TreatmentRecommendation[] = [
      {
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        reason: '评估近期血糖控制',
        selected: true,
        execDept: '检验科',
        matchedItem: {
          idCli: 'CLI-LAB',
          name: '糖化血红蛋白测定',
          raw: {
            idCli: 'CLI-LAB',
            priceSale: 25,
            idOrgExec: 'ORG001',
          },
        },
      },
      {
        type: 'exam',
        name: '胸部 CT',
        reason: '进一步检查',
        selected: true,
        execDept: '放射科',
        bodySite: '胸部',
        bodySiteId: 'PART-CHEST',
        matchedItem: {
          idCli: 'CLI-CT',
          name: '胸部 CT',
          raw: {
            idCli: 'CLI-CT',
            priceSale: '280',
          },
        },
      },
    ];

    const result = buildOdsImpRequest({
      idVis: 'VIS001',
      requestId: 'REQ001',
      diagnosis: {
        id: 'DIE001',
        code: 'E11.900',
        name: '2 型糖尿病',
        rate: '',
        rationale: '',
      },
      treatments,
      orderList: [
        {
          idSrv: 'CLI-LAB',
          naSrv: '糖化血红蛋白测定',
          sdSrv: '41',
          idDeptExec: 'DEPT-LAB',
          amount: 1,
          memo: '',
        },
        {
          idSrv: 'CLI-CT',
          naSrv: '胸部 CT',
          sdSrv: '31',
          idDeptExec: 'DEPT-RADIO',
          idPart: 'PART-CHEST',
          amount: 1,
          memo: '低剂量',
        },
      ],
    });

    expect(result).toEqual({
      forceSave: '0',
      idVis: 'VIS001',
      presVOList: [],
      herbVOList: [],
      applyVOS: [
        expect.objectContaining({
          idsDie: 'DIE001',
          idCli: 'CLI-LAB',
          sdDisp: '1',
          idSim: 'REQ001-1',
          priceSale: 25,
          idDeptExec: 'DEPT-LAB',
          idOrgExec: 'ORG001',
          fgCheck: '0',
          amount: 1,
          disease: 'E11.900',
          naDisease: '2 型糖尿病',
          sdOrd: '41',
        }),
        expect.objectContaining({
          idCli: 'CLI-CT',
          sdDisp: '2',
          idSim: 'REQ001-2',
          priceSale: 280,
          idDeptExec: 'DEPT-RADIO',
          idPart: 'PART-CHEST',
          partAndWay: '胸部',
          memo: '低剂量',
        }),
      ],
      orderDispCons: [],
    });
  });

  it('requires a real current visit id', () => {
    expect(() => buildOdsImpRequest({
      idVis: '',
      requestId: 'REQ001',
      diagnosis: null,
      treatments: [],
      orderList: [],
    })).toThrow('缺少当前门诊就诊标识');
  });
});
