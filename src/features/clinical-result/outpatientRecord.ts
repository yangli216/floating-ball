export const OUTPATIENT_RECORD_SCHEMA_VERSION = 'outpatient-record.v1' as const;

export type OutpatientRecordScenario =
  | 'health_exam'
  | 'chronic_refill'
  | 'external_procedure'
  | 'wound_care'
  | 'respiratory'
  | 'gastrointestinal'
  | 'skin_allergy'
  | 'local_inflammation'
  | 'general';

export interface OutpatientRecord {
  schemaVersion: typeof OUTPATIENT_RECORD_SCHEMA_VERSION;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  personalHistory: string;
  familyHistory: string;
  physicalExam: string;
  precautions: string;
}

export interface BuildOutpatientRecordInput {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory?: string;
  personalHistory?: string;
  familyHistory?: string;
  physicalExam?: string;
  precautions?: string;
  vitals?: string;
  diagnosisNames?: readonly string[];
}

export interface OutpatientRecordQualityIssue {
  severity: 'warning' | 'error';
  field: keyof OutpatientRecord | 'diagList';
  message: string;
}

const DEFAULT_PAST_MEDICAL_HISTORY = '平素体健；否认肝炎史，否认结核史，否认疟疾史，否认其他传染病史；否认肺部疾病史；否认肾脏疾病史；否认其他重大疾病史；否认手术史；否认外伤史；否认输血史；否认过敏史。';
const DEFAULT_HEALTH_EXAM_PAST_MEDICAL_HISTORY = '平素体健；否认肝炎史，否认结核史，否认疟疾史，否认其他传染病史；否认高血压病史；否认糖尿病史；否认心脏病史；否认脑血管病史；否认肺部疾病史；否认肾脏疾病史；否认其他重大疾病史；否认手术史；否认外伤史；否认输血史；否认过敏史。';
const DEFAULT_PERSONAL_HISTORY = '否认外地久居史，否认疫水疫源接触史，否认牧区、矿山、高氟区、低碘区居住史，否认化学性物质、粉尘、放射性物质、有毒物质接触史，否认吸烟史，否认饮酒史，否认药物嗜好史。';
const DEFAULT_FAMILY_HISTORY = '否认家族重大遗传病史，否认家族肿瘤病史，否认家族传染病史，否认家族精神病史。';

const EMPTY_RECORD_VALUES = new Set([
  '',
  '无',
  '无。',
  '无特殊',
  '无特殊。',
  '暂无',
  '暂无。',
  '未提供',
  '未提供。',
  '未记录',
  '未记录。',
  '未提供既往史。',
  '未提供既往病史。',
  '未见明确既往史记录。',
]);

function normalizeText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/\s+/gu, '')
    .replace(/([，。；、])+/gu, '$1')
    .trim();
}

function normalizeFreeText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/\s+/gu, ' ')
    .trim();
}

function stripFieldLabel(value: string, labels: string[]): string {
  let next = value.trim();
  for (const label of labels) {
    next = next.replace(new RegExp(`^${label}[：:]?`, 'u'), '').trim();
  }
  return next;
}

function isMeaningfulRecordText(value: string): boolean {
  return !EMPTY_RECORD_VALUES.has(value.trim());
}

function joinedContext(input: BuildOutpatientRecordInput): string {
  return [
    input.chiefComplaint,
    input.historyOfPresentIllness,
    ...(input.diagnosisNames || []),
  ].map((item) => normalizeText(item)).join(' ');
}

export function detectOutpatientRecordScenario(input: BuildOutpatientRecordInput): OutpatientRecordScenario {
  const text = joinedContext(input);

  if (/健康证|务工|体检|查体|健康查体/u.test(text)) return 'health_exam';
  if (/外配药|雾化|注射/u.test(text)) return 'external_procedure';
  if (/复诊配药|续方|慢病|高血压|糖尿病|高脂血症|甲减|甲状腺功能减退/u.test(text)) return 'chronic_refill';
  if (/术后|清创|缝合|换药|烫伤|外伤|砸伤|伤口|创面|挫伤/u.test(text)) return 'wound_care';
  if (/咳|咽|痰|鼻塞|流涕|支气管|上呼吸道/u.test(text)) return 'respiratory';
  if (/腹泻|腹痛|呕吐|胃肠|腹部/u.test(text)) return 'gastrointestinal';
  if (/瘙痒|皮疹|荨麻疹|过敏性皮炎/u.test(text)) return 'skin_allergy';
  if (/红肿|甲沟炎|痛风|关节炎|关节痛/u.test(text)) return 'local_inflammation';

  return 'general';
}

