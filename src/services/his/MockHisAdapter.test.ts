import { describe, expect, it } from 'vitest';
import { MockHisAdapter } from './MockHisAdapter';

describe('MockHisAdapter', () => {
  it('returns pharmacy-scoped medicines that can be matched in the demo flow', async () => {
    const adapter = new MockHisAdapter();

    const medicines = await adapter.fetchInstitutionMedicineCatalog('mock-org');
    const medicineDetail = await adapter.fetchMedicineProDetail('mock-med-1', 'sto-001');
    const inventory = await adapter.fetchAvailableMedicineInventory('sto-001');

    expect(medicines).toContainEqual(expect.objectContaining({
      id: 'mock-med-1',
      name: '阿莫西林胶囊',
      storeIds: expect.arrayContaining(['sto-001']),
    }));
    expect(medicineDetail).toEqual(expect.objectContaining({
      doseUnit: '粒',
      raw: expect.objectContaining({
        unitDose: '粒',
        dftFreq: 'tid',
        dftUsge: 'po',
      }),
    }));
    expect(inventory).toContainEqual(expect.objectContaining({
      productId: 'mock-med-1',
      storeId: 'sto-001',
      unitPrice: expect.any(Number),
    }));
  });

  it('returns the required lab metadata and exam body-site option', async () => {
    const adapter = new MockHisAdapter();

    const lab = await adapter.fetchMedicalItemDetail('mock-itm-1');
    const examParts = await adapter.fetchMedicalItemPartOptions('mock-itm-2');

    expect(lab).toEqual(expect.objectContaining({
      executingDeptId: 'dept-002',
      raw: expect.objectContaining({ jsonField: expect.any(String) }),
    }));
    expect(examParts).toEqual([
      expect.objectContaining({
        partId: 'mock-part-chest',
        partText: '胸部',
      }),
    ]);
  });
});
