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
      '苯磺酸氨氯地平片（5mg*28片） 一次5mg 一日一次 口服 30天 共2盒',
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
      totalQty: '2',
      totalUnit: '盒',
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

  it('uses structured AI prescription fields when historical medicine has no directions', () => {
    const treatments = buildChronicRefillInventoryTreatments([{
      name: '盐酸二甲双胍片',
      spec: '0.25g*60片/瓶',
      targetDose: '500',
      targetDoseUnit: 'mg',
      frequency: '每日3次',
      frequencyKey: 'TID',
      route: '口服',
      routeKey: 'PO',
      days: '14',
      totalQty: '2',
      totalUnit: '瓶',
      reason: '糖尿病慢病续方常规方案',
    }], [{
      productId: 'med-metformin',
      productName: '盐酸二甲双胍片',
      spec: '0.25g*60片/瓶',
      unit: '瓶',
      availableQuantity: 20,
      storeIds: ['1760'],
      storeNames: ['西药房'],
    }], undefined, {
      historicalMedications: ['盐酸二甲双胍片（0.25g*60片/瓶）'],
    });

    expect(treatments).toHaveLength(1);
    expect(treatments[0]).toMatchObject({
      name: '盐酸二甲双胍片',
      selected: false,
      targetDose: '500',
      targetDoseUnit: 'mg',
      dosage: '',
      dosageUnit: '',
      frequency: '每日3次',
      frequencyKey: 'TID',
      route: '口服',
      routeKey: 'PO',
      days: '14',
      totalQty: '',
      totalUnit: '',
      reason: '糖尿病慢病续方常规方案',
    });
  });

  it('replaces model arithmetic in the recommendation reason with clinical evidence', () => {
    const treatments = buildChronicRefillInventoryTreatments([{
      name: '盐酸二甲双胍片',
      spec: '0.25g*60片/瓶',
      targetDose: '500',
      targetDoseUnit: 'mg',
      frequency: '每天三次',
      frequencyKey: 'TID',
      route: '口服',
      routeKey: 'PO',
      days: '30',
      totalQty: '3',
      totalUnit: '瓶',
      reason: '单次0.5g即2片，每日3次，30天共需90片',
    }], [{
      productId: 'med-metformin',
      productName: '盐酸二甲双胍片',
      spec: '0.25g*60片/瓶',
      unit: '瓶',
      availableQuantity: 20,
      storeIds: ['1760'],
      storeNames: ['西药房'],
    }], undefined, {
      historicalMedications: ['盐酸二甲双胍片（0.25g*60片/瓶）'],
    });

    expect(treatments[0].reason).toContain('历史处方包含盐酸二甲双胍片');
    expect(treatments[0].reason).not.toContain('90片');
    expect(treatments[0]).toMatchObject({
      targetDose: '500',
      targetDoseUnit: 'mg',
      dosage: '',
      dosageUnit: '',
      frequencyKey: 'TID',
      days: '30',
      totalQty: '',
      totalUnit: '',
    });
  });

  it('does not fabricate fixed dosage or duration when prescription fields are unavailable', () => {
    const treatments = buildChronicRefillInventoryTreatments([
      '达格列净片 10mg',
    ], [{
      productId: 'med-dapagliflozin',
      productName: '达格列净片',
      spec: '10mg*14片/盒',
      unit: '盒',
      availableQuantity: 10,
      storeIds: ['1760'],
      storeNames: ['西药房'],
    }]);

    expect(treatments[0]).toMatchObject({
      selected: false,
      dosage: '',
      dosageUnit: '',
      frequency: '',
      route: '',
      days: '',
      totalQty: '',
      totalUnit: '',
    });
  });
});
