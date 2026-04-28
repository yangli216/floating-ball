/**
 * PhisHisAdapter
 *
 * 默认 HIS 厂商适配器：包装现有 `HisService` 类（即"国卫 PHIS / 院端 HIS"接入形态）。
 *
 * 之所以做成 thin wrapper 而不是搬代码：
 * - `HisService` 已稳定运行，方法签名和返回值都被业务方依赖，不能在抽象迁移这一步顺便改行为；
 * - 通过 wrapper 暴露 `HisAdapter` 接口后，业务方就只面向接口编程，未来要替换/迁移
 *   `HisService` 内部实现时不会牵连上层；
 * - 新厂商对接时不再需要复用 `HisService`，可以直接独立实现 `HisAdapter`。
 *
 * 当前会话/认证状态仍由 `HisService` 自己持有（baseUrl + token），由
 * `useEventListeners` 在 SDK handshake 时通过 `getHisService(baseUrl, auth)` 注入。
 * 适配器层对此无感。
 */

import { HisService } from '../hisService';
import type {
  HisDiagnosisCatalogItem,
  HisDictionaryItem,
  HisMedicalItemCatalogItem,
  HisMedicineCatalogItem,
} from '../hisService';
import type { HisAdapter, HisServiceContext } from './HisAdapter';
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

const trim = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
};

/** PHIS 业务类型编码 ↔ 中性枚举 */
const PHIS_BUSINESS_TYPE_MAP: Record<InventoryCheckRequest['businessType'], '1' | '2' | '3'> = {
  outpatient: '1',
  inpatient: '2',
  emergency: '3',
};

function mapDiagnosisCatalog(item: HisDiagnosisCatalogItem): DiagnosisCatalogEntry {
  return {
    id: trim(item.id) ?? trim(item.code) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    keywords: item.keywords,
    raw: { ...item },
  };
}

function mapMedicineCatalog(item: HisMedicineCatalogItem): MedicineCatalogEntry {
  const storeIds = Array.isArray(item.storeIds)
    ? Array.from(new Set(item.storeIds.map((value) => trim(value)).filter((value): value is string => Boolean(value))))
    : [];
  // PHIS 私有字段（idSrv / naSrv / sdSrv / idDeptExec / fgCheckOrd / fgSkintest）
  // 全部塞进 raw，业务通用代码不再访问
  return {
    id: trim(item.id) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    spec: trim(item.spec),
    storeIds,
    raw: {
      ...(item.raw && typeof item.raw === 'object' ? item.raw : {}),
      storeIds,
      idSrv: item.idSrv,
      naSrv: item.naSrv,
      sdSrv: item.sdSrv,
      idDeptExec: item.idDeptExec,
      fgCheckOrd: item.fgCheckOrd,
      fgSkintest: item.fgSkintest,
    },
  };
}

function mapMedicalItemCatalog(item: HisMedicalItemCatalogItem): MedicalItemCatalogEntry {
  return {
    id: trim(item.id) ?? '',
    code: trim(item.code),
    name: trim(item.name) ?? '',
    category: trim(item.category),
    keywords: item.keywords,
    raw: {
      ...(item.raw && typeof item.raw === 'object' ? item.raw : {}),
      idSrv: item.idSrv,
      naSrv: item.naSrv,
      sdSrv: item.sdSrv,
      idDeptExec: item.idDeptExec,
      idPart: item.idPart,
      jsonField: item.jsonField,
      fgCheckOrd: item.fgCheckOrd,
    },
  };
}

