export interface TcmSignsFieldLike {
  key?: string;
  storageKey?: string;
  label?: string;
}

export interface TcmSignsSectionLike {
  title?: string;
  fields?: TcmSignsFieldLike[];
}

export interface TcmSignsConfigLike {
  config?: {
    sections?: TcmSignsSectionLike[];
  };
}

export type TcmSignsFormValue = string | string[] | undefined | null;
export type TcmSignsFormData = Record<string, TcmSignsFormValue>;

const EMPTY_TCM_SIGNS_PROMPT = '未填写详细四诊信息';
const IGNORED_TCM_SIGN_VALUES = new Set(['其他', '不清楚', '不详']);

function cleanTcmSignText(value: string): string {
  return value ? value.replace(/\(.*?\)/, '') : '';
}

function readTcmFieldValue(data: TcmSignsFormData, field: TcmSignsFieldLike): TcmSignsFormValue {
  const key = field.storageKey || field.key || '';
  return key ? data[key] : undefined;
}

function formatReportFieldLabel(field: TcmSignsFieldLike, cleanedValue: string): string {
  if (field.key === 'tongue_body' || field.key === 'tongue_shape') {
    return `舌${cleanedValue}`;
  }
  if (field.key === 'tongue_coating') {
    return `苔${cleanedValue}`;
  }
  if (field.key === 'coating_quality') {
    return `苔质${cleanedValue}`;
  }
  if (field.key === 'pulse') {
    return `脉${cleanedValue}`;
  }
  return `${field.label || ''}${cleanedValue}`;
}

export function buildTcmSignsPromptText(
  config: TcmSignsConfigLike,
  data: TcmSignsFormData | undefined,
): string {
  if (!data) {
    return EMPTY_TCM_SIGNS_PROMPT;
  }

  const signs: string[] = [];
  config.config?.sections?.forEach((section) => {
    const sectionSigns: string[] = [];
    section.fields?.forEach((field) => {
      const value = readTcmFieldValue(data, field);
      if (Array.isArray(value) && value.length > 0) {
        sectionSigns.push(`${field.label || ''}：${value.join('、')}`);
      } else if (typeof value === 'string' && value.trim() !== '') {
        sectionSigns.push(`${field.label || ''}：${value}`);
      }
    });

    if (sectionSigns.length > 0) {
      signs.push(`【${section.title || ''}】${sectionSigns.join('，')}`);
    }
  });

  return signs.length > 0 ? signs.join('\n') : EMPTY_TCM_SIGNS_PROMPT;
}

export function buildTcmSignsReportText(
  config: TcmSignsConfigLike,
  data: TcmSignsFormData | undefined,
): string {
  if (!data) {
    return '';
  }

  const sections: string[] = [];
  config.config?.sections?.forEach((section) => {
    const sectionSigns: string[] = [];

    section.fields?.forEach((field) => {
      const value = readTcmFieldValue(data, field);
      if (Array.isArray(value) && value.length > 0) {
        const cleanedValues = value.map(cleanTcmSignText);
        sectionSigns.push(`${field.label || ''}${cleanedValues.join('、')}`);
      } else if (
        typeof value === 'string'
        && value.trim() !== ''
        && !IGNORED_TCM_SIGN_VALUES.has(value)
      ) {
        sectionSigns.push(formatReportFieldLabel(field, cleanTcmSignText(value)));
      }
    });

    if (sectionSigns.length > 0) {
      sections.push(`${section.title || ''}：${sectionSigns.join('，')}。`);
    }
  });

  return sections.join('\n');
}
