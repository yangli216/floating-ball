import { describe, expect, it, vi } from 'vitest';
import type { HisService } from '../hisService';
import { PhisHisAdapter } from './PhisHisAdapter';

describe('PhisHisAdapter.fetchPatientHistory', () => {
  it('forwards the bounded history date range and current visit to PHIS', async () => {
    const service = {
      queryPatientAllergy: vi.fn().mockResolvedValue([]),
      queryPatientVisitHistory: vi.fn().mockResolvedValue([]),
      loadClinicMedicalRecord: vi.fn(),
    } as unknown as HisService;

    await new PhisHisAdapter(service).fetchPatientHistory('patient-1', {
      currentVisitId: 'visit-current',
      limit: 1000,
      dateRange: ['2026-05-06 00:00:00', '2026-08-04 23:59:59'],
    });

    expect(service.queryPatientVisitHistory).toHaveBeenCalledWith('patient-1', {
      limit: 1000,
      idVis: 'visit-current',
      dtBgn: ['2026-05-06 00:00:00', '2026-08-04 23:59:59'],
    });
  });

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
        soapData: {
          vitlSigns: {
            bph: 130,
            bpl: 80,
            healthRate: 76,
            pulseRate: 78,
            breathRate: 18,
            temp: 36.5,
            sdTemp: '2',
            height: 170,
            weight: '60',
            waist: '82',
            bloodFlag: '1',
            insertTime: '2026-05-18 17:20:28',
          },
        },
        diagList: [{ naDiag: '2型糖尿病', cdIcd10: 'E11.900' }],
        orderList: [
          {
            idOrd: 'order-acarbose',
            idMedPro: 'med-acarbose',
            naOrd: '阿卡波糖片',
            sdOrd: '11',
            desOrd: 'null',
            amount: 9,
            unitOrd: '盒',
          },
          {
            idOrd: 'order-metformin',
            idMedPro: 'med-metformin',
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
        presList: [{
          idPres: 'pres-1',
          presSubList: [{
            idPresSub: 'sub-acarbose',
            idOrd: 'order-acarbose',
            idMedPro: 'med-acarbose',
            naMedPro: '☆阿卡波糖片(卡博平)',
            specSale: '50mg*30片/盒',
            doseOnce: '50',
            unitDose: 'mg',
            idFreq: 'TID',
            idFreqText: '每天三次',
            idUsge: '100',
            idUsgeText: '口服',
            takeDays: 14,
            amount: 2,
            unitSale: '盒',
          }, {
            idPresSub: 'sub-metformin',
            idOrd: 'order-metformin',
            idMedPro: 'med-metformin',
            naMedPro: '☆盐酸二甲双胍片',
            specSale: '0.25g*60片/瓶',
            doseOnce: '0.25',
            unitDose: 'g',
            idFreq: 'TID',
            idFreqText: '每天三次',
            idUsge: '100',
            idUsgeText: '口服',
            takeDays: 30,
            amount: 2,
            unitSale: '瓶',
          }],
        }],
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

    expect(history?.visits?.[0]?.medications).toEqual([
      '☆阿卡波糖片(卡博平)（每次50mg 每天三次 口服 14天 共2盒）',
      '☆盐酸二甲双胍片（每次0.25g 每天三次 口服 30天 共2瓶）',
    ]);
    expect(history?.visits?.[0]?.medicationOrders).toEqual([
      expect.objectContaining({
        orderId: 'order-acarbose',
        productId: 'med-acarbose',
        name: '☆阿卡波糖片(卡博平)',
        days: '14',
        totalQty: '2',
        totalUnit: '盒',
      }),
      expect.objectContaining({
        orderId: 'order-metformin',
        productId: 'med-metformin',
        name: '☆盐酸二甲双胍片',
        spec: '0.25g*60片/瓶',
        dose: '0.25',
        doseUnit: 'g',
        frequency: '每天三次',
        frequencyKey: 'TID',
        route: '口服',
        routeKey: '100',
        days: '30',
        totalQty: '2',
        totalUnit: '瓶',
      }),
    ]);
    expect(history?.visits?.[0]).toMatchObject({
      visitId: 'visit-1',
      deptName: '全科门诊',
      diagnoses: ['2型糖尿病'],
      diagnosisEntries: [{ name: '2型糖尿病', code: 'E11.900' }],
      reportedApplications: [{
        applicationId: 'apply-1',
        applicationGroupId: 'apply-group-1',
        name: '空腹血糖（静脉）',
        type: 'lab',
        status: 'reported',
      }],
      vitalSigns: {
        systolicBloodPressure: 130,
        diastolicBloodPressure: 80,
        heartRate: 76,
        pulseRate: 78,
        respiratoryRate: 18,
        temperature: 36.5,
        temperatureTypeText: '腋温',
        heightCm: 170,
        weightKg: 60,
        waistCm: 82,
        firstBloodPressureMeasured: true,
        measuredAt: '2026-05-18 17:20:28',
      },
    });
  });

  it('keeps orderList as a medication fallback when presList is absent', async () => {
    const service = {
      queryPatientAllergy: vi.fn().mockResolvedValue([]),
      queryPatientVisitHistory: vi.fn().mockResolvedValue([{
        idVis: 'visit-fallback',
        idPi: 'patient-1',
        dtBgn: '2026-06-18 08:00:00',
      }]),
      loadClinicMedicalRecord: vi.fn().mockResolvedValue({
        diagList: [{ naDiag: '高血压' }],
        orderList: [{
          idOrd: 'order-amlodipine',
          idMedPro: 'med-amlodipine',
          naOrd: '苯磺酸氨氯地平片',
          sdOrd: '11',
          desOrd: '每日1次 口服',
          amount: 1,
          unitOrd: '盒',
        }],
      }),
    } as unknown as HisService;

    const history = await new PhisHisAdapter(service).fetchPatientHistory('patient-1');

    expect(history?.visits?.[0]?.medications).toEqual([
      '苯磺酸氨氯地平片（每日1次 口服 共1盒）',
    ]);
    expect(history?.visits?.[0]?.medicationOrders).toEqual([
      expect.objectContaining({
        orderId: 'order-amlodipine',
        productId: 'med-amlodipine',
        name: '苯磺酸氨氯地平片',
        totalQty: '1',
        totalUnit: '盒',
      }),
    ]);
  });
});
