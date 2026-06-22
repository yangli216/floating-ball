export type GeneralConditionValue = string | string[] | undefined | null;
export type GeneralConditionData = Record<string, GeneralConditionValue>;

const IGNORED_GENERAL_CONDITION_VALUES = new Set(['其他', '不清楚', '不详']);

const GENERAL_CONDITION_OTHER_DETAIL_KEY_MAP: Record<string, string> = {
  spirit: 'spiritOtherDetail',
  sleep: 'sleepOtherDetail',
  appetite: 'appetiteOtherDetail',
  urination: 'urinationOtherDetail',
  stool: 'stoolOtherDetail',
  weight: 'weightOtherDetail',
};

function isValidGeneralConditionValue(value: GeneralConditionValue): value is string {
  return typeof value === 'string'
    && value.trim() !== ''
    && !IGNORED_GENERAL_CONDITION_VALUES.has(value);
}

function resolveGeneralConditionText(
  data: GeneralConditionData,
  key: string,
): string {
  const value = data[key];
  if (value === '其他') {
    const detailKey = GENERAL_CONDITION_OTHER_DETAIL_KEY_MAP[key];
    const detailValue = detailKey ? data[detailKey] : '';
    return typeof detailValue === 'string' ? detailValue.trim() : '';
  }

  return isValidGeneralConditionValue(value) ? value : '';
}

export function buildGeneralConditionHistoryText(data: GeneralConditionData | undefined): string {
  if (!data) {
    return '';
  }

  const parts: string[] = [];

  ['spirit', 'sleep', 'appetite'].forEach((key) => {
    const value = resolveGeneralConditionText(data, key);
    if (value) {
      parts.push(value);
    }
  });

  const isUrinationNormal = data.urination === '小便正常';
  const isStoolNormal = data.stool === '大便正常';

  if (isUrinationNormal && isStoolNormal) {
    parts.push('二便正常');
  } else {
    const urinationValue = resolveGeneralConditionText(data, 'urination');
    const stoolValue = resolveGeneralConditionText(data, 'stool');
    if (urinationValue) {
      parts.push(urinationValue);
    }
    if (stoolValue) {
      parts.push(stoolValue);
    }
  }

  const weightValue = resolveGeneralConditionText(data, 'weight');
  if (weightValue) {
    parts.push(weightValue);
  }

  return parts.length > 0 ? `${parts.join('，')}。` : '';
}
