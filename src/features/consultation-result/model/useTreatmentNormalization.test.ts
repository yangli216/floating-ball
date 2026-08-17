import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useTreatmentNormalization } from './useTreatmentNormalization';

vi.hoisted(() => {
  const globalObject = globalThis as typeof globalThis & { localStorage?: Storage };
  if (typeof globalObject.localStorage === 'undefined') {
    globalObject.localStorage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };
  }
});

describe('useTreatmentNormalization', () => {
  it('preserves recent prescription evidence for chronic refill medicine cards', () => {
    const { normalize } = useTreatmentNormalization({
      frequencyOptions: ref([]),
      routeOptions: ref([]),
    });
    const recentPrescriptionHistory = {
      lookbackDays: 90,
      matchedName: '盐酸二甲双胍片',
      matchedProductId: 'med-metformin',
      matchBasis: 'product-id' as const,
      entries: [{
        prescribedAt: 100,
        name: '盐酸二甲双胍片',
        totalQty: '2',
        totalUnit: '瓶',
      }],
    };

    const result = normalize({
      type: 'medicine',
      name: '盐酸二甲双胍片',
      reason: '慢病续方',
      recentPrescriptionHistory,
    });

    expect(result.recentPrescriptionHistory).toEqual(recentPrescriptionHistory);
  });
});