function buildPastMedicalHistory(
  input: BuildOutpatientRecordInput,
  scenario: OutpatientRecordScenario,
): string {
  const provided = stripFieldLabel(normalizeFreeText(input.pastMedicalHistory), ['既往史']);
  if (isMeaningfulRecordText(provided)) {
    return provided;
  }

  if (scenario === 'health_exam') {
    return DEFAULT_HEALTH_EXAM_PAST_MEDICAL_HISTORY;
  }

  const chronicDiagnoses = (input.diagnosisNames || [])
    .map((item) => normalizeText(item))
    .filter((item) => /高血压|糖尿病|高脂血症|甲减|甲状腺功能减退|痛风/u.test(item));
  if (chronicDiagnoses.length > 0) {
    return `既往有${Array.from(new Set(chronicDiagnoses)).join('、')}病史；否认肝炎史，否认结核史，否认其他重大传染病史；否认手术史、输血史及药物过敏史。`;
  }

  return DEFAULT_PAST_MEDICAL_HISTORY;
}

function buildPersonalHistory(input: BuildOutpatientRecordInput): string {
  const provided = stripFieldLabel(normalizeFreeText(input.personalHistory), ['个人史']);
  return isMeaningfulRecordText(provided) ? provided : DEFAULT_PERSONAL_HISTORY;
}

function buildFamilyHistory(input: BuildOutpatientRecordInput): string {
  const provided = stripFieldLabel(normalizeFreeText(input.familyHistory), ['家族史']);
  return isMeaningfulRecordText(provided) ? provided : DEFAULT_FAMILY_HISTORY;
}

function normalizeVitals(vitals?: string): string {
  const normalized = normalizeFreeText(vitals);
  if (!normalized) {
    return '';
  }
  return /[。.]$/u.test(normalized) ? normalized : `${normalized}。`;
}

function inferBodySite(text: string): string {
  const match = text.match(/(前额|全身|咽喉部|腹部|[左右]?(?:手掌|足背|足拇趾|中指|跟部|膝关节|足|手|指|趾|耳|鼻))/u);
  return match?.[0] || '';
}

function buildPhysicalExam(
  input: BuildOutpatientRecordInput,
  scenario: OutpatientRecordScenario,
): string {
  const provided = stripFieldLabel(normalizeFreeText(input.physicalExam), ['体格检查', '查体']);
  if (isMeaningfulRecordText(provided)) {
    return provided;
  }

  const vitals = normalizeVitals(input.vitals);
  const contextText = joinedContext(input);
  const bodySite = inferBodySite(contextText);

  switch (scenario) {
    case 'health_exam':
      return `${vitals}一般情况可，心肺腹查体未见明显异常。`;
    case 'chronic_refill':
      return `${vitals}面部无浮肿，双肺呼吸音清晰，未闻及啰音，心律齐，腹无特殊，双下肢无水肿。`;
    case 'external_procedure':
      return provided || '暂无';
    case 'wound_care':
      return `${vitals}${bodySite ? `${bodySite}局部` : '局部'}查体待医生结合实际补充。`;
    case 'respiratory':
      return `${vitals}双肺呼吸音清，未及干湿啰音。`;
    case 'gastrointestinal':
      return `${vitals}腹软，未及压痛及反跳痛。`;
    case 'skin_allergy':
      return `${vitals}${bodySite || '皮肤'}查体待医生结合实际补充。`;
    case 'local_inflammation':
      return `${vitals}${bodySite ? `${bodySite}局部` : '局部'}红肿及压痛情况待医生查体确认。`;
    default:
      return `${vitals}一般情况可，心肺腹查体未见明显异常。`;
  }
}

