import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  hasClinicalResultTreatmentState,
  initClinicalTreatments,
} from './clinicalResultInitialization';

describe('clinicalResultInitialization', () => {
  it('preserves an upstream contextual catalog match and its visible metadata', () => {
    const item = {
      type: 'examination' as const,
      name: 'B超',
      sourceType: 'explicit' as const,
      evidenceText: '医生：给你做个B超检查',
      reason: '医生提出B超；结合上腹部不适补全为腹部彩超',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
      necessity: 'core' as const,
      selected: false,
      matchStatus: 'exact' as const,
      matchedItem: {
        id: 'exam-1',
        code: 'E1',
        name: '肝胆胰脾肾彩超',
      },
    };
    const assessCatalogMatch = vi.fn();

    expect(hasClinicalResultTreatmentState(item)).toBe(true);
    const [result] = initClinicalTreatments([item], {
      assessCatalogMatch,
      inferFrequency: () => '',
      inferRoute: () => '',
      normalize: (recommendation) => recommendation as TreatmentRecommendation,
      buildReason: () => '不应重建',
      shouldAutoSelect: () => true,
    });

    expect(assessCatalogMatch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: 'exam',
      name: '肝胆胰脾肾彩超',
      originalName: 'B超',
      sourceType: 'explicit',
      evidenceText: '医生：给你做个B超检查',
      reason: '医生提出B超；结合上腹部不适补全为腹部彩超',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
      necessity: 'core',
      selected: false,
      matchStatus: 'exact',
      matchedItem: { id: 'exam-1' },
    });
  });
});
