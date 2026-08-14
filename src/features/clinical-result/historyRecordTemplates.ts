export type HistoryRecordTemplateField = 'pastMedicalHistory' | 'personalHistory' | 'familyHistory';

export const DEFAULT_PAST_MEDICAL_HISTORY_TEMPLATE = '平素体健；否认肝炎史，否认结核史，否认疟疾史，否认其他传染病史；否认肺部疾病史；否认肾脏疾病史；否认其他重大疾病史；否认手术史；否认外伤史；否认输血史；否认过敏史。';
export const DEFAULT_HEALTH_EXAM_PAST_MEDICAL_HISTORY_TEMPLATE = '平素体健；否认肝炎史，否认结核史，否认疟疾史，否认其他传染病史；否认高血压病史；否认糖尿病史；否认心脏病史；否认脑血管病史；否认肺部疾病史；否认肾脏疾病史；否认其他重大疾病史；否认手术史；否认外伤史；否认输血史；否认过敏史。';
export const CHRONIC_PAST_MEDICAL_HISTORY_NEGATIVE_TEMPLATE = '否认肝炎史，否认结核史，否认其他重大传染病史；否认手术史、输血史及药物过敏史。';
export const DEFAULT_PERSONAL_HISTORY_TEMPLATE = '否认外地久居史，否认疫水疫源接触史，否认牧区、矿山、高氟区、低碘区居住史，否认化学性物质、粉尘、放射性物质、有毒物质接触史，否认吸烟史，否认饮酒史，否认药物嗜好史。';
export const DEFAULT_FAMILY_HISTORY_TEMPLATE = '否认家族重大遗传病史，否认家族肿瘤病史，否认家族传染病史，否认家族精神病史。';

function normalizeTemplateText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function isHistoryRecordTemplate(
  field: string,
  value: string,
): field is HistoryRecordTemplateField {
  const normalized = normalizeTemplateText(value);
  if (!normalized) return false;
  if (field === 'personalHistory') return normalized === DEFAULT_PERSONAL_HISTORY_TEMPLATE;
  if (field === 'familyHistory') return normalized === DEFAULT_FAMILY_HISTORY_TEMPLATE;
  if (field !== 'pastMedicalHistory') return false;
  return normalized === DEFAULT_PAST_MEDICAL_HISTORY_TEMPLATE
    || normalized === DEFAULT_HEALTH_EXAM_PAST_MEDICAL_HISTORY_TEMPLATE
    || normalized.includes(CHRONIC_PAST_MEDICAL_HISTORY_NEGATIVE_TEMPLATE);
}
