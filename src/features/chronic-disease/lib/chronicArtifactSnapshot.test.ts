import { describe, expect, it } from 'vitest';
import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseWindowPayload,
  HealthPrescriptionDraft,
} from '../types';
import { buildAnnualChronicAssessment } from './annualAssessment';
import {
  buildAnnualAssessmentSnapshotRequest,
  buildHealthPrescriptionSnapshotRequest,
} from './chronicArtifactSnapshot';

function payload(): ChronicDiseaseWindowPayload {
  const summary: ChronicDiseasePatientSummary = {
    patientId: 'P001',
    visitId: 'V001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    doctorId: 'D001',
    doctorName: '李医生',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [
      {
        diseaseType: 'hypertension',
        label: '高血压管理',
        source: 'public-health',
        sourceLabel: '公卫管理',
        evidenceText: '高血压规范管理',
      },
      {
        diseaseType: 'type2_diabetes',
        label: '2 型糖尿病管理',
        source: 'public-health',
        sourceLabel: '公卫管理',
        evidenceText: '糖尿病规范管理',
      },
    ],
    managedDiseaseTypes: ['hypertension', 'type2_diabetes'],
    hasSupportedDisease: true,
    isChronicManaged: true,
    diagnosisText: '高血压、2 型糖尿病',
    lastVisitLabel: '2026-07-24',
    latestDataAt: '2026-07-24T09:00:00+08:00',
    bloodPressurePoints: [
      { measuredAt: '2026-07-24T08:00:00+08:00', systolic: 136, diastolic: 84, sourceLabel: '门诊' },
    ],
    bloodGlucosePoints: [
      { measuredAt: '2026-07-24T09:00:00+08:00', value: 7.2, measurementType: 'fasting', sourceLabel: '检验' },
    ],
    recentMedicationFacts: [],
    recentMedicationNames: [],
    sourceQuality: 'ready',
  };
  return {
    requestId: 'WINDOW001',
    kind: 'prescription',
    patientAnchor: 'V001',
    summary,
    openedAt: '2026-07-24T10:00:00+08:00',
  };
}

describe('chronic artifact snapshot builders', () => {
  it('persists only doctor-accepted health prescription items with published versions', () => {
    const draft: HealthPrescriptionDraft = {
      generatedAt: '2026-07-24T10:00:00+08:00',
      source: 'ai',
      summary: '医生确认草稿',
      safetyNote: '不得自动调药',
      suggestions: [
        { id: 'A', category: 'test', title: '复查', detail: '检查内容', reason: '患者证据', accepted: true },
        { id: 'B', category: 'lifestyle', title: '运动', detail: '运动建议', reason: '通用建议', accepted: false },
      ],
    };

    const request = buildHealthPrescriptionSnapshotRequest({
      requestId: 'REQ001',
      payload: payload(),
      draft,
      doctorName: ' 李医生 ',
    });

    expect(request.diseaseTypes).toEqual(['hypertension', 'type2_diabetes']);
    expect(request.templateVersions).toEqual(['HTN-FOLLOWUP-2026.1', 'T2DM-FOLLOWUP-2026.1']);
    expect(request.acceptedItems.map((item) => item.itemId)).toEqual(['A']);
    expect(request.doctorName).toBe('李医生');
  });

  it('uses only selected-year metrics for an annual assessment snapshot', () => {
    const windowPayload = payload();
    windowPayload.summary.bloodPressurePoints.unshift({
      measuredAt: '2025-07-24T08:00:00+08:00',
      systolic: 160,
      diastolic: 100,
      sourceLabel: '历史门诊',
    });
    const assessment = buildAnnualChronicAssessment(windowPayload.summary, 2026);

    const request = buildAnnualAssessmentSnapshotRequest({
      requestId: 'REQ002',
      payload: windowPayload,
      assessment,
      doctorName: '李医生',
    });

    expect(request.assessmentYear).toBe(2026);
    expect(request.bloodPressureRecordCount).toBe(1);
    expect(request.systolicPressure).toBe(136);
    expect(request.acceptedItems).toEqual([]);
  });
});
