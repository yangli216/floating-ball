/**
 * MockHisAdapter
 *
 * 不连接任何真实 HIS 的内置适配器，主要用途：
 * 1. **反向验证抽象层是否够用**：能用 mock 跑通业务路径，说明 `HisAdapter` 接口
 *    没有泄漏 PHIS 私有概念（如果某处不得不读 `raw.idMedPro` 才能工作，那就是抽象漏了）。
 * 2. **本地 demo / E2E**：在没有 PHIS 后端时也能演示语音问诊、用药/检查推荐等功能。
 * 3. **新厂商接入示例**：照着实现一遍即可，不用读 `HisService` 950 行旧代码。
 *
 * 启用方式：
 * ```ts
 * import { registerHisAdapterFactory, setActiveHisVendor, MockHisAdapter } from '@/services/his';
 * registerHisAdapterFactory('mock', () => new MockHisAdapter());
 * setActiveHisVendor('mock');
 * ```
 * 或在 .env 里：`VITE_HIS_VENDOR=mock`（仍需在某处调用一次注册）。
 *
 * 行为约定：
 * - 所有"目录"返回内置的少量样本数据（不影响 CSV fallback 兜底）。
 * - 所有"详情"按入参伪造一份合理结构。
 * - 库存校验固定通过。
 * - 没有 token / baseUrl 概念，永远 ready。
 */

import type { HisAdapter, HisServiceContext, PharmacyOption } from './HisAdapter';
import type {
  DiagnosisCatalogEntry,
  DictionaryEntry,
  InventoryCheckRequest,
  InventoryCheckResult,
  MedicalItemCatalogEntry,
  MedicalItemDetail,
  MedicineCatalogEntry,
  MedicineDetail,
} from './types';

const MOCK_DIAGNOSES: DiagnosisCatalogEntry[] = [
  { id: 'mock-dx-1', code: 'J00', name: '急性鼻咽炎[普通感冒]', keywords: ['感冒', 'gm', 'ganmao'] },
  { id: 'mock-dx-2', code: 'J20.9', name: '急性支气管炎', keywords: ['支气管炎', 'zqgy'] },
  { id: 'mock-dx-3', code: 'I10.x00', name: '原发性高血压', keywords: ['高血压', 'gxy'] },
];

const MOCK_MEDICINES: MedicineCatalogEntry[] = [
  { id: 'mock-med-1', code: 'M001', name: '阿莫西林胶囊', spec: '0.25g*24粒/盒' },
  { id: 'mock-med-2', code: 'M002', name: '布洛芬缓释胶囊', spec: '0.3g*20粒/盒' },
  { id: 'mock-med-3', code: 'M003', name: '苯磺酸氨氯地平片', spec: '5mg*7片/盒' },
];

const MOCK_MEDICAL_ITEMS: MedicalItemCatalogEntry[] = [
  { id: 'mock-itm-1', code: 'EX001', name: '血常规', category: '检验', keywords: ['血常规', 'xcg'] },
  { id: 'mock-itm-2', code: 'EX002', name: '胸部正位X线', category: '检查', keywords: ['胸片', 'xp'] },
  { id: 'mock-itm-3', code: 'EX003', name: '心电图', category: '检查', keywords: ['心电图', 'xdt'] },
];

const MOCK_FREQUENCIES: DictionaryEntry[] = [
  { key: 'qd', text: '每日一次', py: 'mryc', properties: { execCount: 1 } },
  { key: 'bid', text: '每日两次', py: 'mrlc', properties: { execCount: 2 } },
  { key: 'tid', text: '每日三次', py: 'mrsc', properties: { execCount: 3 } },
  { key: 'qid', text: '每日四次', py: 'mrsic', properties: { execCount: 4 } },
];

const MOCK_USAGES: DictionaryEntry[] = [
  { key: 'po', text: '口服', py: 'kf' },
  { key: 'im', text: '肌肉注射', py: 'jrzs' },
  { key: 'iv', text: '静脉注射', py: 'jmzs' },
  { key: 'ext', text: '外用', py: 'wy' },
];

