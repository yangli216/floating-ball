/**
 * treatmentInference
 *
 * 治疗项（药品/检查/检验/处置）字段的纯推断工具：
 * 从自由文本/规格字符串/匹配项原始数据推导剂量、单位、频次、给药途径、用药天数、总量等。
 * 供语音问诊与症状问诊共用，不感知任何 Vue 状态。
 */

import type { UsageOption } from './medicalDictionaryHelpers';

/**
 * 拆分 "0.25g" → { dosage: '0.25', dosageUnit: 'g' }
 */
export function splitDosageAndUnit(value?: string): { dosage: string; dosageUnit: string } {
  const raw = (value || '').trim();
  if (!raw) {
    return { dosage: '', dosageUnit: '' };
  }

  const matchedUnit = ['mg', 'g', 'ml', 'ug', '片', '粒', '支', '袋'].find((unit) => raw.endsWith(unit));
  if (!matchedUnit) {
    return { dosage: raw, dosageUnit: '' };
  }

  return {
    dosage: raw.slice(0, -matchedUnit.length).trim(),
    dosageUnit: matchedUnit,
  };
}

/**
 * 拼接药品规格与单位，避免重复："0.25g" + "g" → "0.25g"
 */
export function formatMedicineSpec(spec?: string, unit?: string): string {
  const normalizedSpec = (spec || '').trim();
  const normalizedUnit = (unit || '').trim();

  if (!normalizedSpec) {
    return normalizedUnit;
  }

  if (!normalizedUnit) {
    return normalizedSpec;
  }

  if (normalizedSpec.includes(normalizedUnit)) {
    return normalizedSpec;
  }

  return `${normalizedSpec} ${normalizedUnit}`;
}

/**
 * 从规格字符串中提取有效含量并归一化为 mg。
 * 示例: "0.25g" → 250, "10mg" → 10, "0.25" (默认 g) → 250
 */
export function extractStrengthMg(value: string | undefined | null, unitHint?: string): number | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const withUnit = text.match(/^(\d+(?:\.\d+)?)\s*(g|mg|ug|μg|毫克|克|微克|ml|毫升)?$/i);
  if (!withUnit) return null;

  const num = parseFloat(withUnit[1]);
  if (isNaN(num) || num <= 0) return null;

  let unit = (withUnit[2] || unitHint || '').toLowerCase().trim();

  if (!unit) {
    if (num < 1) unit = 'g';
    else if (num <= 100) unit = 'mg';
    else return null;
  }

  switch (unit) {
    case 'g':
    case '克':
      return num * 1000;
    case 'mg':
    case '毫克':
      return num;
    case 'ug':
    case 'μg':
    case '微克':
      return num / 1000;
    case 'ml':
    case '毫升':
      return null;
    default:
      return null;
  }
}

/**
 * 根据目标治疗剂量和每单位含量计算一次几个制剂单位。
 */
export function computeDoseCount(
  targetDose: string | undefined,
  targetUnit: string | undefined,
  unitDose: string | undefined,
  unitSpec: string | undefined,
): number | null {
  if (!targetDose) return null;

  const targetMg = extractStrengthMg(targetDose, targetUnit);
  if (targetMg === null) return null;

  let unitMg = extractStrengthMg(unitDose, unitSpec ? undefined : undefined);
  if (unitMg === null && unitSpec) {
    const specMatch = unitSpec.match(/(\d+(?:\.\d+)?)\s*(g|mg|ug|μg)/i);
    if (specMatch) {
      unitMg = extractStrengthMg(specMatch[1], specMatch[2]);
    }
  }
  if (unitMg === null || unitMg <= 0) return null;

  const count = targetMg / unitMg;

  if (count < 0.25 || count > 20) return null;

  const rounded = Math.round(count * 4) / 4;
  if (Math.abs(rounded - count) > 0.05) return null;

  return rounded;
}

/**
 * 格式化制剂单位数：1 → "1"，0.5 → "0.5"
 */
export function formatDoseCount(count: number): string {
  return count === Math.floor(count) ? String(count) : count.toFixed(2).replace(/0+$/, '');
}

export function inferDosageFromText(text: string): { dosage: string; dosageUnit: string } {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return { dosage: '', dosageUnit: '' };
  }

  const matched = normalizedText.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|ug|片|粒|支|袋)/i);
  if (!matched) {
    return { dosage: '', dosageUnit: '' };
  }

  return {
    dosage: matched[1]?.trim() || '',
    dosageUnit: matched[2]?.trim() || '',
  };
}

export function inferTotalFromText(text: string): { totalQty: string; totalUnit: string } {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return { totalQty: '', totalUnit: '' };
  }

  const explicitMatch = normalizedText.match(/(?:总量|共|开(?:具|立)?|发药|给)\s*(\d+(?:\.\d+)?)\s*(盒|瓶|袋|支|片|粒|包|板|次)/i);
  if (explicitMatch) {
    return {
      totalQty: explicitMatch[1]?.trim() || '',
      totalUnit: explicitMatch[2]?.trim() || '',
    };
  }

  const matches = Array.from(normalizedText.matchAll(/(\d+(?:\.\d+)?)\s*(盒|瓶|袋|支|片|粒|包|板|次)/gi));
  if (matches.length > 1) {
    const fallback = matches[matches.length - 1];
    return {
      totalQty: fallback?.[1]?.trim() || '',
      totalUnit: fallback?.[2]?.trim() || '',
    };
  }

  return { totalQty: '', totalUnit: '' };
}

export function inferDaysFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';

  const matched = normalizedText.match(/(\d+(?:\s*[-~到至]\s*\d+)?)\s*天/i);
  return matched?.[1]?.replace(/\s+/g, '') || '';
}

/**
 * 频次推断：先在字典选项中查精确匹配，否则按常见正则兜底。
 */
export function inferFrequencyFromText(text: string, frequencyOptions: UsageOption[]): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';

  const exactOption = frequencyOptions.find((option) => normalizedText.includes(option.text));
  if (exactOption) return exactOption.text;

  const matched = normalizedText.match(/(每日[^，,；;。\s]*次?|每天[^，,；;。\s]*次?|每周[^，,；;。\s]*次?|隔日一次|必要时|立即|间隔\d+小时[^，,；;。\s]*|qd|bid|tid|qid|qn|prn|q\d+h)/i);
  return matched?.[0]?.trim() || '';
}

/**
 * 给药途径推断：仅在字典选项中查包含匹配。
 */
export function inferRouteFromText(text: string, routeOptions: UsageOption[]): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';
  return routeOptions.find((option) => normalizedText.includes(option.text))?.text || '';
}

/**
 * 一次给药对应几个制剂单位，优先按 mg 含量比换算，否则按数值比兜底。
 */
export function resolveDoseCountPerAdministration(
  dosage: string,
  dosageUnit: string,
  dose: string,
  doseUnitHint: string,
): number | null {
  const dosageStrength = extractStrengthMg(dosage, dosageUnit);
  const singleUnitStrength = extractStrengthMg(dose, doseUnitHint);
  if (dosageStrength !== null && singleUnitStrength !== null && singleUnitStrength > 0) {
    return dosageStrength / singleUnitStrength;
  }

  const dosageCount = parsePositiveNumberLocal(dosage);
  const doseCount = parsePositiveNumberLocal(dose);
  if (dosageCount !== null && doseCount !== null && doseCount > 0) {
    return dosageCount / doseCount;
  }

  return null;
}

function parsePositiveNumberLocal(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}
