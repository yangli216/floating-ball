/**
 * useTreatmentHydration: 把语音问诊的"药品详情轮询 + 非药品详情补全 + 库存校验"核心逻辑抽出，供症状问诊复用。
 *
 * 职责：
 * - 调用 HIS 在候选药房中依次拉取 `fetchMedicineProDetail`，遇到第一个有效详情即应用到 `rec`
 *   （回填 dose/freq/route/spec/totalUnit/pharmacy，并在 `rec.matchedItem.raw` 上打 `__medicineDetailLoaded:true`）。
 * - `ensureMedicineSelectable(rec, notify)`：若详情未加载或当前药房不匹配，自动 hydrate；失败时（可选）通知调用方。
 * - `checkMedicineInventoryEnough(rec, notify)`：构造请求 -> 调 `checkMedicineInventoryEnough` -> 维护 warning/checking 状态。
 *
 * 与语音侧差异：
 * - 不持有 UI 状态（如 quick selector、editor expansion）；调用方在 toggle 处自行处理拒绝路径。
 * - 非药品 hydrate 从 HIS 项目详情真实回填 execDept / unit / defaultQuantity；检查项目 part options 可由调用方注入落地函数。
 * - 医生已手动清空 pharmacy / execDept，或手动编辑数量时，不再用详情返回值自动补回。
 */

