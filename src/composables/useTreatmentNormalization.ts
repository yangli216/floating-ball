/**
 * useTreatmentNormalization
 *
 * 把（语音识别 / AI 推荐 / 表单填写）得到的部分治疗项字段，归一化为 `TreatmentRecommendation`：
 * - 沿用 HIS 默认值（频次、用法、剂量、单位等）
 * - 调用纯推断工具补齐缺失字段
 * - 自动算总量（仅药品）
 * - 通过可选回调让调用方注入业务侧副作用（如药品自动选默认药房、执行科室未选时自动取消勾选）
 *
 * 设计目标：语音问诊与症状问诊共用同一份归一化口径，避免双轨漂移。
 */

import type { Ref } from 'vue';
import type { TreatmentRecommendation } from '../types/consultation';
import {
  getMatchedItemRaw,
  readFirstString,
} from '../utils/recordConfirmedPayload';
import {
  parsePositiveNumber,
  inferExecCountFromFrequencyText,
  type UsageOption,
} from '../utils/medicalDictionaryHelpers';
import {
  splitDosageAndUnit,
  inferDosageFromText,
  inferTotalFromText,
  inferDaysFromText,
  inferFrequencyFromText,
  inferRouteFromText,
  resolveDoseCountPerAdministration,
} from '../utils/treatmentInference';

export interface TreatmentNormalizationDeps {
  frequencyOptions: Ref<UsageOption[]>;
  routeOptions: Ref<UsageOption[]>;
  /**
   * 可选：药品在归一化结束后，由业务方决定是否自动填充默认发药药房。
   * 语音问诊会传入读取 `pharmacyOptions` + 药品库存元数据的实现，症状问诊默认不自动填充。
   */
  ensurePharmacy?: (rec: TreatmentRecommendation) => void;
  /**
   * 可选：检查/检验类项目，未选执行科室时是否要把 `selected` 置为 false。
   * 默认返回 true（视作已满足），即不强制清空选中态。
   */
  isExecDeptSatisfied?: (rec: TreatmentRecommendation) => boolean;
}

export interface TreatmentNormalization {
  normalize: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  findFrequencyOptionByValue: (value?: string) => UsageOption | undefined;
  findRouteOptionByValue: (value?: string) => UsageOption | undefined;
  getFrequencyExecCount: (rec: Partial<TreatmentRecommendation>) => number | null;
}