function mapDictionaryItem(item: HisDictionaryItem): DictionaryEntry | null {
  const text = trim(item.text);
  const key = trim(item.key) ?? text;
  if (!key || !text) return null;

  // 抽出已知中性字段，剩余的塞进 properties 透传
  const { key: _k, text: _t, py, wb, mcode, ...rest } = item;
  return {
    key,
    text,
    py: trim(py),
    wb: trim(wb),
    mcode: trim(mcode),
    properties: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

function mapDictionaryItems(items: HisDictionaryItem[]): DictionaryEntry[] {
  const result: DictionaryEntry[] = [];
  for (const item of items) {
    const entry = mapDictionaryItem(item);
    if (entry) result.push(entry);
  }
  return result;
}

export class PhisHisAdapter implements HisAdapter {
  readonly vendor = 'phis';

  constructor(private readonly service: HisService) {}

  updateContext(context: HisServiceContext): void {
    this.service.updateContext(context);
  }

  getDefaultExecDeptId(): string {
    return this.service.getDefaultExecDeptId();
  }

  // ---- 目录 ----

  async fetchDiagnosisCatalog(): Promise<DiagnosisCatalogEntry[]> {
    const items = await this.service.fetchDiagnosisCatalog();
    return items.map(mapDiagnosisCatalog);
  }

  async fetchInstitutionMedicalItemsCatalog(orgCode: string): Promise<MedicalItemCatalogEntry[]> {
    const items = await this.service.fetchInstitutionMedicalItemsCatalog(orgCode);
    return items.map(mapMedicalItemCatalog);
  }

  async fetchInstitutionMedicineCatalog(orgCode: string): Promise<MedicineCatalogEntry[]> {
    const items = await this.service.fetchInstitutionMedicineCatalog(orgCode);
    return items.map(mapMedicineCatalog);
  }

  fetchMedicineStoreIds(orgCode: string) {
    return this.service.fetchMedicineStoreIds(orgCode);
  }

  // ---- 字典 ----

  async fetchFrequencyDictionary(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchFrequencyDictionary());
  }

  async fetchMedicineUsageDictionary(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchMedicineUsageDictionary());
  }

  async fetchExecutionDepartments(): Promise<DictionaryEntry[]> {
    return mapDictionaryItems(await this.service.fetchExecutionDepartments());
  }

  fetchAvailablePharmacies() {
    return this.service.fetchAvailablePharmacies();
  }

  // ---- 详情 ----

  async fetchMedicalItemDetail(itemId: string): Promise<MedicalItemDetail | null> {
    const detail = await this.service.fetchMedicalItemDetail(itemId);
    if (!detail) return null;

    return {
      itemId: trim(detail.idCli) ?? itemId,
      itemName: trim(detail.naCli) ?? '',
      unit: trim(detail.unit),
      executingDeptId: trim(detail.idDeptExec),
      raw: detail as unknown as Record<string, unknown>,
    };
  }

  async fetchMedicineProDetail(productId: string, storeId: string): Promise<MedicineDetail | null> {
    const detail = await this.service.fetchMedicineProDetail(productId, storeId);
    if (!detail) return null;

    return {
      productId: trim(detail.idMedPro) ?? productId,
      productName: trim(detail.naMedPro) ?? '',
      medicineId: trim(detail.idMed),
      medicineName: trim(detail.naMed),
      active: detail.fgActive !== '0',

      specSale: trim(detail.specSale),
      unitSale: trim(detail.unitSale),
      spec: trim(detail.spec),
      doseUnit: trim(detail.unitDose) ?? trim(detail.unitPre),
      dose: trim(detail.dose),

      defaultSingleDose: trim(detail.dftDoseOnce),
      defaultFrequency: trim(detail.dftFreq),
      defaultRoute: trim(detail.dftUsage),

      storeId: trim(detail.idSto) ?? storeId,
      needsSkinTest: detail.fgSkintest === '1',

      raw: detail as unknown as Record<string, unknown>,
    };
  }

  // ---- 库存校验 ----

  checkMedicineInventoryEnough(items: InventoryCheckRequest[]): Promise<InventoryCheckResult> {
    if (items.length === 0) {
      return Promise.resolve({ code: 200, message: '' });
    }

    const phisItems = items.map((item) => ({
      idSto: item.storeId,
      idMedPro: item.productId,
      naMed: item.medicineName,
      amount: item.quantity,
      priceSale: item.unitPrice,
      sdFrzBiz: PHIS_BUSINESS_TYPE_MAP[item.businessType],
    }));

    return this.service
      .checkMedicineInventoryEnough(phisItems)
      .then((result) => ({ code: result.code, message: result.msg }));
  }
}
