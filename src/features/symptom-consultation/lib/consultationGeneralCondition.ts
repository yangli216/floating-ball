export type GeneralConditionValue = string | string[] | undefined | null;
export type GeneralConditionData = Record<string, GeneralConditionValue>;

const IGNORED_GENERAL_CONDITION_VALUES = new Set(['其他', '不清楚', '不详']);

function isValidGeneralConditionValue(value: GeneralConditionValue): value is string {
  return typeof value === 'string'
    && value.trim() !== ''
    && !IGNORED_GENERAL_CONDITION_VALUES.has(value);
}

export function buildGeneralConditionHistoryText(data: GeneralConditionData | undefined): string {
  if (!data) {
    return '';
  }

  const parts: string[] = [];

  ['spirit', 'sleep', 'appetite'].forEach((key) => {
    const value = data[key];
    if (isValidGeneralConditionValue(value)) {
      parts.push(value);
    }
  });

  const isUrinationNormal = data.urination === '小便正常';
  const isStoolNormal = data.stool === '大便正常';

  if (isUrinationNormal && isStoolNormal) {
    parts.push('二便正常');
  } else {
    if (isValidGeneralConditionValue(data.urination)) {
      parts.push(data.urination);
    }
    if (isValidGeneralConditionValue(data.stool)) {
      parts.push(data.stool);
    }
  }

  if (isValidGeneralConditionValue(data.weight)) {
    parts.push(data.weight);
  }

  return parts.length > 0 ? `${parts.join('，')}。` : '';
}
