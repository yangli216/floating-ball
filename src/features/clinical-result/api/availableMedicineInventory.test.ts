import { describe, expect, it, vi } from 'vitest';
import type { HisAdapter } from '@/services/his';
import { medicalDataService } from '@/services/medicalData';
import {
  alignMedicineRecommendationsToInventory,
  formatAvailableMedicineInventoryPrompt,
  loadAvailableMedicineInventoryContext,
  mergeAvailableMedicineInventoryCatalog,
  resolveAvailableMedicineInventoryUnitPrice,
} from './availableMedicineInventory';

vi.mock('@/services/persistentStore', () => {
  if (typeof (globalThis as any).localStorage === 'undefined') {
    (globalThis as any).localStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn().mockReturnValue(null),
    };
  }
  return {
    readPersistentString: vi.fn().mockResolvedValue(null),
    writePersistentString: vi.fn().mockResolvedValue(undefined),
  };
});

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

  it('requires a compatible strength when the same medicine has multiple inventory specs', () => {
    const inventory = [
      {
        productId: 'med-5',
        productName: '测试药品片',
        spec: '5mg*14片/盒',
        unit: '盒',
        availableQuantity: 10,
        storeIds: ['1760'],
        storeNames: ['西药房'],
      },
      {
        productId: 'med-10',
        productName: '测试药品片',
        spec: '10mg*14片/盒',
        unit: '盒',
        availableQuantity: 20,
        storeIds: ['1760'],
        storeNames: ['西药房'],
      },
    ];

    const aligned = alignMedicineRecommendationsToInventory([
      { type: 'medicine', name: '测试药品片', spec: '5mg' },
      { type: 'medicine', name: '测试药品片', spec: '20mg' },
      { type: 'medicine', name: '测试药品片' },
    ], inventory);

    expect(aligned[0].spec).toBe('5mg*14片/盒');
    expect(aligned[1].spec).toBe('20mg');
    expect(aligned[2].spec).toBeUndefined();
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

  it('resolves the pharmacy-scoped unit price from the available inventory cache', async () => {
    const fetchInventory = vi.fn().mockResolvedValue([{
      productId: 'med-priced',
      productName: '有价库存药品',
      storeId: 'priced-store',
      availableQuantity: 8,
      unitPrice: 59.3,
    }]);
    const adapter = {
      vendor: 'price-test',
      getContextScope: () => ({ orgCode: 'org-price', tenantId: 'tenant-price' }),
      fetchAvailableMedicineInventory: fetchInventory,
    } as unknown as HisAdapter;

    const unitPrice = await resolveAvailableMedicineInventoryUnitPrice({
      adapter,
      storeId: 'priced-store',
      productId: 'med-priced',
      now: 200_000,
    });

    expect(unitPrice).toBe(59.3);
    expect(fetchInventory).toHaveBeenCalledTimes(1);
  });

  it('syncs in-stock product IDs to medicalDataService on successful load', async () => {
    const originalMedicines = (medicalDataService as any).catalog.medicines;
    const originalActiveInStock = (medicalDataService as any).activeInStockProductIds;

    try {
      (medicalDataService as any).catalog.medicines = [
        { id: 'med-in-stock', name: '有库存药品', storeIds: ['sync-store'] },
        { id: 'med-out-of-stock', name: '无库存药品', storeIds: ['sync-store'] },
      ];
      medicalDataService.setActivePharmacyStoreIds(['sync-store']);

      const fetchInventory = vi.fn().mockResolvedValue([{
        productId: 'med-in-stock',
        productName: '有库存药品',
        storeId: 'sync-store',
        availableQuantity: 10,
        unitPrice: 10.0,
      }]);
      const adapter = {
        vendor: 'sync-test',
        getContextScope: () => ({ orgCode: 'org-sync', tenantId: 'tenant-sync' }),
        fetchAvailablePharmacies: vi.fn().mockResolvedValue([]),
        fetchAvailableMedicineInventory: fetchInventory,
      } as unknown as HisAdapter;
      const pharmacies = [{ idDept: 'dept', idSto: 'sync-store', name: '测试药房' }];

      await loadAvailableMedicineInventoryContext({ adapter, pharmacies, now: 300_000 });

      const matchables = medicalDataService.getMatchableMedicines();
      expect(matchables.map((m) => m.id)).toEqual(['med-in-stock']);
    } finally {
      (medicalDataService as any).catalog.medicines = originalMedicines;
      (medicalDataService as any).activeInStockProductIds = originalActiveInStock;
      medicalDataService.setActivePharmacyStoreIds(null);
    }
  });
});
