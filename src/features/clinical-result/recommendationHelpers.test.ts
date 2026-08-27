import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { getMedicineManufacturer, getTreatmentOriginalName } from './recommendationHelpers';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    },
  });
});

describe('getTreatmentOriginalName', () => {
  it('keeps the doctor wording visible after an explicit contextual catalog completion', () => {
    expect(getTreatmentOriginalName({
      type: 'exam',
      name: '肝胆胰脾肾彩超',
      originalName: 'B超',
      reason: '结合上腹部不适补全',
      sourceType: 'explicit',
      matchStatus: 'exact',
    })).toBe('B超');
  });
});

describe('getMedicineManufacturer', () => {
  it('returns the manufacturer of the actually matched medicine only', () => {
    const medicine = {
      type: 'medicine',
      name: '苯磺酸氨氯地平片',
      reason: '',
      matchedItem: {
        id: 'med-1',
        name: '苯磺酸氨氯地平片',
        manufacturer: '原处方制药',
      },
    } as TreatmentRecommendation;

    expect(getMedicineManufacturer(medicine)).toBe('原处方制药');
    expect(getMedicineManufacturer({
      type: 'exam',
      name: '胸部CT',
      reason: '',
      matchedItem: medicine.matchedItem,
    })).toBe('');
  });
});
