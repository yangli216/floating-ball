import { describe, expect, it } from 'vitest';
import type { AppPatient } from '@/types/appState';
import { buildPatientMemorySyncRequest } from './patientMemoryPayload';

function patientFixture(): AppPatient {
  return {
    patientId: 'PAT-001',
    patientName: '王某',
    genderCode: 'F',
    ageText: '58岁',
    identity: { patientId: 'PAT-001', visitId: 'VIS-CURRENT' },
    demographics: { patientName: '王某', genderCode: 'F', ageText: '58岁' },
    clinical: {
      allergyHistory: '否认食物过敏；青霉素',
      pastMedicalHistory: '高血压，2型糖尿病',
      hisHistory: {
        patientId: 'PAT-001',
        allergyHistory: ['青霉素', '无药物过敏'],
        pastMedicalHistory: ['高血压'],
        visits: [{
          visitId: 'VIS-001',
          visitTime: 1783200000000,
          deptName: '全科门诊',
          chiefComplaint: '高血压复诊',
          vitalSigns: {
            systolicBloodPressure: 130,
            diastolicBloodPressure: 80,
            heartRate: 76,
            temperature: 36.5,
            temperatureTypeText: '腋温',
          },
          diagnosisEntries: [{ name: '2型糖尿病', code: 'E11.9' }],
          medicationOrders: [{
            productId: 'MED-001',
            name: '盐酸二甲双胍片',
            spec: '0.5g×20片',
            dose: '0.5',
            doseUnit: 'g',
            frequency: '每日2次',
            route: '口服',
            days: '30',
            raw: { idMedPro: 'PRIVATE-VALUE' },
          }],
          labResults: [{
            name: '空腹血糖',
            code: 'GLU-F',
            value: 7.8,
            unit: 'mmol/L',
            measuredAt: '2026-07-05T08:20:00+08:00',
          }],
        }],
        raw: { visitItems: [{ privateField: 'DO-NOT-UPLOAD' }] },
      },
    },
    currentVitalSigns: {
      systolicBloodPressure: 150,
      diastolicBloodPressure: 92,
      pulseRate: 88,
      respiratoryRate: 20,
      heightCm: 170,
      weightKg: 60,
      measuredAt: '2026-05-18 17:20:28',
    },
    hisHistory: null,
    idPi: 'PAT-001',
    naPi: '王某',
    raw: { privatePatientField: 'DO-NOT-UPLOAD' },
  } as AppPatient;
}

describe('buildPatientMemorySyncRequest', () => {
  it('builds vendor-neutral incremental observations without PHIS raw payloads', async () => {
    const patient = patientFixture();
    patient.hisHistory = patient.clinical.hisHistory;
    const request = await buildPatientMemorySyncRequest({
      patient,
      hisOrgId: 'HIS-ORG-001',
      knownMemoryVersion: 3,
    });

    expect(request.patient).toEqual(expect.objectContaining({
      patientId: 'PAT-001',
      hisOrgId: 'HIS-ORG-001',
      name: '王某',
      gender: 'F',
      ageText: '58岁',
    }));
    expect(request.knownMemoryVersion).toBe(3);
    expect(request.observations.map((item) => item.sourceKey)).toEqual([
      'patient-profile',
      'allergy-snapshot',
      'past-medical-history',
      'current-vitals:VIS-CURRENT',
      'visit:VIS-001',
    ]);

    const allergy = request.observations.find((item) => item.sourceKey === 'allergy-snapshot');
    expect(allergy?.facts.map((item) => item.name)).toEqual(['青霉素']);
    const visit = request.observations.find((item) => item.sourceKey === 'visit:VIS-001');
    expect(visit?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factType: 'diagnosis', code: 'E11.9', name: '2型糖尿病' }),
      expect.objectContaining({ factType: 'medication', code: 'MED-001', name: '盐酸二甲双胍片' }),
      expect.objectContaining({
        factType: 'lab_result',
        code: 'GLU-F',
        name: '空腹血糖',
        valueText: '7.8 mmol/L',
      }),
      expect.objectContaining({ factType: 'vital', name: '血压', valueText: '130/80 mmHg' }),
      expect.objectContaining({ factType: 'vital', name: '体温（腋温）', valueText: '36.5 ℃' }),
    ]));
    const currentVitals = request.observations.find((item) => item.sourceKey === 'current-vitals:VIS-CURRENT');
    expect(currentVitals?.sourceType).toBe('outpatient_record');
    expect(currentVitals?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factType: 'vital', name: '血压', valueText: '150/92 mmHg' }),
      expect.objectContaining({ factType: 'vital', name: '脉搏', valueText: '88 次/分' }),
      expect.objectContaining({ factType: 'vital', name: '呼吸', valueText: '20 次/分' }),
      expect.objectContaining({ factType: 'vital', name: '身高', valueText: '170 cm' }),
      expect.objectContaining({ factType: 'vital', name: '体重', valueText: '60 kg' }),
    ]));

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain('PRIVATE-VALUE');
    expect(serialized).not.toContain('DO-NOT-UPLOAD');
    expect(request.observations.every((item) => Boolean(item.sourceVersion))).toBe(true);
  });

  it('produces stable source versions for unchanged HIS data', async () => {
    const firstPatient = patientFixture();
    firstPatient.hisHistory = firstPatient.clinical.hisHistory;
    const secondPatient = patientFixture();
    secondPatient.hisHistory = secondPatient.clinical.hisHistory;

    const first = await buildPatientMemorySyncRequest({ patient: firstPatient });
    const second = await buildPatientMemorySyncRequest({ patient: secondPatient });

    expect(first.observations.map((item) => item.sourceVersion))
      .toEqual(second.observations.map((item) => item.sourceVersion));
  });
});