export function useTreatmentNormalization(deps: TreatmentNormalizationDeps): TreatmentNormalization {
  const { frequencyOptions, routeOptions } = deps;
  const ensurePharmacy = deps.ensurePharmacy ?? (() => {});
  const isExecDeptSatisfied = deps.isExecDeptSatisfied ?? (() => true);

  function findFrequencyOptionByValue(value?: string): UsageOption | undefined {
    const normalizedValue = (value || '').trim();
    if (!normalizedValue) return undefined;
    return frequencyOptions.value.find(
      (option) => option.text === normalizedValue || option.key === normalizedValue,
    );
  }

  function findRouteOptionByValue(value?: string): UsageOption | undefined {
    const normalizedValue = (value || '').trim();
    if (!normalizedValue) return undefined;
    return routeOptions.value.find(
      (option) => option.text === normalizedValue || option.key === normalizedValue,
    );
  }

  function inferMedicineDefaults(rec: Partial<TreatmentRecommendation>): {
    dosage: string;
    dosageUnit: string;
    frequency: string;
    route: string;
    totalQty: string;
    totalUnit: string;
    days: string;
  } {
    const dosagePair = splitDosageAndUnit(rec.dosage);
    const usageText = [rec.usage, rec.route].filter(Boolean).join('，');
    const daysText = [rec.days, rec.usage, rec.route, rec.reason].filter(Boolean).join('，');
    const inferredDosage = dosagePair.dosage || dosagePair.dosageUnit ? dosagePair : inferDosageFromText(usageText);
    const inferredTotal = rec.totalQty || rec.totalUnit
      ? { totalQty: rec.totalQty || '', totalUnit: rec.totalUnit || '' }
      : inferTotalFromText(usageText);

    return {
      dosage: rec.dosage || inferredDosage.dosage,
      dosageUnit: rec.dosageUnit || inferredDosage.dosageUnit,
      frequency: rec.frequency || inferFrequencyFromText(
        [rec.frequency, usageText].filter(Boolean).join(' '),
        frequencyOptions.value,
      ),
      route: rec.route || inferRouteFromText(
        [rec.route, rec.usage].filter(Boolean).join(' '),
        routeOptions.value,
      ),
      totalQty: rec.totalQty || inferredTotal.totalQty,
      totalUnit: rec.totalUnit || inferredTotal.totalUnit,
      days: rec.days || inferDaysFromText(daysText),
    };
  }

  function resolveMatchedMedicineDosageValue(
    currentDosage: string,
    fallbackDosage: string,
    raw: Record<string, unknown> | undefined,
  ): string {
    const hisDoseOnce = readFirstString(raw, ['dftDoseOnce']);
    return currentDosage || hisDoseOnce || fallbackDosage;
  }

  function resolveMatchedMedicineDosageUnit(
    _currentDosageUnit: string,
    _fallbackDosageUnit: string,
    raw: Record<string, unknown> | undefined,
  ): string {
    return readFirstString(raw, ['unitDose', 'unitPre']) || '';
  }

  function resolveMatchedMedicineFrequency(
    rec: Partial<TreatmentRecommendation>,
    fallbackFrequency: string,
  ): { frequency: string; frequencyKey: string } {
    const currentFrequencyValue = (rec.frequencyKey || rec.frequency || '').trim();
    const currentMatchedOption = currentFrequencyValue ? findFrequencyOptionByValue(currentFrequencyValue) : undefined;
    if (currentMatchedOption) {
      return { frequency: currentMatchedOption.text, frequencyKey: currentMatchedOption.key };
    }

    const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
      ? rec.matchedItem.raw as Record<string, unknown>
      : undefined;
    const hisDefault = readFirstString(raw, ['dftFreq']).trim();
    if (hisDefault) {
      const hisMatchedOption = findFrequencyOptionByValue(hisDefault);
      if (hisMatchedOption) {
        return { frequency: hisMatchedOption.text, frequencyKey: hisMatchedOption.key };
      }
      return { frequency: hisDefault, frequencyKey: '' };
    }

    const fallbackMatchedOption = fallbackFrequency ? findFrequencyOptionByValue(fallbackFrequency) : undefined;
    if (fallbackMatchedOption) {
      return { frequency: fallbackMatchedOption.text, frequencyKey: fallbackMatchedOption.key };
    }

    return { frequency: '', frequencyKey: '' };
  }

  function resolveMatchedMedicineRoute(
    rec: Partial<TreatmentRecommendation>,
    fallbackRoute: string,
  ): { route: string; routeKey: string } {
    const currentRouteValue = (rec.routeKey || rec.route || '').trim();
    const currentMatchedOption = currentRouteValue ? findRouteOptionByValue(currentRouteValue) : undefined;
    if (currentMatchedOption) {
      return { route: currentMatchedOption.text, routeKey: currentMatchedOption.key };
    }

    const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
      ? rec.matchedItem.raw as Record<string, unknown>
      : undefined;
    const hisDefault = readFirstString(raw, ['dftUsage']).trim();
    if (hisDefault) {
      const hisMatchedOption = findRouteOptionByValue(hisDefault);
      if (hisMatchedOption) {
        return { route: hisMatchedOption.text, routeKey: hisMatchedOption.key };
      }
      return { route: hisDefault, routeKey: '' };
    }

    const fallbackMatchedOption = fallbackRoute ? findRouteOptionByValue(fallbackRoute) : undefined;
    if (fallbackMatchedOption) {
      return { route: fallbackMatchedOption.text, routeKey: fallbackMatchedOption.key };
    }

    return { route: '', routeKey: '' };
  }

  function getFrequencyExecCount(rec: Partial<TreatmentRecommendation>): number | null {
    const frequencyValue = (rec.frequencyKey || rec.frequency || '').trim();
    if (!frequencyValue) return null;

    const matchedOption = frequencyOptions.value.find(
      (option) => option.key === frequencyValue || option.text === frequencyValue,
    );
    return matchedOption?.execCount ?? inferExecCountFromFrequencyText(matchedOption?.text || frequencyValue);
  }

  function resolveMedicineAutoTotal(rec: Partial<TreatmentRecommendation>): { totalQty: string; totalUnit: string } {
    if ((rec.type || 'medicine') !== 'medicine') {
      return { totalQty: rec.totalQty || '', totalUnit: rec.totalUnit || '' };
    }

    const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
      ? rec.matchedItem.raw as Record<string, unknown>
      : undefined;
    const totalUnit = (rec.totalUnit || readFirstString(raw, ['unitSale'])).trim();
    const dosage = (rec.dosage || '').trim();
    const dosageUnit = (rec.dosageUnit || '').trim();
    const hisDose = readFirstString(raw, ['dose']);
    const hisDoseUnit = readFirstString(raw, ['unitDose', 'unitPre']) || dosageUnit || readFirstString(raw, ['spec', 'specSale']);
    const days = parsePositiveNumber(rec.days);
    const unitSaleFactor = parsePositiveNumber(readFirstString(raw, ['unitSaleFactor']));
    const execCount = getFrequencyExecCount(rec);

    if (!totalUnit || !dosage || !hisDose || !days || !unitSaleFactor || !execCount) {
      return { totalQty: rec.totalQty || '', totalUnit };
    }

    const doseCount = resolveDoseCountPerAdministration(dosage, dosageUnit, hisDose, hisDoseUnit);
    if (doseCount === null || doseCount <= 0) {
      return { totalQty: rec.totalQty || '', totalUnit };
    }

    const totalQty = Math.ceil((doseCount * execCount * days) / unitSaleFactor);
    if (!Number.isFinite(totalQty) || totalQty <= 0) {
      return { totalQty: rec.totalQty || '', totalUnit };
    }

    return { totalQty: String(totalQty), totalUnit };
  }

  function normalize(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
    const matchedRaw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
      ? rec.matchedItem.raw as Record<string, unknown>
      : undefined;
    const base: TreatmentRecommendation = {
      type: rec.type || 'medicine',
      name: rec.name || '',
      originalName: rec.originalName || '',
      reason: rec.reason || '',
      spec: rec.spec || '',
      targetDose: rec.targetDose || '',
      targetDoseUnit: rec.targetDoseUnit || '',
      usage: rec.usage || '',
      matchedItem: rec.matchedItem,
      suggestedMatchItem: rec.suggestedMatchItem,
      matchStatus: rec.matchStatus || (rec.matchedItem ? 'exact' : 'unmatched'),
      manualMatched: !!rec.manualMatched,
      selected: !!rec.selected,
      dosage: rec.dosage || '',
      dosageUnit: rec.dosageUnit || '',
      totalQty: rec.totalQty || (((rec.type || 'medicine') === 'exam' || (rec.type || 'medicine') === 'lab_test') ? '1' : ''),
      totalUnit: rec.totalUnit || '',
      totalManualEdited: !!rec.totalManualEdited,
      frequency: rec.frequency || '',
      frequencyKey: rec.frequencyKey || '',
      route: rec.route || '',
      routeKey: rec.routeKey || '',
      days: rec.days || '',
      pharmacy: rec.pharmacy || '',
      remark: rec.remark || '',
      regulatedDisease: rec.regulatedDisease || '',
      bodySite: rec.bodySite || '',
      bodySiteId: rec.bodySiteId || rec.matchedItem?.idPart || readFirstString(matchedRaw, ['idPart']),
      bodySiteOptions: rec.bodySiteOptions || [],
      execDept: rec.execDept || (rec.type && rec.type !== 'medicine'
        ? (rec.matchedItem?.idDeptExec || readFirstString(matchedRaw, ['idDeptExec', 'idDept']))
        : '') || '',
      insuranceType: rec.insuranceType || '医保使用',
    };

    if (!isExecDeptSatisfied(base)) {
      base.selected = false;
    }

    if (base.type !== 'medicine') {
      return base;
    }

    const defaults = inferMedicineDefaults(base);
    const hisRaw = getMatchedItemRaw(base);
    const frequencySelection = base.matchedItem
      ? resolveMatchedMedicineFrequency(base, defaults.frequency)
      : {
          frequency: base.frequency || defaults.frequency,
          frequencyKey: base.frequencyKey || findFrequencyOptionByValue(base.frequency || defaults.frequency)?.key || '',
        };
    const routeSelection = base.matchedItem
      ? resolveMatchedMedicineRoute(base, defaults.route)
      : {
          route: base.route || defaults.route,
          routeKey: base.routeKey || findRouteOptionByValue(base.route || defaults.route)?.key || '',
        };
    const normalizedMedicine = {
      ...base,
      dosage: base.matchedItem
        ? resolveMatchedMedicineDosageValue(base.dosage || '', defaults.dosage || '', hisRaw)
        : (base.dosage || defaults.dosage),
      dosageUnit: base.matchedItem
        ? resolveMatchedMedicineDosageUnit(base.dosageUnit || '', defaults.dosageUnit || '', hisRaw)
        : (base.dosageUnit || defaults.dosageUnit),
      frequency: frequencySelection.frequency,
      frequencyKey: frequencySelection.frequencyKey,
      route: routeSelection.route,
      routeKey: routeSelection.routeKey,
      totalQty: base.totalQty || defaults.totalQty,
      totalUnit: base.matchedItem
        ? (readFirstString(hisRaw, ['unitSale']) || base.totalUnit || defaults.totalUnit)
        : (base.totalUnit || defaults.totalUnit),
      days: base.days || defaults.days,
    };
    const autoTotal = resolveMedicineAutoTotal(normalizedMedicine);
    const preferManualTotal = !!rec.totalManualEdited;

    const normalizedResult = {
      ...normalizedMedicine,
      totalQty: preferManualTotal
        ? (normalizedMedicine.totalQty || autoTotal.totalQty)
        : (autoTotal.totalQty || normalizedMedicine.totalQty),
      totalUnit: preferManualTotal
        ? (normalizedMedicine.totalUnit || autoTotal.totalUnit)
        : (autoTotal.totalUnit || normalizedMedicine.totalUnit),
    };

    ensurePharmacy(normalizedResult);
    return normalizedResult;
  }

  return {
    normalize,
    findFrequencyOptionByValue,
    findRouteOptionByValue,
    getFrequencyExecCount,
  };
}
