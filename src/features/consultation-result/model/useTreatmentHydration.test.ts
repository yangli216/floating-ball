import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { MedicalItemDetail } from '@/services/his';
import { useTreatmentNormalization } from './useTreatmentNormalization';
import { useTreatmentHydration } from './useTreatmentHydration';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
});

const mocks = vi.hoisted(() => ({
  fetchMedicineProDetail: vi.fn(),
  fetchMedicalItemDetail: vi.fn(),
  fetchMedicalItemPartOptions: vi.fn(),
  checkMedicineInventoryEnough: vi.fn(),
  resolveMedicineInventoryUnitPrice: vi.fn(),
}));

vi.mock('@/services/his', () => ({
  getHisAdapter: () => ({
    fetchMedicineProDetail: mocks.fetchMedicineProDetail,
    fetchMedicalItemDetail: mocks.fetchMedicalItemDetail,
    fetchMedicalItemPartOptions: mocks.fetchMedicalItemPartOptions,
    checkMedicineInventoryEnough: mocks.checkMedicineInventoryEnough,
  }),
}));

const frequencyOptions = ref([{
  key: 'TID', text: '每日3次', execCount: 3, py: '', wb: '', mcode: '', normalizedTokens: [],
}, {
  key: 'PRN', text: '必要时', py: '', wb: '', mcode: '', normalizedTokens: [],
}]);
const routeOptions = ref([{
  key: 'PO', text: '口服', py: '', wb: '', mcode: '', normalizedTokens: [],
}]);
const pharmacyOptions = ref([{ idDept: 'dept-1', idSto: 'store-1', name: '西药房' }]);

function createTreatment(dosage = ''): TreatmentRecommendation {
  return {
    type: 'medicine',
    name: '盐酸二甲双胍片',
    reason: '2型糖尿病治疗',
    spec: '0.25g*60片/瓶',
    targetDose: '500',
    targetDoseUnit: 'mg',
    dosage,
    dosageUnit: dosage ? 'g' : '',
    frequency: '每日3次',
    frequencyKey: 'TID',
    route: '口服',
    routeKey: 'PO',
    days: '30',
    totalQty: '99',
    totalUnit: '瓶',
    pharmacy: '西药房',
    selected: true,
    matchedItem: {
      id: 'med-metformin',
      name: '盐酸二甲双胍片',
      spec: '0.25g*60片/瓶',
      storeIds: ['store-1'],
      raw: { idMedPro: 'med-metformin' },
    },
  };
}

function createFinalizer() {
  const normalization = useTreatmentNormalization({
    frequencyOptions,
    routeOptions,
    ensurePharmacy: (rec) => {
      rec.pharmacy ||= '西药房';
    },
    isExecDeptSatisfied: () => true,
  });
  const hydration = useTreatmentHydration({
    pharmacyOptions,
    normalizeTreatment: normalization.normalize,
    getCandidatePharmaciesForMedicine: () => pharmacyOptions.value,
    findFrequencyOptionByValue: normalization.findFrequencyOptionByValue,
    findRouteOptionByValue: normalization.findRouteOptionByValue,
    resolveMedicineInventoryUnitPrice: mocks.resolveMedicineInventoryUnitPrice,
  });
  return { normalization, hydration };
}

