import { describe, expect, it } from 'vitest';
import { convertClinicalDoseToUnit } from './treatmentInference';

describe('convertClinicalDoseToUnit', () => {
  it('converts target mg to the PHIS gram dose unit', () => {
    expect(convertClinicalDoseToUnit('250', 'mg', 'g')).toBe('0.25');
    expect(convertClinicalDoseToUnit('500', 'mg', 'g')).toBe('0.5');
  });

  it('keeps target dose in the PHIS milligram unit', () => {
    expect(convertClinicalDoseToUnit('4', 'mg', 'mg')).toBe('4');
  });

  it('supports volume doses without treating them as formulation counts', () => {
    expect(convertClinicalDoseToUnit('5ml', '', 'ml')).toBe('5');
  });

  it('does not convert a clinical dose to a formulation unit', () => {
    expect(convertClinicalDoseToUnit('250', 'mg', '片')).toBeNull();
  });
});
