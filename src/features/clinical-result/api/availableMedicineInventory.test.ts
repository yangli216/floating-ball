import { describe, expect, it, vi } from 'vitest';
import type { HisAdapter } from '@/services/his';
import {
  alignMedicineRecommendationsToInventory,
  formatAvailableMedicineInventoryPrompt,
  loadAvailableMedicineInventoryContext,
  mergeAvailableMedicineInventoryCatalog,
} from './availableMedicineInventory';

vi.mock('@/services/persistentStore', () => ({
  readPersistentString: vi.fn().mockResolvedValue(null),
  writePersistentString: vi.fn().mockResolvedValue(undefined),
}));

describe('available medicine inventory AI context', () => {
  it('merges the same product across pharmacies and emits a compact prompt', () => {
    const catalog = mergeAvailableMedicineInventoryCatalog([
      {
        productId: 'med-1',
        productName: ' ☆脯氨酸恒格列净片',
        spec: '10mg*10片/盒',
        unit: '盒',
        storeId: '1760',
        storeName: '西药房',
        availableQuantity: 12,
      },
      {
        productId: 'med-1',
        productName: ' ☆脯氨酸恒格列净片',
        spec: '10mg*10片/盒',
        unit: '盒',
        storeId: '1761',
        storeName: '门诊药房',
        availableQuantity: 3,
      },
    ]);

    expect(catalog).toEqual([expect.objectContaining({
      productId: 'med-1',
      availableQuantity: 15,
      storeIds: ['1760', '1761'],
    })]);

    const prompt = formatAvailableMedicineInventoryPrompt(catalog);
    expect(prompt).toContain('脯氨酸恒格列净片｜10mg*10片/盒｜可用库存15盒');
    expect(prompt).not.toContain('☆');
    expect(prompt).toContain('目录内临床等效药');
    expect(prompt).toContain('规范通用名');
  });

  it('aligns inventory hits and keeps a clean standard-name fallback', () => {
    const aligned = alignMedicineRecommendationsToInventory([
      { type: 'medicine', name: ' ☆脯氨酸恒格列净片', spec: '10mg' },
      { type: 'medicine', name: '厄贝沙坦片' },
    ], [{
      productId: 'med-1',
      productName: '脯氨酸恒格列净片',
      spec: '10mg*10片/盒',
      unit: '盒',
      availableQuantity: 15,
      storeIds: ['1760'],
      storeNames: ['西药房'],
    }]);

    expect(aligned[0]).toMatchObject({
      name: '脯氨酸恒格列净片',
      spec: '10mg*10片/盒',
    });
    expect(aligned[1].name).toBe('厄贝沙坦片');
  });

  it('still returns the fallback policy when inventory is empty', () => {
    const prompt = formatAvailableMedicineInventoryPrompt([]);
    expect(prompt).toContain('当前未取得可用库存药品');
    expect(prompt).toContain('规范通用名作为无库存参考');
  });

  it('reuses the fresh pharmacy-scoped cache instead of refetching inventory', async () => {
    const fetchInventory = vi.fn().mockResolvedValue([{
      productId: 'med-cache',
      productName: '缓存药品',
      spec: '5mg*10片/盒',
      unit: '盒',
      storeId: 'cache-store',
      availableQuantity: 8,
    }]);
    const adapter = {
      vendor: 'cache-test',
      getContextScope: () => ({ orgCode: 'org-cache', tenantId: 'tenant-cache' }),
      fetchAvailablePharmacies: vi.fn().mockResolvedValue([]),
      fetchAvailableMedicineInventory: fetchInventory,
    } as unknown as HisAdapter;
    const pharmacies = [{ idDept: 'dept', idSto: 'cache-store', name: '测试药房' }];

    await loadAvailableMedicineInventoryContext({ adapter, pharmacies, now: 100_000 });
    const second = await loadAvailableMedicineInventoryContext({ adapter, pharmacies, now: 101_000 });

    expect(fetchInventory).toHaveBeenCalledTimes(1);
    expect(second.promptContext).toContain('缓存药品');
  });
});
