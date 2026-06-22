export interface SymptomFormFieldLike {
  key?: string;
  storageKey?: string;
  type?: string;
  props?: {
    options?: string[];
    otherOptionLabel?: string;
    otherDetailKey?: string;
    otherPlaceholder?: string;
    mutualExclusions?: string[][];
  };
}

export interface SymptomFormSectionLike {
  fields?: SymptomFormFieldLike[];
}

export interface SymptomFormConfigLike {
  key?: string;
  config?: {
    sections?: SymptomFormSectionLike[];
  };
}

export type SymptomFormValue = string | string[] | { inputValue: string; radioValue: string };
export type SymptomFormData = Record<string, SymptomFormValue>;

export function getSymptomFieldKey(field: SymptomFormFieldLike): string {
  return field.storageKey || field.key || '';
}

export function buildInitialSymptomFormData(configItem: SymptomFormConfigLike): SymptomFormData {
  const data: SymptomFormData = {};
  const sections = configItem.config?.sections;
  if (!Array.isArray(sections)) {
    return data;
  }

  sections.forEach((section) => {
    section.fields?.forEach((field) => {
      const fieldKey = getSymptomFieldKey(field);
      if (!fieldKey) return;

      if (field.type === 'input_radio') {
        data[fieldKey] = { inputValue: '', radioValue: '' };
      } else if (field.type === 'checkbox') {
        data[fieldKey] = [];
      } else if (configItem.key === 'general' && field.props?.options?.length) {
        data[fieldKey] = field.props.options[0];
      } else {
        data[fieldKey] = '';
      }

      if (field.props?.otherDetailKey) {
        data[field.props.otherDetailKey] = '';
      }
    });
  });

  return data;
}

export interface ApplyCheckboxFieldChangeInput {
  currentValues: string[];
  value: string;
  checked: boolean;
  mutualExclusions?: string[][];
}

export function applyCheckboxFieldChange({
  currentValues,
  value,
  checked,
  mutualExclusions,
}: ApplyCheckboxFieldChangeInput): string[] {
  if (!checked) {
    return currentValues.filter((item) => item !== value);
  }

  let nextValues = [...currentValues, value];
  if (mutualExclusions) {
    const myGroup = mutualExclusions.find((group) => group.includes(value));
    if (myGroup) {
      const allOtherValues = mutualExclusions
        .filter((group) => group !== myGroup)
        .flat();
      nextValues = nextValues.filter((item) => !allOtherValues.includes(item));
    }
  }

  return nextValues;
}
