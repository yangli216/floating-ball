import { describe, expect, it } from 'vitest';
import type { AppPatient } from '@/types/appState';
import { buildTwoChronicRefillEvidence } from './twoChronicRefillEvidence';

function patient(overrides: Partial<AppPatient> = {}): AppPatient {
  return {
    identity: { patientId: 'patient-1', visitId: 'current-visit-1' },
    demographics: { patientName: '晓康', genderText: '男', ageText: '81岁' },
    clinical: {},
    patientId: 'patient-1',
    visitId: 'current-visit-1',
    patientName: '晓康',
    source: 'open-chronic-disease-management',
    raw: {
      rqflStatus: '3',
      diagnosis: '原发性高血压;2型糖尿病',
      visitInfos: [{
        idPherec: 'follow-up-1',
        dtVisit: '2026-07-28 17:23:52',
        drugList: [{
          naDrug: '盐酸二甲双胍片',
          sdDrugFreq: '每天一次',
          perDose: 250,
          doseUnit: 'mg',
        }],
      }, {
        idPherec: 'follow-up-2',
        dtVisit: '2026-06-28 17:23:52',
        drugList: [{
          naDrug: '苯磺酸氨氯地平片',
          sdDrugFreq: '每天一次',
          perDose: 5,
          doseUnit: 'mg',
        }],
      }],
    },
    ...overrides,
  };
}

describe('buildTwoChronicRefillEvidence', () => {
  it('keeps original two-chronic diagnosis names and historical follow-up medicines', () => {
    expect(buildTwoChronicRefillEvidence(patient())).toEqual({
      diagnoses: [
        { name: '原发性高血压' },
        { name: '2型糖尿病' },
      ],
      medications: [
        '盐酸二甲双胍片（250mg · 每天一次）',
        '苯磺酸氨氯地平片（5mg · 每天一次）',
      ],
      visitCount: 2,
      evidenceLabel: '两慢病历史记录',
    });
  });

  it('does not use the same raw payload outside the two-chronic direct-open flow', () => {
    expect(buildTwoChronicRefillEvidence(patient({ source: 'receive-patient' }))).toBeNull();
  });

  it('does not turn management labels without historical follow-up into refill evidence', () => {
    expect(buildTwoChronicRefillEvidence(patient({
      raw: {
        rqflStatus: '3,6',
        diagnosis: '原发性高血压;2型糖尿病',
        visitInfos: [],
      },
    }))).toBeNull();
  });
});
