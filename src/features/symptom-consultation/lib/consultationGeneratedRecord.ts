export type ConsultationGeneratedRecordMode = 'western' | 'tcm';
export type ConsultationGeneratedRecordTarget = 'chiefComplaint' | 'historyOfPresentIllness';

export interface ConsultationGeneratedRecordSymptom {
  key: string;
  name: string;
}

export interface BuildConsultationGeneratedRecordInput<TSymptom extends ConsultationGeneratedRecordSymptom> {
  selectedSymptoms: TSymptom[];
  formData: Record<string, Record<string, any> | undefined>;
  mode: ConsultationGeneratedRecordMode;
  companionSymptomNames?: string[];
  buildSymptomTexts: (
    symptom: TSymptom,
    data: Record<string, any>,
    target: ConsultationGeneratedRecordTarget,
    excludeKeys?: string[],
  ) => string[];
  buildGeneralConditionText: (data: Record<string, any> | undefined) => string;
  buildTcmSignsText: (data: Record<string, any> | undefined) => string;
}

export interface ConsultationGeneratedRecordDraft {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  tcmFourExaminations: string;
  familyHistory: string;
}

function resolveDuration(firstData: Record<string, any>): string {
  const onsetTime = firstData.onsetTime;
  return onsetTime ? `${onsetTime.inputValue}${onsetTime.radioValue}` : '近日';
}

function resolvePrecipitating(firstData: Record<string, any>): string {
  const value = firstData.precipitatingFactor;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '无明显诱因';
  }
  if (value && value !== '不清楚') {
    return value === '没有原因' ? '无明显诱因' : value;
  }
  return '无明显诱因';
}

export function buildConsultationGeneratedRecord<TSymptom extends ConsultationGeneratedRecordSymptom>(
  input: BuildConsultationGeneratedRecordInput<TSymptom>,
): ConsultationGeneratedRecordDraft {
  const complaints = input.selectedSymptoms.map((symptom) => {
    const data = input.formData[symptom.key] || {};
    const chiefComplaintTexts = input.buildSymptomTexts(symptom, data, 'chiefComplaint');
    return `${symptom.name}${chiefComplaintTexts.join('')}`;
  });

  const hpiParts: string[] = [];
  const firstSymptom = input.selectedSymptoms[0];
  if (firstSymptom) {
    const firstData = input.formData[firstSymptom.key] || {};
    const symptomNames = input.selectedSymptoms.map((symptom) => symptom.name).join('、');
    hpiParts.push(
      `患者于${resolveDuration(firstData)}前，${resolvePrecipitating(firstData)}出现${symptomNames}。`,
    );
  }

  input.selectedSymptoms.forEach((symptom, index) => {
    const data = input.formData[symptom.key] || {};
    const excludeKeys = index === 0
      ? ['onsetTime', 'precipitatingFactor']
      : ['onsetTime'];
    const hpiTexts = input.buildSymptomTexts(
      symptom,
      data,
      'historyOfPresentIllness',
      excludeKeys,
    );
    if (hpiTexts.length > 0) {
      hpiParts.push(`${symptom.name}：${hpiTexts.join('，')}。`);
    }
  });

  let tcmFourExaminations = '';
  if (input.mode === 'western') {
    const generalConditionText = input.buildGeneralConditionText(input.formData.general);
    if (generalConditionText) {
      hpiParts.push(generalConditionText);
    }
  } else {
    tcmFourExaminations = input.buildTcmSignsText(input.formData.tcm_signs);
  }

  if (input.companionSymptomNames?.length) {
    hpiParts.push(`伴${input.companionSymptomNames.join('、')}。`);
  }

  return {
    chiefComplaint: `${complaints.join('，')}。`,
    historyOfPresentIllness: hpiParts.join('\n'),
    tcmFourExaminations: tcmFourExaminations.trim(),
    familyHistory: '',
  };
}
