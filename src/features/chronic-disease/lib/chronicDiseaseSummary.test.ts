import { describe, expect, it } from 'vitest';
import type { AppPatient } from '@/types/appState';
import type { PatientMemoryBrief } from '@entities/patient-memory';
import { buildChronicDiseaseSummary } from './chronicDiseaseSummary';

function patient(overrides: Partial<AppPatient> = {}): AppPatient {
  return {
    identity: { patientId: 'P001', visitId: 'V001' },
    demographics: { patientName: '林女士', genderText: '女', ageText: '62岁' },
    clinical: { diagnosis: '原发性高血压、2型糖尿病' },
    patientId: 'P001',
    visitId: 'V001',
    patientName: '林女士',
    genderText: '女',
    ageText: '62岁',
    diagnosis: '原发性高血压、2型糖尿病',
    raw: {
      rqflStatus: '3,6',
      contractStatus: '已签约',
      hisOrgId: 'HIS001',
      hisOrgName: '新城社区卫生服务中心',
    },
    ...overrides,
  };
}

function memory(): PatientMemoryBrief {
  return {
    memoryId: 'M001',
    memoryVersion: 2,
    patientId: 'P001',
    qualityStatus: 'fresh',
    conflictCount: 0,
    lastSourceTime: '2026-07-22T08:30:00Z',
    allergies: [],
    chronicConditions: [],
    recentDiagnoses: [],
    recentMedications: [],
    otherFacts: [
      {
        factId: 'F001',
        factType: 'lab_result',
        name: '空腹血糖',
        valueText: '7.8 mmol/L',
        status: 'active',
        confidence: 'structured',
        lastObservedAt: '2026-07-22T08:30:00Z',
      },
    ],
  };
}

describe('buildChronicDiseaseSummary', () => {
  it('keeps public-health management source separate from clinical diagnosis', () => {
    const summary = buildChronicDiseaseSummary({ patient: patient(), patientMemoryBrief: memory() });

    expect(summary.isChronicManaged).toBe(true);
    expect(summary.managedDiseaseTypes).toEqual(['hypertension', 'type2_diabetes']);
    expect(summary.hasSupportedDisease).toBe(true);
    expect(summary.diseaseTags).toEqual([
      expect.objectContaining({ diseaseType: 'hypertension', source: 'public-health' }),
      expect.objectContaining({ diseaseType: 'type2_diabetes', source: 'public-health' }),
    ]);
    expect(summary.contractLabel).toBe('已签约');
    expect(summary.organizationId).toBe('HIS001');
    expect(summary.bloodGlucosePoints).toEqual([
      expect.objectContaining({ value: 7.8, measurementType: 'fasting' }),
    ]);
  });

  it('shows clinical recognition instead of inventing a public-health enrollment', () => {
    const summary = buildChronicDiseaseSummary({
      patient: patient({ raw: {}, diagnosis: '2型糖尿病', clinical: { diagnosis: '2型糖尿病' } }),
    });

    expect(summary.diseaseTags).toEqual([
      expect.objectContaining({ diseaseType: 'type2_diabetes', source: 'clinical' }),
    ]);
    expect(summary.managedDiseaseTypes).toEqual([]);
    expect(summary.hasSupportedDisease).toBe(true);
    expect(summary.isChronicManaged).toBe(false);
    expect(summary.contractLabel).toBe('签约信息待核实');
  });

  it('does not invent trends when no structured measurements exist', () => {
    const summary = buildChronicDiseaseSummary({
      patient: patient({ diagnosis: '上呼吸道感染', clinical: { diagnosis: '上呼吸道感染' }, raw: {} }),
    });

    expect(summary.isChronicManaged).toBe(false);
    expect(summary.bloodPressurePoints).toEqual([]);
    expect(summary.bloodGlucosePoints).toEqual([]);
  });

  it('builds mock HIS trends and follow-up medication summaries from typed history', () => {
    const hisHistory = {
      patientId: 'P001',
      visits: [{
        visitId: 'FU-001',
        visitTime: Date.parse('2026-06-24T09:00:00+08:00'),
        deptName: '全科慢病门诊',
        chiefComplaint: '高糖联合随访',
        diagnoses: ['原发性高血压', '2型糖尿病'],
        vitalSigns: {
          systolicBloodPressure: 142,
          diastolicBloodPressure: 88,
          measuredAt: '2026-06-24T09:05:00+08:00',
        },
        labResults: [{
          name: '空腹血糖',
          value: 7.9,
          unit: 'mmol/L',
          measuredAt: '2026-06-24T08:20:00+08:00',
        }],
        medicationOrders: [{
          name: '盐酸二甲双胍缓释片',
          dose: '0.5',
          doseUnit: 'g',
          frequency: '每日2次',
          route: '口服',
        }],
      }],
    };
    const summary = buildChronicDiseaseSummary({
      patient: patient({
        hisHistory,
        patientHistory: hisHistory,
        clinical: {
          diagnosis: '原发性高血压、2型糖尿病',
          hisHistory,
          currentVitalSigns: {
            systolicBloodPressure: 136,
            diastolicBloodPressure: 82,
            measuredAt: '2026-07-24T09:10:00+08:00',
          },
        },
        currentVitalSigns: {
          systolicBloodPressure: 136,
          diastolicBloodPressure: 82,
          measuredAt: '2026-07-24T09:10:00+08:00',
        },
      }),
    });

    expect(summary.bloodPressurePoints).toEqual([
      expect.objectContaining({ systolic: 142, diastolic: 88 }),
      expect.objectContaining({ systolic: 136, diastolic: 82 }),
    ]);
    expect(summary.bloodGlucosePoints).toEqual([
      expect.objectContaining({ value: 7.9, measurementType: 'fasting' }),
    ]);
    expect(summary.recentMedicationNames).toEqual(['盐酸二甲双胍缓释片']);
    expect(summary.recentMedicationSummaries)
      .toEqual(['盐酸二甲双胍缓释片（0.5g · 每日2次 · 口服）']);
    expect(summary.recentMedicationFacts[0]).toEqual(expect.objectContaining({
      sourceLabel: '随访用药 · 全科慢病门诊',
    }));
  });
});
