import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { getMedicineManufacturer } from './recommendationHelpers';

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
