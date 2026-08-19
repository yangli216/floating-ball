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

  it('preserves the visible clinical purpose fields for exam and lab recommendations', () => {
    const { normalize } = useTreatmentNormalization({
      frequencyOptions: ref([]),
      routeOptions: ref([]),
    });

    const result = normalize({
      type: 'lab_test',
      name: '血常规',
      goal: '评估感染及血细胞变化',
      goalGroup: '感染与炎症评估',
      goalGroupPurpose: '判断感染证据并评估炎症程度',
      necessity: 'supplementary',
    });

    expect(result).toMatchObject({
      goal: '评估感染及血细胞变化',
      goalGroup: '感染与炎症评估',
      goalGroupPurpose: '判断感染证据并评估炎症程度',
      necessity: 'supplementary',
    });
  });
});
