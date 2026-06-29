import { describe, expect, it, vi } from 'vitest';
import type { HisService } from '../hisService';
import { PhisHisAdapter } from './PhisHisAdapter';

describe('PhisHisAdapter.fetchPatientHistory', () => {
  it('maps only medication orders and removes literal null descriptions', async () => {
    const service = {
      queryPatientAllergy: vi.fn().mockResolvedValue([]),
      queryPatientVisitHistory: vi.fn().mockResolvedValue([{
        idVis: 'visit-1',
        idPi: 'patient-1',
        dtBgn: '2026-06-20 08:00:00',
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
      }),
    } as unknown as HisService;

    const history = await new PhisHisAdapter(service).fetchPatientHistory('patient-1');

    expect(history?.visits?.[0]?.medications).toEqual(['盐酸二甲双胍片（3瓶）']);
  });
});
