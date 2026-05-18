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
 * - 非药品 hydrate 只回填 execDept / unit；检查项目 part options 可由调用方注入落地函数。
 */

import { ref, type Ref } from 'vue';
import type { TreatmentRecommendation } from '../types/consultation';
import type {
  HisAdapter,
  InventoryCheckRequest,
  MedicalItemPartOption,
  MedicineDetail,
  PharmacyOption,
} from '../services/his';
import { getHisAdapter } from '../services/his';
import {
  computeDoseCount,
  formatDoseCount,
  formatMedicineSpec,
} from '../utils/treatmentInference';
import { parsePositiveNumber } from '../utils/medicalDictionaryHelpers';
import {
  getMatchedMedicalItemClientId,
  readFirstString,
  getMatchedItemRaw,
} from '../utils/recordConfirmedPayload';
import type { UsageOption } from '../utils/medicalDictionaryHelpers';

interface Deps {
  pharmacyOptions: Ref<PharmacyOption[]>;
  /** 由 useTreatmentGates 提供：根据 rec.matchedItem.storeIds ∩ pharmacyOptions 收窄后的候选药房。 */
  getCandidatePharmaciesForMedicine: (rec: TreatmentRecommendation) => PharmacyOption[];
  /** 由 useTreatmentNormalization 提供：HIS 默认频次 / 用法尝试匹配业务字典。 */
  findFrequencyOptionByValue: (value?: string) => UsageOption | undefined;
  findRouteOptionByValue: (value?: string) => UsageOption | undefined;
  /** 用于库存状态映射的 key：默认按 type+matchedItemId+name 拼接。 */
  getInventoryKey?: (rec: TreatmentRecommendation) => string;
  applyMedicalItemPartOptions?: (rec: TreatmentRecommendation, options: MedicalItemPartOption[]) => void;
  afterMedicalItemHydrated?: () => void;
  logContext?: string;
  /** 注入的 toast；symptom 侧只支持 'info'|'success'|'error'，所以默认级别为 'info'。 */
  notify?: (message: string, level?: 'info' | 'success' | 'error') => void;
}

interface MedicineDetailLookupResult {
  detail: MedicineDetail;
  pharmacy: PharmacyOption;
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

export function useTreatmentHydration(deps: Deps) {
  const {
    pharmacyOptions,
    getCandidatePharmaciesForMedicine,
    findFrequencyOptionByValue,
    findRouteOptionByValue,
    getInventoryKey: getKeyOverride,
    applyMedicalItemPartOptions,
    afterMedicalItemHydrated,
    logContext = 'useTreatmentHydration',
    notify,
  } = deps;

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

      // 剂量换算优先级：targetDose × HIS dose -> HIS defaultSingleDose -> 保留原值
      const doseUnit = detail.doseUnit || '';
      const computedCount = computeDoseCount(
        rec.targetDose,
        rec.targetDoseUnit,
        detail.dose,
        detail.spec || detail.specSale,
      );
      if (computedCount !== null) {
        rec.dosage = formatDoseCount(computedCount);
        rec.dosageUnit = doseUnit || '片';
      } else if (detail.defaultSingleDose) {
        rec.dosage = rec.dosage || detail.defaultSingleDose;
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

      if (!rec.execDept && detail.executingDeptId) {
        rec.execDept = detail.executingDeptId;
      }

      if (!rec.totalUnit && detail.unit) {
        rec.totalUnit = detail.unit;
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
    if (isMedicineDetailLoadedForSelectedPharmacy(rec)) return true;
    const ok = await hydrateMatchedMedicineDetail(rec);
    if (!ok && showNotify) {
      notify?.(`${rec.name} 在当前可用发药药房中均不存在药品详情，不能选中`, 'info');
    }
    return ok;
  }

  function buildMedicineInventoryCheckItem(
    rec: TreatmentRecommendation,
  ): InventoryCheckRequest | null {
    const raw = getMatchedItemRaw(rec);
    const selectedPharmacy = pharmacyOptions.value.find((p) => p.name === (rec.pharmacy || '').trim());
    const storeId = selectedPharmacy?.idSto || readFirstString(raw, ['idSto']);
    const productId = readFirstString(raw, ['idMedPro']) || rec.matchedItem?.id || rec.matchedItem?.idSrv || '';
    const medicineName = readFirstString(raw, ['naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '';
    const quantity = parsePositiveNumber(rec.totalQty);
    const unitPrice = parsePositiveNumber(readFirstString(raw, ['priceSale'])) ?? 0;
    if (!storeId || !productId || !medicineName || !quantity) return null;
    return {
      storeId,
      productId,
      medicineName,
      quantity,
      unitPrice,
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
      const result = await his.checkMedicineInventoryEnough([checkItem]);
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

  return {
    hydrateMatchedMedicineDetail,
    hydrateMatchedMedicalItemDetail,
    hydrateMatchedMedicalItemDetails,
    ensureMedicineSelectable,
    isMedicineDetailLoadedForSelectedPharmacy,
    checkMedicineInventoryEnough,
    getMedicineInventoryWarning,
    clearMedicineInventoryWarning,
    setMedicineInventoryWarning,
    isMedicineInventoryChecking,
    setMedicineInventoryChecking,
  };
}

export type TreatmentHydration = ReturnType<typeof useTreatmentHydration>;