import { ref, type Ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type {
  HisAdapter,
  InventoryCheckRequest,
  MedicalItemPartOption,
  MedicineDetail,
  PharmacyOption,
} from '@/services/his';
import { getHisAdapter } from '@/services/his';
import {
  computeDoseCount,
  convertClinicalDoseToUnit,
  formatDoseCount,
  formatMedicineSpec,
} from '@/utils/treatmentInference';
import { parsePositiveNumber } from '@/utils/medicalDictionaryHelpers';
import {
  getMatchedMedicalItemClientId,
  readFirstString,
  getMatchedItemRaw,
  resolveAvailableMedicineInventoryUnitPrice,
  resolveMedicineDispensingQuantity,
} from '@features/clinical-result';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';

interface Deps {
  pharmacyOptions: Ref<PharmacyOption[]>;
  /** 药品详情落地后重新计算频次、用法和包装总量。 */
  normalizeTreatment?: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  /** 由 useTreatmentGates 提供：根据 rec.matchedItem.storeIds ∩ pharmacyOptions 收窄后的候选药房。 */
  getCandidatePharmaciesForMedicine: (rec: TreatmentRecommendation) => PharmacyOption[];
  /** 由 useTreatmentNormalization 提供：HIS 默认频次 / 用法尝试匹配业务字典。 */
  findFrequencyOptionByValue: (value?: string) => UsageOption | undefined;
  findRouteOptionByValue: (value?: string) => UsageOption | undefined;
  /** 用于库存状态映射的 key：默认按 type+matchedItemId+name 拼接。 */
  getInventoryKey?: (rec: TreatmentRecommendation) => string;
  applyMedicalItemPartOptions?: (rec: TreatmentRecommendation, options: MedicalItemPartOption[]) => void;
  afterMedicalItemHydrated?: () => void;
  /** 测试或厂商扩展注入；默认只从当前药房有效库存目录解析单价。 */
  resolveMedicineInventoryUnitPrice?: (
    adapter: HisAdapter,
    storeId: string,
    productId: string,
  ) => Promise<number | null>;
  logContext?: string;
  /** 注入的 toast；symptom 侧只支持 'info'|'success'|'error'，所以默认级别为 'info'。 */
  notify?: (message: string, level?: 'info' | 'success' | 'error') => void;
}

interface MedicineDetailLookupResult {
  detail: MedicineDetail;
  pharmacy: PharmacyOption;
}

export interface MedicineFinalizationResult {
  item: TreatmentRecommendation;
  ready: boolean;
  inventoryChecked: boolean;
  issues: string[];
}

export interface FinalizeMedicineOptions {
  checkInventory?: boolean;
}

const FORMULATION_DOSE_UNITS = new Set(['片', '粒', '袋', '包', '支', '丸', '贴', '喷', '滴']);

function isFormulationDoseUnit(value: string): boolean {
  return FORMULATION_DOSE_UNITS.has(value.trim());
}

function getMedicineDetailId(rec: TreatmentRecommendation): string {
  return (
    rec.matchedItem?.id
    || rec.matchedItem?.idSrv
    || readFirstString(getMatchedItemRaw(rec), ['idMedPro', 'idMed'])
    || ''
  ).trim();
}

function isValidMedicineProDetail(detail: MedicineDetail | null): detail is MedicineDetail {
  if (!detail || !detail.active) return false;
  return [
    detail.productId,
    detail.medicineId,
    detail.productName,
    detail.medicineName,
    detail.specSale,
    detail.unitSale,
    detail.dose,
    detail.defaultSingleDose,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function formatDetailQuantity(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

export function useTreatmentHydration(deps: Deps) {
  const {
    pharmacyOptions,
    normalizeTreatment = (rec) => rec as TreatmentRecommendation,
    getCandidatePharmaciesForMedicine,
    findFrequencyOptionByValue,
    findRouteOptionByValue,
    getInventoryKey: getKeyOverride,
    applyMedicalItemPartOptions,
    afterMedicalItemHydrated,
    resolveMedicineInventoryUnitPrice: resolveMedicineInventoryUnitPriceOverride,
    logContext = 'useTreatmentHydration',
    notify,
  } = deps;

  const resolveMedicineInventoryUnitPrice = resolveMedicineInventoryUnitPriceOverride
    ?? ((adapter: HisAdapter, storeId: string, productId: string) => (
      resolveAvailableMedicineInventoryUnitPrice({ adapter, storeId, productId })
    ));

  const inventoryWarnings = ref<Record<string, string>>({});
  const inventoryChecking = ref<Set<string>>(new Set());

  const getInventoryKey = (rec: TreatmentRecommendation): string => {
    if (getKeyOverride) return getKeyOverride(rec);
    return `inv:${rec.type}:${rec.matchedItem?.id || rec.name}`;
  };

  function getMedicineInventoryWarning(rec: TreatmentRecommendation): string {
    return inventoryWarnings.value[getInventoryKey(rec)] || '';
  }

  function clearMedicineInventoryWarning(rec: TreatmentRecommendation): void {
    const key = getInventoryKey(rec);
    if (!inventoryWarnings.value[key]) return;
    const next = { ...inventoryWarnings.value };
    delete next[key];
    inventoryWarnings.value = next;
  }

  function setMedicineInventoryWarning(rec: TreatmentRecommendation, message: string): void {
    inventoryWarnings.value = {
      ...inventoryWarnings.value,
      [getInventoryKey(rec)]: message,
    };
  }

  function isMedicineInventoryChecking(rec: TreatmentRecommendation): boolean {
    return inventoryChecking.value.has(getInventoryKey(rec));
  }

  function setMedicineInventoryChecking(rec: TreatmentRecommendation, checking: boolean): void {
    const key = getInventoryKey(rec);
    const next = new Set(inventoryChecking.value);
    if (checking) next.add(key);
    else next.delete(key);
    inventoryChecking.value = next;
  }

  function formatInventoryWarningMessage(rec: TreatmentRecommendation, message?: string): string {
    const trimmed = (message || '').trim();
    if (!trimmed) {
      return `${rec.name} 库存不足，请调整用药数量或药房`;
    }
    if (trimmed.includes(rec.name)) {
      return trimmed;
    }
    return `${rec.name}：${trimmed}`;
  }

  function isMedicineDetailLoadedForSelectedPharmacy(rec: TreatmentRecommendation): boolean {
    const raw = getMatchedItemRaw(rec);
    if (raw?.__medicineDetailLoaded !== true) return false;
    const pharmacyName = (rec.pharmacy || '').trim();
    const detailStoreId = readFirstString(raw, ['idSto']);
    if (!pharmacyName || !detailStoreId) return false;
    return pharmacyOptions.value.some(
      (option) => option.name === pharmacyName && option.idSto === detailStoreId,
    );
  }

  async function fetchFirstValidMedicineDetail(
    rec: TreatmentRecommendation,
    his: HisAdapter,
  ): Promise<MedicineDetailLookupResult | null> {
    const id = getMedicineDetailId(rec);
    if (!id) return null;

    const pharmacies = getCandidatePharmaciesForMedicine(rec);
    if (pharmacies.length === 0) {
      console.warn('[useTreatmentHydration] No pharmacy idSto available for matched medicine', {
        name: rec.name,
      });
      return null;
    }

    for (const pharmacy of pharmacies) {
      const idSto = (pharmacy.idSto || '').trim();
      const detail = await his.fetchMedicineProDetail(id, idSto);
      if (isValidMedicineProDetail(detail)) {
        return { detail, pharmacy };
      }
      console.info('[useTreatmentHydration] Medicine detail not found in pharmacy, trying next', {
        name: rec.name,
        id,
        idSto,
      });
    }
    return null;
  }

  async function hydrateMatchedMedicineDetail(rec: TreatmentRecommendation): Promise<boolean> {
    if (rec.type !== 'medicine' || !rec.matchedItem) return false;
    if (rec.pharmacyCleared) return false;
    const id = getMedicineDetailId(rec);
    if (!id) return false;

    const his = getHisAdapter();
    if (!his) {
      console.warn('[useTreatmentHydration] HisAdapter not initialized', { name: rec.name });
      return false;
    }

    try {
      const lookup = await fetchFirstValidMedicineDetail(rec, his);
      if (!lookup) {
        if (getCandidatePharmaciesForMedicine(rec).length > 0) {
          rec.selected = false;
        }
        return false;
      }

      const { detail, pharmacy } = lookup;
      const idSto = (pharmacy.idSto || '').trim();

      const mergedRaw = {
        ...(getMatchedItemRaw(rec) || {}),
        ...detail.raw,
        idSto: detail.storeId || idSto,
        __medicineDetailLoaded: true,
      };

      rec.matchedItem = {
        ...rec.matchedItem,
        name: detail.productName?.trim() || rec.matchedItem.name || rec.name,
        fgSkintest: detail.needsSkinTest ? '1' : (rec.matchedItem.fgSkintest || '0'),
        raw: mergedRaw,
      };

      // 剂量换算优先级：targetDose -> PHIS unitDose -> 制剂单位换算 -> HIS 默认值 -> 保留原值
      const doseUnit = detail.doseUnit || '';
      if (!rec.dosageManualEdited) {
        const clinicalDose = convertClinicalDoseToUnit(
          rec.targetDose,
          rec.targetDoseUnit,
          doseUnit,
        );
        const computedCount = clinicalDose === null && isFormulationDoseUnit(doseUnit)
          ? computeDoseCount(
              rec.targetDose,
              rec.targetDoseUnit,
              detail.dose,
              detail.spec || detail.specSale,
            )
          : null;
        if (clinicalDose !== null) {
          rec.dosage = clinicalDose;
          rec.dosageUnit = doseUnit;
        } else if (computedCount !== null) {
          rec.dosage = formatDoseCount(computedCount);
          rec.dosageUnit = doseUnit || '片';
        } else if (detail.defaultSingleDose) {
          rec.dosage = rec.dosage || detail.defaultSingleDose;
        }
      }
      if (doseUnit) rec.dosageUnit = doseUnit;

      // HIS 默认频次：当前频次无法匹配业务字典时用 HIS 默认值覆盖
      if (detail.defaultFrequency) {
        const hisFreqOption = findFrequencyOptionByValue(detail.defaultFrequency);
        const currentFreqMatched = rec.frequencyKey
          ? findFrequencyOptionByValue(rec.frequencyKey)
          : findFrequencyOptionByValue(rec.frequency);
        if (hisFreqOption && !currentFreqMatched) {
          rec.frequency = hisFreqOption.text;
          rec.frequencyKey = hisFreqOption.key;
        } else if (!rec.frequency && hisFreqOption) {
          rec.frequency = hisFreqOption.text;
          rec.frequencyKey = hisFreqOption.key;
        } else if (!currentFreqMatched) {
          rec.frequency = detail.defaultFrequency;
          rec.frequencyKey = hisFreqOption?.key || '';
        }
      } else if (rec.frequency && !findFrequencyOptionByValue(rec.frequencyKey || rec.frequency)) {
        rec.frequency = '';
        rec.frequencyKey = '';
      }

      // HIS 默认用法
      if (detail.defaultRoute) {
        const hisRouteOption = findRouteOptionByValue(detail.defaultRoute);
        const currentRouteMatched = rec.routeKey
          ? findRouteOptionByValue(rec.routeKey)
          : findRouteOptionByValue(rec.route);
        if (hisRouteOption && !currentRouteMatched) {
          rec.route = hisRouteOption.text;
          rec.routeKey = hisRouteOption.key;
        } else if (!rec.route && hisRouteOption) {
          rec.route = hisRouteOption.text;
          rec.routeKey = hisRouteOption.key;
        } else if (!currentRouteMatched) {
          rec.route = detail.defaultRoute;
          rec.routeKey = hisRouteOption?.key || '';
        }
      } else if (rec.route && !findRouteOptionByValue(rec.routeKey || rec.route)) {
        rec.route = '';
        rec.routeKey = '';
      }

      if (detail.specSale || detail.unitSale) {
        rec.spec = formatMedicineSpec(detail.specSale, detail.unitSale);
      }
      if (detail.unitSale) rec.totalUnit = detail.unitSale;

      rec.pharmacy = pharmacy.name;

      return true;
    } catch (error) {
      console.error('[useTreatmentHydration] Failed to hydrate medicine detail', {
        id,
        name: rec.name,
        error,
      });
      rec.selected = false;
      return false;
    }
  }

  async function hydrateMedicalItemPartOptions(rec: TreatmentRecommendation, itemId: string, his: HisAdapter): Promise<void> {
    if (rec.type !== 'exam' || !applyMedicalItemPartOptions) {
      return;
    }

    const partOptions = await his.fetchMedicalItemPartOptions(itemId);
    applyMedicalItemPartOptions(rec, partOptions);
  }

  async function hydrateMatchedMedicalItemDetail(rec: TreatmentRecommendation): Promise<boolean> {
    if (!rec.matchedItem) return false;
    if (rec.type === 'medicine') {
      return hydrateMatchedMedicineDetail(rec);
    }

    const his = getHisAdapter();
    if (!his) return false;

    const idCli = getMatchedMedicalItemClientId(rec);
    if (!idCli) return false;

    try {
      const detail = await his.fetchMedicalItemDetail(idCli);
      if (!detail) {
        await hydrateMedicalItemPartOptions(rec, idCli, his);
        return false;
      }

      const mergedRaw = {
        ...(getMatchedItemRaw(rec) || {}),
        ...detail.raw,
        __detailLoaded: true,
      };

      rec.matchedItem = {
        ...rec.matchedItem,
        name: detail.itemName?.trim() || rec.matchedItem.name || rec.name,
        code: detail.itemId?.trim() || rec.matchedItem.code || idCli,
        idDeptExec: detail.executingDeptId || rec.matchedItem.idDeptExec || '',
        raw: mergedRaw,
      };

      if (!rec.execDept && !rec.execDeptCleared && detail.executingDeptId) {
        rec.execDept = detail.executingDeptId;
      }

      if (!rec.totalUnit && detail.unit) {
        rec.totalUnit = detail.unit;
      }

      const detailQuantity = formatDetailQuantity(detail.defaultQuantity);
      if (!rec.totalQty && !rec.totalManualEdited && detailQuantity) {
        rec.totalQty = detailQuantity;
      }

      await hydrateMedicalItemPartOptions(rec, detail.itemId || idCli, his);
      afterMedicalItemHydrated?.();
      return true;
    } catch (error) {
      console.error(`[${logContext}] Failed to hydrate medical item detail`, {
        idCli,
        name: rec.name,
        error,
      });
      return false;
    }
  }

  async function hydrateMatchedMedicalItemDetails(items: TreatmentRecommendation[]): Promise<void> {
    const candidates = items.filter((item) => !!item.matchedItem);
    await Promise.all(candidates.map((item) => hydrateMatchedMedicalItemDetail(item)));
  }

  async function ensureMedicineSelectable(
    rec: TreatmentRecommendation,
    showNotify = false,
  ): Promise<boolean> {
    if (rec.type !== 'medicine') return true;
    if (rec.pharmacyCleared) {
      if (showNotify) {
        notify?.(`${rec.name} 未设置发药药房，请先设置后再选中`, 'info');
      }
      return false;
    }
    if (isMedicineDetailLoadedForSelectedPharmacy(rec)) return true;
    const ok = await hydrateMatchedMedicineDetail(rec);
    if (!ok && showNotify) {
      notify?.(`${rec.name} 在当前可用发药药房中均不存在药品详情，不能选中`, 'info');
    }
    return ok;
  }

  function buildMedicineInventoryCheckItem(
    rec: TreatmentRecommendation,
  ): Omit<InventoryCheckRequest, 'unitPrice'> | null {
    const raw = getMatchedItemRaw(rec);
    const selectedPharmacy = pharmacyOptions.value.find((p) => p.name === (rec.pharmacy || '').trim());
    const storeId = selectedPharmacy?.idSto || readFirstString(raw, ['idSto']);
    const productId = readFirstString(raw, ['idMedPro']) || rec.matchedItem?.id || rec.matchedItem?.idSrv || '';
    const medicineName = readFirstString(raw, ['naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '';
    const quantity = parsePositiveNumber(rec.totalQty);
    if (!storeId || !productId || !medicineName || !quantity) return null;
    return {
      storeId,
      productId,
      medicineName,
      quantity,
      businessType: 'outpatient',
    };
  }

  async function checkMedicineInventoryEnough(
    rec: TreatmentRecommendation,
    showNotify = false,
  ): Promise<boolean> {
    if (rec.type !== 'medicine') return true;
    if (!(await ensureMedicineSelectable(rec, showNotify))) return false;

    const his = getHisAdapter();
    const checkItem = buildMedicineInventoryCheckItem(rec);
    if (!his || !checkItem) return true;

    setMedicineInventoryChecking(rec, true);
    try {
      const unitPrice = await resolveMedicineInventoryUnitPrice(
        his,
        checkItem.storeId,
        checkItem.productId,
      );
      if (unitPrice === null) {
        const message = `${rec.name} 未取得当前药房有效库存单价，暂不能校验库存`;
        setMedicineInventoryWarning(rec, message);
        if (showNotify) notify?.(message, 'info');
        return false;
      }
      const inventoryCheckItem: InventoryCheckRequest = { ...checkItem, unitPrice };
      const result = await his.checkMedicineInventoryEnough([inventoryCheckItem]);
      if (result.code === 200) {
        clearMedicineInventoryWarning(rec);
        return true;
      }
      const message = formatInventoryWarningMessage(rec, result.message);
      setMedicineInventoryWarning(rec, message);
      if (showNotify) notify?.(message, 'info');
      return false;
    } catch (error) {
      console.error('[useTreatmentHydration] Failed to check inventory', {
        name: rec.name,
        checkItem,
        error,
      });
      if (showNotify) notify?.(`${rec.name} 库存校验失败，请稍后重试或手动确认库存`, 'info');
      return false;
    } finally {
      setMedicineInventoryChecking(rec, false);
    }
  }

  function getMedicineFinalizationIssues(rec: TreatmentRecommendation): string[] {
    const issues: string[] = [];
    if (!rec.matchedItem) issues.push('未匹配当前库存药品');
    if (!isMedicineDetailLoadedForSelectedPharmacy(rec)) issues.push('未加载当前药房药品详情');
    if (parsePositiveNumber(rec.dosage) === null || !(rec.dosageUnit || '').trim()) {
      issues.push('一次剂量不完整');
    }
    if (!findFrequencyOptionByValue(rec.frequencyKey || rec.frequency)) {
      issues.push('频次未匹配 HIS 字典');
    }
    if (!findRouteOptionByValue(rec.routeKey || rec.route)) {
      issues.push('用法未匹配 HIS 字典');
    }
    if (parsePositiveNumber(rec.days) === null) issues.push('用药天数不完整');
    const dispensingQuantity = resolveMedicineDispensingQuantity(rec);
    if (!dispensingQuantity) {
      issues.push('包装总量不可计算');
    } else if (dispensingQuantity.calculation) {
      const quantityCalculation = dispensingQuantity.calculation;
      if (quantityCalculation.doseCountPerAdministration > 20) {
        issues.push('单次制剂数量异常');
      }
      if (!rec.totalManualEdited
        && parsePositiveNumber(rec.totalQty) !== quantityCalculation.packageCount) {
        issues.push('包装总量与程序计算结果不一致');
      }
    } else if (
      !rec.totalManualEdited
      && parsePositiveNumber(rec.totalQty) !== dispensingQuantity.packageCount
    ) {
      issues.push('包装总量与单包装兜底结果不一致');
    }
    if (parsePositiveNumber(rec.totalQty) === null || !(rec.totalUnit || '').trim()) {
      issues.push('包装总量不完整');
    }
    if (!(rec.pharmacy || '').trim()) issues.push('未确定发药药房');
    return issues;
  }

  async function finalizeMedicineRecommendation(
    rec: TreatmentRecommendation,
    options: FinalizeMedicineOptions = {},
  ): Promise<MedicineFinalizationResult> {
    if (rec.type !== 'medicine') {
      return { item: rec, ready: true, inventoryChecked: false, issues: [] };
    }

    const wasSelected = !!rec.selected;
    Object.assign(rec, normalizeTreatment(rec));
    const hydrated = await ensureMedicineSelectable(rec, false);
    if (!hydrated) {
      rec.selected = false;
      return {
        item: rec,
        ready: false,
        inventoryChecked: false,
        issues: ['当前可用药房无有效药品详情'],
      };
    }

    Object.assign(rec, normalizeTreatment(rec));
    const issues = getMedicineFinalizationIssues(rec);
    if (issues.length > 0) {
      rec.selected = false;
      return { item: rec, ready: false, inventoryChecked: false, issues };
    }

    if (options.checkInventory && wasSelected) {
      const inventoryReady = await checkMedicineInventoryEnough(rec, false);
      if (!inventoryReady) {
        rec.selected = false;
        return {
          item: rec,
          ready: false,
          inventoryChecked: true,
          issues: [getMedicineInventoryWarning(rec) || '当前药房库存不足'],
        };
      }
      return { item: rec, ready: true, inventoryChecked: true, issues: [] };
    }

    return { item: rec, ready: true, inventoryChecked: false, issues: [] };
  }

  async function finalizeMedicineRecommendations(
    items: TreatmentRecommendation[],
    options: FinalizeMedicineOptions = {},
  ): Promise<MedicineFinalizationResult[]> {
    const medicines = items.filter((item) => item.type === 'medicine');
    return Promise.all(medicines.map((item) => finalizeMedicineRecommendation(item, options)));
  }

  return {
    hydrateMatchedMedicineDetail,
    hydrateMatchedMedicalItemDetail,
    hydrateMatchedMedicalItemDetails,
    ensureMedicineSelectable,
    isMedicineDetailLoadedForSelectedPharmacy,
    checkMedicineInventoryEnough,
    finalizeMedicineRecommendation,
    finalizeMedicineRecommendations,
    getMedicineInventoryWarning,
    clearMedicineInventoryWarning,
    setMedicineInventoryWarning,
    isMedicineInventoryChecking,
    setMedicineInventoryChecking,
  };
}

export type TreatmentHydration = ReturnType<typeof useTreatmentHydration>;
