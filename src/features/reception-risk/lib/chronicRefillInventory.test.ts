import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const g = globalThis as any;
  if (typeof g.localStorage === 'undefined') {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
  }
});

import { buildChronicRefillInventoryTreatments, parseHistoricalMedication } from './chronicRefillInventory';

describe('parseHistoricalMedication', () => {
  it('correctly parses various historical medication text formats', () => {
    const case1 = parseHistoricalMedication('阿司匹林肠溶片 100mg*30片 每次100mg 一日一次 口服 30天');
    expect(case1).toEqual({
      dosage: '100',
      dosageUnit: 'mg',
      frequency: '一日一次',
      route: '口服',
      days: '30',
    });

    const case2 = parseHistoricalMedication('二甲双胍片 0.5g*100片 一次1.5片 一日3次');
    expect(case2).toEqual({
      dosage: '1.5',
      dosageUnit: '片',
      frequency: '一日3次',
    });

    const case3 = parseHistoricalMedication('阿莫西林胶囊 共2盒');
    expect(case3).toEqual({
      totalQty: '2',
      totalUnit: '盒',
    });

    const case4 = parseHistoricalMedication('阿莫西林胶囊 2盒');
    expect(case4).toEqual({
      totalQty: '2',
      totalUnit: '盒',
    });
  });
});

describe('buildChronicRefillInventoryTreatments', () => {
  it('keeps only historical medicines that exist in current valid inventory and attaches properties', () => {
    const treatments = buildChronicRefillInventoryTreatments([
      '苯磺酸氨氯地平片（5mg*28片） 一次5mg 一日一次 口服 30天',
      '厄贝沙坦片 150mg',
    ], [{
      productId: 'med-1',
      productName: '苯磺酸氨氯地平片',
      spec: '5mg*28片/盒',
      unit: '盒',
      availableQuantity: 12,
      storeIds: ['1760'],
      storeNames: ['西药房'],
    }]);

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toMatchObject({
      type: 'medicine',
      name: '苯磺酸氨氯地平片',
      selected: true,
      matchStatus: 'exact',
      dosage: '5',
      dosageUnit: 'mg',
      frequency: '一日一次',
      route: '口服',
      days: '30',
      matchedItem: {
        id: 'med-1',
        storeIds: ['1760'],
      },
    });
    expect(treatments[1]).toMatchObject({
      type: 'medicine',
      name: '厄贝沙坦片 150mg',
      selected: false,
      matchStatus: 'unmatched',
      matchedItem: null,
    });
  });
});
