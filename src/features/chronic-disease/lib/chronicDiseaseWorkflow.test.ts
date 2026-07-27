import { describe, expect, it } from 'vitest';
import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseWindowPayload,
} from '../types';
import {
  getManagedFollowUpDiseases,
  getPrimaryManagedDisease,
  isChronicFollowUpEligible,
} from './chronicDiseaseEligibility';
import { buildChronicDiseaseViewKey } from './chronicDiseaseWindowSession';
import {
  buildChronicTreatmentPlanInitialDraft,
} from './chronicTreatmentPlanDraft';

function summary(source: 'public-health' | 'clinical'): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR001',
    idRecord: 'RECORD001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [
      {
        diseaseType: 'type2_diabetes',
        label: '2 型糖尿病',
        source,
        sourceLabel: source === 'public-health' ? '公卫管理' : '临床识别',
        evidenceText: source === 'public-health' ? '6' : undefined,
      },
    ],
    managedDiseaseTypes: source === 'public-health' ? ['type2_diabetes'] : [],
    hasSupportedDisease: true,
    isChronicManaged: source === 'public-health',
    diagnosisText: '2 型糖尿病',
    lastVisitLabel: '待核实',
    bloodPressurePoints: [],
    bloodGlucosePoints: [],
    recentMedicationFacts: [],
    recentMedicationNames: [],
    sourceQuality: 'partial',
  };
}

describe('chronic disease workflow boundaries', () => {
  it('allows formal follow-up only for a disease with explicit public-health evidence', () => {
    expect(isChronicFollowUpEligible(summary('clinical'), 'type2_diabetes')).toBe(false);
    expect(isChronicFollowUpEligible(summary('clinical'))).toBe(false);
    expect(isChronicFollowUpEligible(summary('public-health'), 'type2_diabetes')).toBe(true);
    expect(isChronicFollowUpEligible(summary('public-health'))).toBe(true);
    expect(getManagedFollowUpDiseases(summary('public-health'))).toEqual(['type2_diabetes']);
    expect(getPrimaryManagedDisease(summary('public-health'))).toBe('type2_diabetes');
  });

  it('converts doctor-selected chronic checks into a patient-bound treatment draft', () => {
    const suggestions = [
      {
        id: 'lab-hba1c',
        type: 'lab_test' as const,
        name: '糖化血红蛋白',
        reason: '近期血糖控制评估',
        matchedItem: {
          id: 'lab-hba1c',
          code: 'LAB001',
          name: '糖化血红蛋白',
          idSrv: 'SRV001',
          sdSrv: 'LAB',
        },
      },
      {
        id: 'exam-fundus',
        type: 'exam' as const,
        name: '眼底检查',
        reason: '糖尿病视网膜病变筛查核实',
        matchedItem: {
          id: 'exam-fundus',
          code: 'EXAM001',
          name: '眼底检查',
          idSrv: 'SRV002',
          sdSrv: 'EXAM',
        },
      },
    ];
    const draft = buildChronicTreatmentPlanInitialDraft({
      patientAnchorId: 'VIS001',
      suggestions,
      selectedIds: ['lab-hba1c', 'exam-fundus'],
      requestId: 'REQ001',
    });

    expect(draft.patientAnchorId).toBe('VIS001');
    expect(draft.items).toEqual([
      expect.objectContaining({
        sourceId: 'lab-hba1c',
        type: 'lab_test',
        matchedItem: expect.objectContaining({ idSrv: 'SRV001' }),
      }),
      expect.objectContaining({
        sourceId: 'exam-fundus',
        type: 'exam',
        matchedItem: expect.objectContaining({ idSrv: 'SRV002' }),
      }),
    ]);
  });

  it('changes the child view key when the patient or request changes', () => {
    const payload: ChronicDiseaseWindowPayload = {
      requestId: 'REQ001',
      kind: 'assessment',
      patientAnchor: 'PHR001:RECORD001',
      summary: summary('public-health'),
      openedAt: '2026-07-24T10:00:00+08:00',
    };

    expect(buildChronicDiseaseViewKey(payload)).not.toBe(buildChronicDiseaseViewKey({
      ...payload,
      requestId: 'REQ002',
      patientAnchor: 'P002:V002',
    }));
  });
});
