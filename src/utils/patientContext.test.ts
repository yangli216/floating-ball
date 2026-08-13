import { describe, expect, it } from 'vitest';
import { buildPatientContext, toConsultationPatient } from './patientContext';

describe('patientContext age precedence', () => {
  it('lets authoritative PHIS month age override a unitless reception ageNum', () => {
    const context = buildPatientContext({
      payload: {
        idPi: 'patient-infant',
        ageNum: 10,
      },
      hisInfo: {
        patientId: 'patient-infant',
        name: '婴儿',
        gender: 'F',
        ageText: '10个月',
      },
    });

    expect(context?.ageText).toBe('10个月');
    expect(context?.demographics.ageText).toBe('10个月');
    expect(context?.ageYears).toBeUndefined();
    expect(context?.age).toBe('10个月');
    expect(toConsultationPatient(context)).toMatchObject({
      ageText: '10个月',
      ageNum: undefined,
      ageUnit: undefined,
    });
  });

  it('preserves PHIS month and day units from a reception payload', () => {
    expect(buildPatientContext({
      payload: { idPi: 'patient-month', ageNum: 10, ageUnit: 'M' },
    })?.ageText).toBe('10个月');
    expect(buildPatientContext({
      payload: { idPi: 'patient-day', ageNum: 10, ageUnit: 'D' },
    })?.ageText).toBe('10天');
  });

  it('continues to derive ageYears for an explicit year unit', () => {
    const context = buildPatientContext({
      payload: { idPi: 'patient-adult', ageNum: 35, ageUnit: 'Y' },
    });

    expect(context?.ageText).toBe('35岁');
    expect(context?.ageYears).toBe(35);
  });

  it('does not guess years when the reception payload only contains a bare age number', () => {
    const context = buildPatientContext({
      payload: { idPi: 'patient-unknown-unit', age: '10' },
    });

    expect(context?.ageText).toBeUndefined();
    expect(context?.ageYears).toBeUndefined();
  });
});
