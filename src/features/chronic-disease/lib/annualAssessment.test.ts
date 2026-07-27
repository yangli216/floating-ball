import { describe, expect, it } from 'vitest';
import type { ChronicDiseasePatientSummary } from '../types';
import { buildAnnualChronicAssessment } from './annualAssessment';

function summary(): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR001',
    idRecord: 'RECORD001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [],
    managedDiseaseTypes: [],
    hasSupportedDisease: true,
    isChronicManaged: false,
    diagnosisText: '2 型糖尿病',
    lastVisitLabel: '待核实',
    bloodPressurePoints: [
      { measuredAt: '2025-12-31T09:00:00+08:00', systolic: 140, diastolic: 88, sourceLabel: '门诊' },
      { measuredAt: '2026-03-02T09:00:00+08:00', systolic: 136, diastolic: 84, sourceLabel: '门诊' },
    ],
    bloodGlucosePoints: [
      { measuredAt: '2026-05-01T09:00:00+08:00', value: 7.2, measurementType: 'fasting', sourceLabel: '检验' },
      { measuredAt: '2027-01-01T09:00:00+08:00', value: 7.5, measurementType: 'fasting', sourceLabel: '检验' },
    ],
    recentMedicationFacts: [
      { name: '二甲双胍', observedAt: '2026-02-01T09:00:00+08:00', sourceLabel: '患者记忆' },
      { name: '未标日期药物', sourceLabel: '患者记忆' },
    ],
    recentMedicationNames: ['二甲双胍', '未标日期药物'],
    sourceQuality: 'ready',
  };
}

describe('buildAnnualChronicAssessment', () => {
  it('keeps only traceable facts from the selected natural year', () => {
    const assessment = buildAnnualChronicAssessment(summary(), 2026);

    expect(assessment.bloodPressurePoints).toHaveLength(1);
    expect(assessment.bloodGlucosePoints).toHaveLength(1);
    expect(assessment.medicationFacts.map((item) => item.name)).toEqual(['二甲双胍']);
    expect(assessment.latestPressure?.systolic).toBe(136);
    expect(assessment.latestDataAt).toBe('2026-05-01T09:00:00+08:00');
  });
});
