import type { TreatmentRecommendation } from '@/types/consultation';
import type { ExecDeptOption } from '@/utils/medicalDictionaryHelpers';

const QUANTITY_UNITS = ['次', '盒', '瓶', '袋', '支', '片', '粒', '包', '板', 'ml', 'mg', 'g'];
const CLINICAL_DOSE_UNITS = new Set([
  'g', 'mg', 'ug', 'μg', 'mcg', 'ml',
  '克', '毫克', '微克', '毫升',
]);

function trimText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function readFirstText(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = trimText(source[key]);
    if (value) return value;
  }
  return '';
}

function normalizeTreatmentType(
  value: unknown,
  fallbackType?: TreatmentRecommendation['type'],
): TreatmentRecommendation['type'] | undefined {
  const raw = trimText(value);
  if (raw === 'examination') return 'exam';
  if (raw === 'labTest') return 'lab_test';
  if (raw === 'medicine' || raw === 'exam' || raw === 'lab_test' || raw === 'procedure' || raw === 'acupuncture') {
    return raw;
  }
  return fallbackType;
}

function splitQuantityAndUnit(quantity: string, unit: string): { quantity: string; unit: string } {
  if (!quantity || unit) {
    return { quantity, unit };
  }

  const matchedUnit = QUANTITY_UNITS.find((candidate) => quantity.endsWith(candidate));
  if (!matchedUnit) {
    return { quantity, unit };
  }

  return {
    quantity: quantity.slice(0, -matchedUnit.length).trim(),
    unit: matchedUnit,
  };
}

function splitDoseAndUnit(value: string, unit: string): { value: string; unit: string } {
  if (!value || unit) return { value, unit };
  const matched = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mg|g|ug|μg|mcg|ml|毫克|克|微克|毫升|片|粒|袋|包|支|丸|贴|喷|滴)$/iu);
  return matched
    ? { value: matched[1], unit: matched[2] }
    : { value, unit };
}

function isClinicalDoseUnit(value: string): boolean {
  return CLINICAL_DOSE_UNITS.has(value.trim().toLowerCase());
}

export function normalizeRawTreatmentRecommendationFields<T extends object>(
  rec: T,
  fallbackType?: TreatmentRecommendation['type'],
): Partial<TreatmentRecommendation> & T {
  const raw = rec as Record<string, unknown>;
  const type = normalizeTreatmentType(raw.type, fallbackType);
  const rawQuantity = readFirstText(raw, [
    'totalQty',
    'quantity',
    'count',
    'amount',
    'qty',
    'num',
    'number',
    'times',
  ]);
  const rawTotalUnit = readFirstText(raw, ['totalUnit', 'quantityUnit', 'countUnit', 'amountUnit', 'unit']);
  const { quantity, unit: totalUnit } = splitQuantityAndUnit(rawQuantity, rawTotalUnit);
  const targetDoseParts = splitDoseAndUnit(
    readFirstText(raw, ['targetDose', 'target_dose']),
    readFirstText(raw, ['targetDoseUnit', 'target_dose_unit']),
  );
  const dosageParts = splitDoseAndUnit(
    readFirstText(raw, ['dosage', 'doseOnce']),
    readFirstText(raw, ['dosageUnit', 'unitDose']),
  );
  const migrateDosageToTarget = type === 'medicine'
    && isClinicalDoseUnit(dosageParts.unit);
  const targetDose = targetDoseParts.value || (migrateDosageToTarget ? dosageParts.value : '');
  const targetDoseUnit = targetDoseParts.unit || (migrateDosageToTarget ? dosageParts.unit : '');

  return {
    ...rec,
    type,
    ...(type === 'medicine' && targetDose ? { targetDose } : {}),
    ...(type === 'medicine' && targetDoseUnit ? { targetDoseUnit } : {}),
    ...(migrateDosageToTarget ? { dosage: '', dosageUnit: '' } : {}),
    ...(type === 'medicine' && !migrateDosageToTarget && dosageParts.value
      ? { dosage: dosageParts.value, dosageUnit: dosageParts.unit }
      : {}),
    ...(quantity && !trimText(raw.totalQty) ? { totalQty: quantity } : {}),
    ...(totalUnit && !trimText(raw.totalUnit) ? { totalUnit } : {}),
  };
}

export function normalizeExecDeptSelectionValue(value: string, options: ExecDeptOption[]): string {
  const currentValue = value.trim();
  if (!currentValue) return '';

  const matched = options.find((option) => (
    option.key === currentValue
    || option.text === currentValue
  ));
  return matched?.key || currentValue;
}

export function syncTreatmentExecDeptSelections(
  items: TreatmentRecommendation[],
  options: ExecDeptOption[],
): void {
  if (options.length === 0) return;

  items.forEach((rec) => {
    if (rec.type === 'medicine' || rec.execDeptCleared) return;

    const normalized = normalizeExecDeptSelectionValue(rec.execDept || '', options);
    if (normalized && normalized !== rec.execDept) {
      rec.execDept = normalized;
    }
  });
}
