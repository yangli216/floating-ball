import { describe, expect, it } from 'vitest';
import { formatPatientAgeText, normalizePatientAgeUnit } from './patientAge';

describe('patientAge', () => {
  it('normalizes PHIS year, month and day unit codes', () => {
    expect(normalizePatientAgeUnit('Y')).toBe('岁');
    expect(normalizePatientAgeUnit('M')).toBe('个月');
    expect(normalizePatientAgeUnit('D')).toBe('天');
  });

  it('keeps infant age units instead of defaulting them to years', () => {
    expect(formatPatientAgeText(10, 'M')).toBe('10个月');
    expect(formatPatientAgeText(10, 'D')).toBe('10天');
    expect(formatPatientAgeText('10月')).toBe('10个月');
  });

  it('does not guess a unit for a bare number', () => {
    expect(formatPatientAgeText(10)).toBe('');
    expect(formatPatientAgeText(35, undefined, { assumeYears: true })).toBe('35岁');
  });
});
