import { describe, expect, it } from 'vitest';
import { buildPatientContext } from '@/utils/patientContext';
import {
  applyReceptionClinicalHistorySummaries,
  resolveIncomingPatientTracking,
} from './receptionPatientSummary';

describe('receptionPatientSummary', () => {
  it('replaces generated placeholders with structured HIS history', () => {
    const patient = buildPatientContext({
      payload: {
        patientId: 'patient-1',
        name: '张建国',
        pastMedicalHistory: '未提供既往病史。',
      },
    });
    const result = applyReceptionClinicalHistorySummaries(patient, {
      patientId: 'patient-1',
      pastMedicalHistory: ['高血压病史5年'],
      allergyHistory: ['青霉素过敏'],
    });

    expect(result?.pastMedicalHistory).toBe('高血压病史5年');
    expect(result?.allergyHistory).toBe('青霉素过敏');
    expect(result?.clinical.hisHistory?.patientId).toBe('patient-1');
  });

  it('uses patient and visit payload aliases for tracking', () => {
    expect(resolveIncomingPatientTracking({
      idPi: 'patient-1',
      naPi: '张建国',
    })).toEqual({
      patientId: 'patient-1',
      patientName: '张建国',
    });
  });
});