function buildPrecautions(
  input: BuildOutpatientRecordInput,
  scenario: OutpatientRecordScenario,
): string {
  const provided = stripFieldLabel(normalizeFreeText(input.precautions), ['注意事项']);
  if (isMeaningfulRecordText(provided)) {
    return provided;
  }

  const diagnosisNamesText = (input.diagnosisNames || []).join('、');
  if (/高血压/u.test(diagnosisNamesText) || /高血压/u.test(joinedContext(input))) {
    return '1.少吃咸菜、腌制食品，每日食盐量不超过5克。2.多吃新鲜蔬菜、水果和豆类等富钾食物。3.少吃肥肉、动物内脏、油炸食品等高脂肪食物。4.遵医嘱坚持长期药物治疗，不要自行停药或调整药物。5.定期复查血压、血糖、血脂等指标。';
  }

  switch (scenario) {
    case 'health_exam':
      return '完善相关检查，如有异常2周内复诊，必要时上级医院进一步检查治疗。';
    case 'external_procedure':
      return '告知病情，如有不适，建议上级医院复诊。';
    case 'wound_care':
      return '伤口禁止沾水，按医嘱复诊换药，必要时上级医院进一步检查治疗。';
    default:
      return '注意休息，1周内复诊，必要时上级医院进一步检查治疗。';
  }
}

export function buildOutpatientRecord(input: BuildOutpatientRecordInput): OutpatientRecord {
  const scenario = detectOutpatientRecordScenario(input);
  const chiefComplaint = normalizeFreeText(input.chiefComplaint);
  const historyOfPresentIllness = normalizeFreeText(input.historyOfPresentIllness);

  return {
    schemaVersion: OUTPATIENT_RECORD_SCHEMA_VERSION,
    chiefComplaint,
    historyOfPresentIllness,
    pastMedicalHistory: buildPastMedicalHistory(input, scenario),
    personalHistory: buildPersonalHistory(input),
    familyHistory: buildFamilyHistory(input),
    physicalExam: buildPhysicalExam(input, scenario),
    precautions: buildPrecautions(input, scenario),
  };
}

function containsDeniedDisease(text: string, disease: string): boolean {
  const compact = normalizeText(text);
  return compact.includes(`否认${disease}病史`) || compact.includes(`否认${disease}`);
}

export function validateOutpatientRecord(
  record: OutpatientRecord,
  input: Pick<BuildOutpatientRecordInput, 'diagnosisNames' | 'chiefComplaint' | 'historyOfPresentIllness'>,
): OutpatientRecordQualityIssue[] {
  const issues: OutpatientRecordQualityIssue[] = [];

  ([
    ['chiefComplaint', record.chiefComplaint],
    ['historyOfPresentIllness', record.historyOfPresentIllness],
    ['pastMedicalHistory', record.pastMedicalHistory],
    ['personalHistory', record.personalHistory],
    ['familyHistory', record.familyHistory],
    ['physicalExam', record.physicalExam],
    ['precautions', record.precautions],
  ] as Array<[keyof OutpatientRecord, string]>).forEach(([field, value]) => {
    if (!value.trim()) {
      issues.push({ severity: 'warning', field, message: '完整门诊病历字段为空，请医生补充确认。' });
    }
  });

  const recordAsLoose = record as OutpatientRecord & { diagnosisText?: unknown };
  if (typeof recordAsLoose.diagnosisText !== 'undefined') {
    issues.push({
      severity: 'error',
      field: 'diagList',
      message: 'outpatientRecord 不应包含 diagnosisText，病历诊断行应由 HIS 根据 diagList 生成。',
    });
  }

  const complaintAndHistory = normalizeText(`${input.chiefComplaint}${input.historyOfPresentIllness}`);
  const physicalExam = normalizeText(record.physicalExam);
  if ((complaintAndHistory.includes('右') && physicalExam.includes('左') && !physicalExam.includes('右'))
    || (complaintAndHistory.includes('左') && physicalExam.includes('右') && !physicalExam.includes('左'))) {
    issues.push({
      severity: 'warning',
      field: 'physicalExam',
      message: '主诉/现病史与体格检查左右部位可能不一致，请医生复核。',
    });
  }

  const diagnosisContext = normalizeText((input.diagnosisNames || []).join('、'));
  [
    ['高血压', '高血压'],
    ['糖尿病', '糖尿病'],
    ['甲状腺功能减退', '甲状腺功能减退'],
    ['甲减', '甲减'],
  ].forEach(([diagnosisKeyword, disease]) => {
    if (diagnosisContext.includes(diagnosisKeyword) && containsDeniedDisease(record.pastMedicalHistory, disease)) {
      issues.push({
        severity: 'error',
        field: 'pastMedicalHistory',
        message: `既往史与当前诊断“${diagnosisKeyword}”存在矛盾，请医生复核。`,
      });
    }
  });

  return issues;
}
