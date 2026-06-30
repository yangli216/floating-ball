import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { buildClinicalResultTreatmentRecommendationsFromRaw } from './clinicalResultAiMapping';

function normalize(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return {
    type: rec.type || 'medicine',
    name: rec.name || '',
    reason: rec.reason || '',
    ...rec,
  } as TreatmentRecommendation;
}

describe('clinical result AI treatment mapping', () => {
  it('discards model package totals while retaining the clinical target dose', () => {
    const [result] = buildClinicalResultTreatmentRecommendationsFromRaw({
      rawRecommendations: [{
        type: 'medicine',
        name: '盐酸二甲双胍片',
        targetDose: '500',
        targetDoseUnit: 'mg',
        totalQty: '99',
        totalUnit: '瓶',
      }],
      type: 'medicine',
      match: () => ({ matchStatus: 'unmatched' }),
      normalize,
    });

    expect(result).toMatchObject({
      targetDose: '500',
      targetDoseUnit: 'mg',
      totalQty: '',
      totalUnit: '',
      totalManualEdited: false,
    });
  });
});