describe('medicine recommendation finalization', () => {
  beforeEach(() => {
    mocks.fetchMedicineProDetail.mockResolvedValue({
      productId: 'med-metformin',
      productName: '盐酸二甲双胍片',
      medicineId: 'med-metformin',
      medicineName: '盐酸二甲双胍片',
      manufacturer: '示例制药',
      active: true,
      specSale: '0.25g*60片/瓶',
      unitSale: '瓶',
      spec: '0.25g',
      doseUnit: 'g',
      dose: '0.25',
      defaultSingleDose: '1',
      defaultFrequency: 'TID',
      defaultRoute: 'PO',
      storeId: 'store-1',
      needsSkinTest: false,
      raw: {
        idMedPro: 'med-metformin',
        idSto: 'store-1',
        dose: '0.25',
        unitDose: 'g',
        unitPre: '片',
        unitSaleFactor: '60',
        unitSale: '瓶',
        priceSale: '5',
      },
    });
    mocks.checkMedicineInventoryEnough.mockResolvedValue({ code: 200, message: '' });
    mocks.fetchMedicalItemDetail.mockResolvedValue(null);
    mocks.fetchMedicalItemPartOptions.mockResolvedValue([]);
    mocks.resolveMedicineInventoryUnitPrice.mockResolvedValue(59.3);
  });

  it('uses hydrated dose and package data before checking inventory', async () => {
    const rec = createTreatment();
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec, { checkInventory: true });

    expect(result.ready).toBe(true);
    expect(rec).toMatchObject({
      dosage: '0.5',
      dosageUnit: 'g',
      frequencyKey: 'TID',
      routeKey: 'PO',
      days: '30',
      totalQty: '3',
      totalUnit: '瓶',
      selected: true,
      matchedItem: expect.objectContaining({
        manufacturer: '示例制药',
      }),
    });
    expect(mocks.checkMedicineInventoryEnough).toHaveBeenCalledWith([
      expect.objectContaining({
        productId: 'med-metformin',
        storeId: 'store-1',
        quantity: 3,
        unitPrice: 59.3,
      }),
    ]);
  });

  it('does not fall back to medicine detail price when inventory has no valid price', async () => {
    const rec = createTreatment();
    mocks.resolveMedicineInventoryUnitPrice.mockResolvedValueOnce(null);
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec, { checkInventory: true });

    expect(result.ready).toBe(false);
    expect(result.issues).toContain('盐酸二甲双胍片 未取得当前药房有效库存单价，暂不能校验库存');
    expect(rec.selected).toBe(false);
    expect(mocks.checkMedicineInventoryEnough).not.toHaveBeenCalled();
  });

  it('uses one sale package when PRN frequency cannot produce an exact total', async () => {
    const rec = createTreatment();
    rec.frequency = '必要时';
    rec.frequencyKey = 'PRN';
    rec.days = '3';
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec, { checkInventory: true });

    expect(result.ready).toBe(true);
    expect(rec).toMatchObject({
      frequency: '必要时',
      frequencyKey: 'PRN',
      totalQty: '1',
      totalUnit: '瓶',
      selected: true,
    });
    expect(mocks.checkMedicineInventoryEnough).toHaveBeenCalledWith([
      expect.objectContaining({ quantity: 1 }),
    ]);
  });

  it('preserves a doctor-edited single dose and recalculates its package total', async () => {
    const rec = createTreatment('0.25');
    rec.dosageManualEdited = true;
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec);

    expect(result.ready).toBe(true);
    expect(rec.dosage).toBe('0.25');
    expect(rec.totalQty).toBe('2');
  });

  it('deselects a medicine when frequency cannot map to the HIS dictionary', async () => {
    const rec = createTreatment();
    rec.frequency = '未知频次';
    rec.frequencyKey = '';
    mocks.fetchMedicineProDetail.mockResolvedValueOnce({
      ...(await mocks.fetchMedicineProDetail()),
      defaultFrequency: '',
    });
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec, { checkInventory: true });

    expect(result.ready).toBe(false);
    expect(result.issues).toContain('频次未匹配 HIS 字典');
    expect(rec.selected).toBe(false);
    expect(mocks.checkMedicineInventoryEnough).not.toHaveBeenCalled();
  });

  it('blocks inventory checking when the HIS package factor cannot produce a total', async () => {
    const rec = createTreatment();
    const detail = await mocks.fetchMedicineProDetail();
    mocks.fetchMedicineProDetail.mockResolvedValueOnce({
      ...detail,
      specSale: '0.25g',
      raw: {
        idMedPro: 'med-metformin',
        idSto: 'store-1',
        dose: '0.25',
        unitDose: 'g',
        unitPre: '片',
        unitSale: '瓶',
      },
    });
    const { hydration } = createFinalizer();

    const result = await hydration.finalizeMedicineRecommendation(rec, { checkInventory: true });

    expect(result.ready).toBe(false);
    expect(result.issues).toContain('包装总量不可计算');
    expect(rec.selected).toBe(false);
    expect(mocks.checkMedicineInventoryEnough).not.toHaveBeenCalled();
  });
});

describe('non-medicine recommendation detail hydration', () => {
  beforeEach(() => {
    mocks.fetchMedicalItemDetail.mockReset();
    mocks.fetchMedicalItemPartOptions.mockReset();
    mocks.fetchMedicalItemPartOptions.mockResolvedValue([]);
  });

  function createLabTreatment(): TreatmentRecommendation {
    return {
      type: 'lab_test',
      name: '甲状腺功能5项',
      reason: '评估甲状腺功能',
      selected: false,
      matchedItem: {
        id: 'lab-thyroid',
        code: 'lab-thyroid',
        name: '甲状腺功能5项',
        raw: { idCli: 'lab-thyroid' },
      },
    };
  }

  it('reuses an in-flight detail request and exposes the loading state', async () => {
    let resolveDetail!: (value: MedicalItemDetail) => void;
    mocks.fetchMedicalItemDetail.mockReturnValueOnce(new Promise<MedicalItemDetail>((resolve) => {
      resolveDetail = resolve;
    }));
    const rec = createLabTreatment();
    const { hydration } = createFinalizer();

    const first = hydration.hydrateMatchedMedicalItemDetail(rec);
    const second = hydration.hydrateMatchedMedicalItemDetail(rec);

    expect(hydration.isMedicalItemDetailHydrating(rec)).toBe(true);
    expect(mocks.fetchMedicalItemDetail).toHaveBeenCalledTimes(1);

    resolveDetail({
      itemId: 'lab-thyroid',
      itemName: '甲状腺功能5项',
      executingDeptId: 'dept-lab',
      unit: '项',
      raw: { idDeptExec: 'dept-lab' },
    });
    await Promise.all([first, second]);

    expect(hydration.isMedicalItemDetailHydrating(rec)).toBe(false);
    expect(rec.execDept).toBe('dept-lab');
    expect(rec.totalUnit).toBe('项');
    expect(rec.selected).toBe(false);

    await hydration.hydrateMatchedMedicalItemDetail(rec);
    expect(mocks.fetchMedicalItemDetail).toHaveBeenCalledTimes(1);
  });

  it('does not restore an execution department that the doctor cleared', async () => {
    mocks.fetchMedicalItemDetail.mockResolvedValueOnce({
      itemId: 'lab-thyroid',
      itemName: '甲状腺功能5项',
      executingDeptId: 'dept-lab',
      raw: { idDeptExec: 'dept-lab' },
    });
    const rec = createLabTreatment();
    rec.execDeptCleared = true;
    const { hydration } = createFinalizer();

    await hydration.hydrateMatchedMedicalItemDetail(rec);

    expect(rec.execDept).toBeUndefined();
    expect(rec.matchedItem.raw.__detailLoaded).toBe(true);
  });
});
