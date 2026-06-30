import { describe, expect, it } from 'vitest';
import { normalizeRawTreatmentRecommendationFields } from './clinicalResultTreatmentFields';

describe('normalizeRawTreatmentRecommendationFields', () => {
  it('keeps the structured target clinical dose for medicine recommendations', () => {
    expect(normalizeRawTreatmentRecommendationFields({
      type: 'medicine',
      name: '头孢呋辛酯片',
      targetDose: '250',
      targetDoseUnit: 'mg',
      dosage: '',
      dosageUnit: '',
    })).toMatchObject({
      targetDose: '250',
      targetDoseUnit: 'mg',
      dosage: '',
      dosageUnit: '',
    });
  });

  it('moves a legacy mass dosage into targetDose before HIS hydration', () => {
    expect(normalizeRawTreatmentRecommendationFields({
      type: 'medicine',
      name: '对乙酰氨基酚片',
      dosage: '0.5g',
      dosageUnit: '',
    })).toMatchObject({
      targetDose: '0.5',
      targetDoseUnit: 'g',
      dosage: '',
      dosageUnit: '',
    });
  });

  it('retains an explicit formulation-unit dosage', () => {
    expect(normalizeRawTreatmentRecommendationFields({
      type: 'medicine',
      name: '测试药品',
      dosage: '1片',
      dosageUnit: '',
    })).toMatchObject({
      dosage: '1',
      dosageUnit: '片',
    });
  });
});
