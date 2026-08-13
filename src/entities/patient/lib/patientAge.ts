export type PatientAgeDisplayUnit = '岁' | '个月' | '天';

function text(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

export function normalizePatientAgeUnit(value: unknown): PatientAgeDisplayUnit | '' {
  const raw = text(value);
  if (!raw) return '';

  const normalized = raw.replace(/\s+/gu, '').toUpperCase();
  if (/^(Y|YR|YRS|YEAR|YEARS|年|岁|周岁)$/u.test(normalized)) return '岁';
  if (/^(M|MO|MOS|MONTH|MONTHS|月|月龄|个月)$/u.test(normalized)) return '个月';
  if (/^(D|DAY|DAYS|日|日龄|天)$/u.test(normalized)) return '天';
  return '';
}

function normalizeCompleteAgeText(value: string): string {
  const compact = value.replace(/\s+/gu, '');
  const simpleChinese = compact.match(/^(\d+(?:\.\d+)?)(周岁|岁|个月|月龄|月|日龄|日|天)$/u);
  if (simpleChinese) {
    const unit = normalizePatientAgeUnit(simpleChinese[2]);
    return unit ? `${simpleChinese[1]}${unit}` : compact;
  }

  const coded = compact.match(/^(\d+(?:\.\d+)?)(Y|YR|YRS|M|MO|MOS|D)$/iu);
  if (coded) {
    const unit = normalizePatientAgeUnit(coded[2]);
    return unit ? `${coded[1]}${unit}` : compact;
  }

  // 如“1岁2个月”、“10个月5天”的复合年龄已携带完整单位，原样保留。
  return /(?:岁|月|天|日)/u.test(compact) ? compact : '';
}

export function formatPatientAgeText(
  value: unknown,
  unit?: unknown,
  options: { assumeYears?: boolean } = {},
): string {
  const raw = text(value);
  if (!raw) return '';

  const complete = normalizeCompleteAgeText(raw);
  if (complete) return complete;

  const displayUnit = normalizePatientAgeUnit(unit);
  if (displayUnit) {
    return `${raw}${displayUnit}`;
  }

  // 裸数字无法区分岁、月龄或日龄；只有调用方明确保证该字段为岁数时才补“岁”。
  return options.assumeYears ? `${raw}岁` : '';
}
