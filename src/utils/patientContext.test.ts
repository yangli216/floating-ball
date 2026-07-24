import { describe, expect, it } from 'vitest';
import { buildPatientContext, getPatientContextHistory } from './patientContext';

describe('buildPatientContext', () => {
  it('accepts vendor-neutral vitals and history from a patient risk payload', () => {
    const patient = buildPatientContext({
      payload: {
        idPi: 'MOCK-CD-DUAL-001',
        idVis: 'MOCK-CD-DUAL-VIS-001',
        naPi: '林女士',
        currentMedicationHistory: '苯磺酸氨氯地平片、盐酸二甲双胍缓释片',
        currentVitalSigns: {
          systolicBloodPressure: 136,
          diastolicBloodPressure: 82,
          measuredAt: '2026-07-24T09:10:00+08:00',
        },
        hisHistory: {
          patientId: 'MOCK-CD-DUAL-001',
          visits: [{
            visitId: 'MOCK-FU-001',
            visitTime: Date.parse('2026-06-24T09:00:00+08:00'),
            chiefComplaint: '高糖联合随访',
            vitalSigns: {
              systolicBloodPressure: 138,
              diastolicBloodPressure: 84,
            },
            labResults: [{
              name: '空腹血糖',
              value: 7.3,
              unit: 'mmol/L',
            }],
            medicationOrders: [{
              name: '盐酸二甲双胍缓释片',
              dose: '0.5',
              doseUnit: 'g',
              frequency: '每日2次',
              route: '口服',
            }],
          }],
        },
      },
      source: 'show-patient-risks',
    });

    expect(patient?.currentVitalSigns).toEqual(expect.objectContaining({
      systolicBloodPressure: 136,
      diastolicBloodPressure: 82,
    }));
    expect(patient?.clinical.currentMedicationHistory)
      .toContain('盐酸二甲双胍缓释片');
    expect(getPatientContextHistory(patient)?.visits?.[0]).toEqual(expect.objectContaining({
      visitId: 'MOCK-FU-001',
      labResults: [expect.objectContaining({ name: '空腹血糖', value: 7.3 })],
      medicationOrders: [expect.objectContaining({ name: '盐酸二甲双胍缓释片' })],
    }));
  });

  it('ignores malformed history arrays instead of exposing them to consumers', () => {
    const patient = buildPatientContext({
      payload: {
        idPi: 'MOCK-CD-SAFE-001',
        hisHistory: {
          patientId: 'MOCK-CD-SAFE-001',
          visits: 'not-an-array',
          allergyHistory: 'not-an-array',
        },
      },
    });

    expect(getPatientContextHistory(patient)).toEqual(expect.objectContaining({
      patientId: 'MOCK-CD-SAFE-001',
      visits: [],
      allergyHistory: undefined,
    }));
  });
});
