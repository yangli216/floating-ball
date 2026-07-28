// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { medicalDataService } from '@/services/medicalData';
import type { PharmacyOption } from '@/services/his';
import type { AppPatient } from '@/types/appState';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { TreatmentPlanInitialDraft } from './treatmentPlanInitialDraft';
import {
  useTreatmentPlanRecommendations,
  type TreatmentPlanRecommendationOptions,
} from './useTreatmentPlanRecommendations';

function buildPatient(diagnosis: string): AppPatient {
  return {
    identity: {
      patientId: 'PATIENT001',
      visitId: 'VIS001',
    },
    demographics: {
      patientName: '林女士',
    },
    clinical: {
      diagnosis,
      chiefComplaint: '复诊',
      historyOfPresentIllness: '慢病复诊',
    },
    patientId: 'PATIENT001',
    visitId: 'VIS001',
    patientName: '林女士',
    diagnosis,
    chiefComplaint: '复诊',
    historyOfPresentIllness: '慢病复诊',
  };
}

function buildDraft(
  standardDiagnoses?: TreatmentPlanInitialDraft['standardDiagnoses'],
): TreatmentPlanInitialDraft {
  return {
    requestId: 'REQ001',
    patientAnchorId: 'VIS001',
    sourceModule: 'chronic_disease',
    title: '两慢病 AI 推荐',
    ...(standardDiagnoses !== undefined ? { standardDiagnoses } : {}),
    items: [{
      sourceId: 'lab-1',
      type: 'lab_test',
      name: '糖化血红蛋白测定',
      reason: '评估近期血糖控制',
      matchedItem: {
        id: 'CLI-LAB',
        name: '糖化血红蛋白测定',
        idSrv: 'SRV-LAB',
        idCli: 'CLI-LAB',
      },
      matchStatus: 'exact',
    }],
  };
}

function buildOptions(
  draft: TreatmentPlanInitialDraft,
  diagnosisText = '来自病历的自由文本诊断',
): TreatmentPlanRecommendationOptions {
  return {
    patient: ref(buildPatient(diagnosisText)),
    followUpContext: ref(null),
    diagnosis: ref<Diagnosis | null>(null),
    diagnoses: ref<Diagnosis[]>([]),
    treatments: ref<TreatmentRecommendation[]>([]),
    pharmacies: ref<PharmacyOption[]>([]),
    initialDraft: ref<TreatmentPlanInitialDraft | null>(draft),
    normalizeTreatment: (recommendation) => recommendation as TreatmentRecommendation,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTreatmentPlanRecommendations initial draft', () => {
  it('initializes every typed standard diagnosis without matching record free text', () => {
    const matchDiagnosis = vi.spyOn(medicalDataService, 'matchDiagnosis');
    const options = buildOptions(buildDraft([
      { id: 'HTN-ID', code: 'I10.x09', name: '原发性高血压' },
      { id: 'DM2-ID', code: 'E11.900', name: '2型糖尿病' },
    ]));
    const recommendations = useTreatmentPlanRecommendations(options);

    expect(recommendations.initializeFromDraft()).toBe(true);

    expect(matchDiagnosis).not.toHaveBeenCalled();
    expect(options.diagnoses.value).toEqual([
      expect.objectContaining({
        id: 'HTN-ID',
        code: 'I10.x09',
        name: '原发性高血压',
      }),
      expect.objectContaining({
        id: 'DM2-ID',
        code: 'E11.900',
        name: '2型糖尿病',
      }),
    ]);
    expect(options.diagnosis.value).toEqual(expect.objectContaining({
      id: 'HTN-ID',
      name: '原发性高血压',
    }));
  });

  it('keeps free-text diagnosis matching only for legacy drafts without standardDiagnoses', () => {
    vi.spyOn(medicalDataService, 'matchDiagnosis').mockReturnValue({
      id: 'LEGACY-ID',
      code: 'I10',
      name: '原发性高血压',
    });
    const options = buildOptions(
      buildDraft(),
      '原发性高血压',
    );
    const recommendations = useTreatmentPlanRecommendations(options);

    expect(recommendations.initializeFromDraft()).toBe(true);
    expect(options.diagnoses.value).toEqual([
      expect.objectContaining({
        id: 'LEGACY-ID',
        code: 'I10',
        name: '原发性高血压',
      }),
    ]);
    expect(options.diagnosis.value?.id).toBe('LEGACY-ID');
  });

  it('uses the generated chronic-refill record before stale HIS patient fields', () => {
    const draft = buildDraft([
      { id: 'DM2-ID', code: 'E11.900', name: '2型糖尿病' },
    ]);
    draft.recordContext = {
      chiefComplaint: '2型糖尿病复诊配药',
      historyOfPresentIllness: '既往确诊2型糖尿病，近期规律服药，今复诊配药。',
      pastMedicalHistory: '2型糖尿病',
      allergyHistory: '未发现',
    };
    const options = buildOptions(draft, '');
    if (options.patient.value?.clinical) {
      options.patient.value.clinical.chiefComplaint = '';
      options.patient.value.clinical.historyOfPresentIllness = '';
    }
    if (options.patient.value) {
      options.patient.value.chiefComplaint = '';
      options.patient.value.historyOfPresentIllness = '';
    }

    const recommendations = useTreatmentPlanRecommendations(options);

    expect(recommendations.canRecommend.value).toBe(true);
    expect(recommendations.missingContextTips.value).toEqual([]);
    expect(recommendations.recordContext.value).toEqual(expect.objectContaining({
      chiefComplaint: '2型糖尿病复诊配药',
      historyOfPresentIllness: '既往确诊2型糖尿病，近期规律服药，今复诊配药。',
      diagnosisText: '2型糖尿病',
    }));
  });

  it('does not reuse a generated refill record from another visit anchor', () => {
    const draft = buildDraft([
      { id: 'DM2-ID', code: 'E11.900', name: '2型糖尿病' },
    ]);
    draft.patientAnchorId = 'VIS-OTHER';
    draft.recordContext = {
      chiefComplaint: '其他就诊的复诊配药',
      historyOfPresentIllness: '其他就诊生成的现病史。',
      pastMedicalHistory: '',
      allergyHistory: '',
    };
    const options = buildOptions(draft, '');
    if (options.patient.value?.clinical) {
      options.patient.value.clinical.chiefComplaint = '';
      options.patient.value.clinical.historyOfPresentIllness = '';
    }
    if (options.patient.value) {
      options.patient.value.chiefComplaint = '';
      options.patient.value.historyOfPresentIllness = '';
    }

    const recommendations = useTreatmentPlanRecommendations(options);

    expect(recommendations.canRecommend.value).toBe(false);
    expect(recommendations.recordContext.value.historyOfPresentIllness).toBe('');
    expect(recommendations.missingContextTips.value).toEqual(['主诉', '现病史', '诊断']);
  });
});
