import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  buildTreatmentPlanInitialDraftRecordContext,
  mapTreatmentPlanInitialDraftItems,
  mapTreatmentPlanInitialDraftStandardDiagnoses,
} from './treatmentPlanInitialDraft';

const normalize = (
  recommendation: Partial<TreatmentRecommendation>,
): TreatmentRecommendation => recommendation as TreatmentRecommendation;

describe('mapTreatmentPlanInitialDraftItems', () => {
  it('preserves a confirmed HIS catalog item without rematching it by display name', () => {
    const assessCatalogMatch = vi.fn();
    const [result] = mapTreatmentPlanInitialDraftItems({
      items: [{
        sourceId: 'lab-1',
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        reason: '评估近期血糖控制',
        matchedItem: {
          id: 'lab-1',
          code: 'LAB001',
          name: '糖化血红蛋白测定',
          idSrv: 'SRV-LAB',
          raw: { idCli: 'CLI-LAB' },
        },
        matchStatus: 'exact',
      }],
      assessCatalogMatch,
      normalize,
    });

    expect(assessCatalogMatch).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      selected: true,
      matchStatus: 'exact',
      matchedItem: expect.objectContaining({
        idSrv: 'SRV-LAB',
        raw: { idCli: 'CLI-LAB' },
      }),
    }));
  });

  it('keeps the legacy name-matching fallback for older drafts', () => {
    const assessCatalogMatch = vi.fn(() => ({
      matchedItem: {
        id: 'exam-1',
        code: 'EX001',
        name: '眼底照相',
      },
      suggestedMatchItem: undefined,
      matchStatus: 'exact' as const,
    }));
    const [result] = mapTreatmentPlanInitialDraftItems({
      items: [{
        sourceId: 'legacy-exam',
        type: 'exam',
        name: '眼底检查',
        reason: '筛查视网膜病变',
      }],
      assessCatalogMatch,
      normalize,
    });

    expect(assessCatalogMatch).toHaveBeenCalledWith('exam', '眼底检查');
    expect(result.selected).toBe(true);
    expect(result.matchedItem?.name).toBe('眼底照相');
  });
});

describe('mapTreatmentPlanInitialDraftStandardDiagnoses', () => {
  it('maps every typed draft diagnosis to a standard Diagnosis without losing the HIS id', () => {
    expect(mapTreatmentPlanInitialDraftStandardDiagnoses([
      { id: 'HTN-ID', code: 'I10.x09', name: '原发性高血压' },
      { id: 'DM2-ID', code: 'E11.900', name: '2型糖尿病' },
    ])).toEqual([
      {
        id: 'HTN-ID',
        code: 'I10.x09',
        name: '原发性高血压',
        rate: 'HIS标准诊断',
        rationale: '来自慢病助手疾病标签与 HIS 标准诊断目录匹配',
      },
      {
        id: 'DM2-ID',
        code: 'E11.900',
        name: '2型糖尿病',
        rate: 'HIS标准诊断',
        rationale: '来自慢病助手疾病标签与 HIS 标准诊断目录匹配',
      },
    ]);
  });
});

describe('buildTreatmentPlanInitialDraftRecordContext', () => {
  it('copies and trims the generated refill record without treating it as a saved HIS record', () => {
    expect(buildTreatmentPlanInitialDraftRecordContext({
      chiefComplaint: ' 2型糖尿病复诊配药 ',
      historyOfPresentIllness: ' 既往确诊2型糖尿病，今复诊配药。 ',
      pastMedicalHistory: ' 2型糖尿病 ',
      allergyHistory: ' 未发现 ',
      currentMedicationHistory: '',
      familyHistory: '',
      symptoms: [],
      negativeSymptoms: [],
      diagnoses: [],
      treatments: [],
      treatmentPlan: '',
      healthEducation: '',
      channel: 'chronic-refill',
    })).toEqual({
      chiefComplaint: '2型糖尿病复诊配药',
      historyOfPresentIllness: '既往确诊2型糖尿病，今复诊配药。',
      pastMedicalHistory: '2型糖尿病',
      allergyHistory: '未发现',
    });
  });
});
