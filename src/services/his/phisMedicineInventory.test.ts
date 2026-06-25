import { describe, expect, it } from 'vitest';
import { mergePhisAvailableMedicineInventory } from './phisMedicineInventory';

describe('mergePhisAvailableMedicineInventory', () => {
  it('filters invalid batches and merges available quantity by idMedPro', () => {
    const items = mergePhisAvailableMedicineInventory([
      {
        idMedPro: 'med-1',
        naMedPro: ' ☆脯氨酸恒格列净片',
        idSto: '1760',
        idStoText: '西药房',
        specSale: '10mg*10片/盒',
        unitSale: '盒',
        naFac: '江苏恒瑞医药股份有限公司',
        amountCur: 2,
        fgActive: '1',
        dtEffect: '2026-11-24',
      },
      {
        idMedPro: 'med-1',
        naMedPro: ' ☆脯氨酸恒格列净片',
        idSto: '1760',
        specSale: '10mg*10片/盒',
        unitSale: '盒',
        amountCur: 10,
        fgActive: '1',
        dtEffect: '2026-12-28',
      },
      {
        idMedPro: 'med-2',
        naMedPro: '零库存药品',
        idSto: '1760',
        amountCur: 0,
        fgActive: '1',
        dtEffect: '2027-01-01',
      },
      {
        idMedPro: 'med-3',
        naMedPro: '过期药品',
        idSto: '1760',
        amountCur: 5,
        fgActive: '1',
        dtEffect: '2025-01-01',
      },
      {
        idMedPro: 'med-4',
        naMedPro: '停用药品',
        idSto: '1760',
        amountCur: 5,
        fgActive: '0',
        dtEffect: '2027-01-01',
      },
    ], '1760', Date.parse('2026-06-25T00:00:00+08:00'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: 'med-1',
      productName: '☆脯氨酸恒格列净片',
      availableQuantity: 12,
      nearestExpiryDate: '2026-11-24',
      storeId: '1760',
    });
    expect(items[0].raw?.batchCount).toBe(2);
  });
});