const MOCK_DEPTS: DictionaryEntry[] = [
  { key: 'dept-001', text: '全科', py: 'qk' },
  { key: 'dept-002', text: '检验科', py: 'jyk' },
  { key: 'dept-003', text: '放射科', py: 'fsk' },
];

const MOCK_PHARMACIES: PharmacyOption[] = [
  { idDept: 'dept-pharm-001', idSto: 'sto-001', name: '门诊药房' },
  { idDept: 'dept-pharm-002', idSto: 'sto-002', name: '住院药房' },
];

export class MockHisAdapter implements HisAdapter {
  readonly vendor = 'mock';

  private execDeptId = 'dept-001';

  updateContext(context: HisServiceContext): void {
    // mock 仅记录第一个角色科室，作为默认执行科室
    const first = context?.userRoleDeptIds?.[0];
    if (first) {
      this.execDeptId = first;
    }
  }

  getDefaultExecDeptId(): string {
    return this.execDeptId;
  }

  // ---- 目录 ----

  async fetchDiagnosisCatalog(): Promise<DiagnosisCatalogEntry[]> {
    return MOCK_DIAGNOSES.map((d) => ({ ...d }));
  }

  async fetchInstitutionMedicalItemsCatalog(_orgCode: string): Promise<MedicalItemCatalogEntry[]> {
    return MOCK_MEDICAL_ITEMS.map((i) => ({ ...i }));
  }

  async fetchInstitutionMedicineCatalog(_orgCode: string): Promise<MedicineCatalogEntry[]> {
    return MOCK_MEDICINES.map((m) => ({ ...m }));
  }

  async fetchMedicineStoreIds(_orgCode: string): Promise<string[]> {
    return MOCK_PHARMACIES.map((p) => p.idSto).filter((id): id is string => !!id);
  }

  // ---- 字典 ----

  async fetchFrequencyDictionary(): Promise<DictionaryEntry[]> {
    return MOCK_FREQUENCIES.map((f) => ({ ...f }));
  }

  async fetchMedicineUsageDictionary(): Promise<DictionaryEntry[]> {
    return MOCK_USAGES.map((u) => ({ ...u }));
  }

  async fetchExecutionDepartments(): Promise<DictionaryEntry[]> {
    return MOCK_DEPTS.map((d) => ({ ...d }));
  }

  async fetchAvailablePharmacies(): Promise<PharmacyOption[]> {
    return MOCK_PHARMACIES.map((p) => ({ ...p }));
  }

  // ---- 详情 ----

  async fetchMedicalItemDetail(itemId: string): Promise<MedicalItemDetail | null> {
    const cat = MOCK_MEDICAL_ITEMS.find((i) => i.id === itemId);
    if (!cat) return null;
    return {
      itemId: cat.id,
      itemName: cat.name,
      unit: '次',
      executingDeptId: this.execDeptId,
      raw: { mock: true },
    };
  }

  async fetchMedicineProDetail(productId: string, storeId: string): Promise<MedicineDetail | null> {
    const cat = MOCK_MEDICINES.find((m) => m.id === productId);
    if (!cat) return null;
    return {
      productId: cat.id,
      productName: cat.name,
      medicineId: cat.id,
      medicineName: cat.name,
      active: true,
      specSale: cat.spec,
      unitSale: '盒',
      spec: cat.spec,
      doseUnit: 'mg',
      dose: '1',
      defaultSingleDose: '1',
      defaultFrequency: 'tid',
      defaultRoute: 'po',
      storeId,
      needsSkinTest: false,
      raw: { mock: true },
    };
  }

  // ---- 库存校验 ----

  async checkMedicineInventoryEnough(_items: InventoryCheckRequest[]): Promise<InventoryCheckResult> {
    return { code: 200, message: '' };
  }
}
