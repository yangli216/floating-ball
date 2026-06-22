export type TreatmentNumericField = 'dosage' | 'totalQty' | 'days';

interface TreatmentNumericFieldRule {
  label: string;
  max: number;
  maxIntegerDigits: number;
  maxDecimalDigits: number;
  integerOnly?: boolean;
}

const NUMERIC_FIELD_RULES: Record<TreatmentNumericField, TreatmentNumericFieldRule> = {
  dosage: {
    label: '一次剂量',
    max: 9999,
    maxIntegerDigits: 4,
    maxDecimalDigits: 4,
  },
  totalQty: {
    label: '总量',
    max: 9999,
    maxIntegerDigits: 4,
    maxDecimalDigits: 2,
  },
  days: {
    label: '天数',
    max: 365,
    maxIntegerDigits: 3,
    maxDecimalDigits: 0,
    integerOnly: true,
  },
};

function trimNumericText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function formatMax(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function getTreatmentNumericFieldRule(field: TreatmentNumericField): TreatmentNumericFieldRule {
  return NUMERIC_FIELD_RULES[field];
}

export function getTreatmentNumericFieldConstraintText(field: TreatmentNumericField): string {
  const rule = getTreatmentNumericFieldRule(field);
  if (rule.integerOnly) {
    return `1-${formatMax(rule.max)} 的整数`;
  }
  return `大于 0 的数字，整数最多 ${rule.maxIntegerDigits} 位，小数最多 ${rule.maxDecimalDigits} 位`;
}

export function isTreatmentNumericInputAllowed(field: TreatmentNumericField, value: unknown): boolean {
  const text = trimNumericText(value);
  if (!text) {
    return true;
  }
  const rule = getTreatmentNumericFieldRule(field);
  const pattern = rule.integerOnly
    ? new RegExp(`^\\d{0,${rule.maxIntegerDigits}}$`)
    : new RegExp(`^\\d{0,${rule.maxIntegerDigits}}(?:\\.\\d{0,${rule.maxDecimalDigits}})?$`);
  return pattern.test(text);
}

export function getTreatmentNumericFieldIssue(
  field: TreatmentNumericField,
  value: unknown,
): string {
  const text = trimNumericText(value);
  if (!text) {
    return '';
  }

  const rule = getTreatmentNumericFieldRule(field);
  const fullPattern = rule.integerOnly
    ? /^\d+$/
    : /^\d+(?:\.\d+)?$/;
  if (!fullPattern.test(text)) {
    return `${rule.label}仅允许输入${getTreatmentNumericFieldConstraintText(field)}`;
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return `${rule.label}必须大于 0`;
  }
  if (parsed > rule.max) {
    return `${rule.label}不能超过 ${formatMax(rule.max)}`;
  }

  const [integerPart, decimalPart = ''] = text.split('.');
  if (integerPart.length > rule.maxIntegerDigits) {
    return `${rule.label}整数部分最多 ${rule.maxIntegerDigits} 位`;
  }
  if (decimalPart.length > rule.maxDecimalDigits) {
    return `${rule.label}小数部分最多 ${rule.maxDecimalDigits} 位`;
  }

  return '';
}

export function isTreatmentNumericFieldInvalid(field: TreatmentNumericField, value: unknown): boolean {
  return Boolean(getTreatmentNumericFieldIssue(field, value));
}
