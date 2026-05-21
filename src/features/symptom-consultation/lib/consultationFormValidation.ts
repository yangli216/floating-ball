export interface ConsultationValidationField {
  applicablePopulation?: {
    genders?: string[];
    ageRange?: {
      min?: number;
      max?: number;
      unit?: 'Y' | 'M' | 'D';
    };
  };
  label?: string;
  required?: boolean;
  storageKey?: string;
  type?: string;
}

export interface ConsultationValidationSection {
  fields?: ConsultationValidationField[];
}

export interface ConsultationValidationSymptom {
  key: string;
  name: string;
  config?: {
    sections?: ConsultationValidationSection[];
  };
}

export interface BuildConsultationValidationInput<TSymptom extends ConsultationValidationSymptom> {
  selectedSymptoms: TSymptom[];
  formData: Record<string, Record<string, any> | undefined>;
  patientInfo: unknown;
  isFieldApplicable: (field: ConsultationValidationField, patientInfo: unknown) => boolean;
}

export interface ConsultationValidationResult {
  errors: string[];
  validationErrors: Record<string, boolean>;
  firstErrorFieldId: string;
}

function isRequiredFieldEmpty(field: ConsultationValidationField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object' && value !== null) {
    const valueObject = value as { inputValue?: unknown; radioValue?: unknown };
    if ('inputValue' in valueObject || 'radioValue' in valueObject) {
      if (!valueObject.inputValue && !valueObject.radioValue) {
        return true;
      }

      if (field.type === 'input_radio' && (!valueObject.inputValue || !valueObject.radioValue)) {
        return true;
      }
    }
  }

  return false;
}

export function buildConsultationFormValidationResult<TSymptom extends ConsultationValidationSymptom>({
  selectedSymptoms,
  formData,
  patientInfo,
  isFieldApplicable,
}: BuildConsultationValidationInput<TSymptom>): ConsultationValidationResult {
  const errors: string[] = [];
  const validationErrors: Record<string, boolean> = {};
  let firstErrorFieldId = '';

  selectedSymptoms.forEach((symptom) => {
    const data = formData[symptom.key];
    const sections = symptom.config?.sections;
    if (!Array.isArray(sections)) {
      return;
    }

    sections.forEach((section) => {
      section.fields?.forEach((field) => {
        if (!field.storageKey || !field.required || !isFieldApplicable(field, patientInfo)) {
          return;
        }

        if (!isRequiredFieldEmpty(field, data?.[field.storageKey])) {
          return;
        }

        errors.push(`${symptom.name}: ${field.label} 为必填项`);
        const errorId = `${symptom.key}_${field.storageKey}`;
        validationErrors[errorId] = true;
        if (!firstErrorFieldId) {
          firstErrorFieldId = `field-${symptom.key}-${field.storageKey}`;
        }
      });
    });
  });

  return {
    errors,
    validationErrors,
    firstErrorFieldId,
  };
}
