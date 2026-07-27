import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseType,
  TcdVisitDrugItem,
  TcdVisitForm,
  TcdVisitKind,
  TcdVisitStatus,
} from '../types';

export interface FusedFollowUpFormState {
  idPhr: string;
  idRecord: string;
  id: string;
  status: TcdVisitStatus;
  sdVisitKind: TcdVisitKind[];
  dtHyPlan: string;
  dtDbsPlan: string;
  sdDataWay: string;
  stature: string;
  avoirdupois: string;
  advAdp: string;
  bmi: string;
  advBmi: string;
  waistline: string;
  advWaistline: string;
  pressureH: string;
  pressureL: string;
  heartRate: string;
  glu: string;
  fbgMeal: string;
  isGlu: string;
  inputUser: string;
  idUser: string;
  sdHySymptom: string[];
  sdDbsSymptom: string[];
  desOther: string;
  sdArteriopalmus: string[];
  sdProAct: string;
  sdPsychicAdj: string;
  fgCardiovascular: string;
  lowEffects: string;
  otherDisease: string;
  note: string;
  sdWehtherSmoke: string;
  daySmoke: string;
  advDaySmoke: string;
  sdWhetherDrink: string;
  dayDrink: string;
  advDayDrink: string;
  sdMainDrinking: string;
  sportWeek: string;
  advSportWeek: string;
  sportMinute: string;
  advSportMinute: string;
  sdSalt: string;
  sdAdvSalt: string;
  rice: string;
  targRice: string;
  fgDrugChange: string;
  sdDrugPro: string;
  sdSideEffects: string;
  desSideEffects: string;
  drugList: TcdVisitDrugItem[];
  fgRef: string;
  sdRefStatus: string;
  desRef: string;
  refDep: string;
  desNoRef: string;
  desAdr: string;
  sdComplications: string[];
  desComplications: string;
  desComor: string;
  sdComorbidity: string[];
  desComorbidity: string;
  sdMajorCc: string[];
  targetOrganDamage: string[];
  desPresAdvice: string;
}

export interface FollowUpValidationIssue {
  message: string;
  sectionIndex: number;
}

export interface DictionaryOption {
  value: string;
  label: string;
}

// 这些标签只用于随访表单展示，业务值仍按对接系统原值保存。
export const HYPERTENSION_SYMPTOM_OPTIONS: DictionaryOption[] = [
  { value: '1', label: '无症状' },
  { value: '2', label: '头痛头晕' },
  { value: '3', label: '恶心呕吐' },
  { value: '4', label: '眼花耳鸣' },
  { value: '5', label: '呼吸困难' },
  { value: '6', label: '心悸胸闷' },
  { value: '7', label: '鼻衄出血不止' },
  { value: '8', label: '四肢发麻' },
  { value: '9', label: '下肢水肿' },
  { value: '0', label: '其他' },
];

export const DIABETES_SYMPTOM_OPTIONS: DictionaryOption[] = [
  { value: '1', label: '无症状' },
  { value: '2', label: '多饮' },
  { value: '3', label: '多食' },
  { value: '4', label: '多尿' },
  { value: '5', label: '视力模糊' },
  { value: '6', label: '感染' },
  { value: '7', label: '手脚麻木' },
  { value: '8', label: '下肢浮肿' },
  { value: '9', label: '体重明显下降' },
  { value: '0', label: '其他症状' },
];

export const ARTERIOPALMUS_OPTIONS: DictionaryOption[] = [
  { value: '0', label: '未测' },
  { value: '1', label: '未触及' },
  { value: '2', label: '触及双侧对称' },
  { value: '4', label: '触及左侧弱或消失' },
  { value: '5', label: '触及右侧弱或消失' },
];

export const COMPLICATION_OPTIONS: DictionaryOption[] = [
  { value: '1', label: '糖尿病视网膜病变' },
  { value: '2', label: '糖尿病肾病' },
  { value: '3', label: '神经病变' },
  { value: '4', label: '心血管病' },
  { value: '5', label: '脑血管病' },
  { value: '6', label: '外周动脉疾病' },
  { value: '7', label: '下肢血管病变' },
  { value: '0', label: '其他' },
];

export const COMORBIDITY_OPTIONS: DictionaryOption[] = [
  { value: '1', label: '高血压' },
  { value: '2', label: '血脂紊乱' },
  { value: '3', label: '代谢综合症' },
  { value: '4', label: '高尿酸血症' },
  { value: '0', label: '其他' },
];

export const MAJOR_CC_OPTIONS: DictionaryOption[] = [
  { value: '0', label: '无' },
  { value: '1', label: '缺血性卒中' },
  { value: '2', label: '视网膜病变' },
  { value: '3', label: '外周血管疾病' },
  { value: '4', label: '糖尿病' },
  { value: '5', label: '足背动脉减弱' },
  { value: '6', label: '脑出血' },
  { value: '7', label: '短暂性脑缺血发作' },
  { value: '8', label: '心肌梗死史' },
  { value: '9', label: '冠状动脉血运重建' },
  { value: '10', label: '心绞痛' },
  { value: '11', label: '充血性心力衰竭' },
  { value: '12', label: '糖尿病肾病' },
  { value: '13', label: '肾功能受损' },
  { value: '14', label: '其他' },
];

export const TARGET_ORGAN_DAMAGE_OPTIONS: DictionaryOption[] = [
  { value: '0', label: '无' },
  { value: '1', label: '左心室肥厚' },
  { value: '2', label: '动脉壁增厚或动脉粥样硬化' },
  { value: '3', label: '血清肌酐轻度升高' },
  { value: '4', label: '微量白蛋白尿' },
  { value: '5', label: '其他' },
];

export function emptyDrugItem(): TcdVisitDrugItem {
  return {
    id: '',
    idDrug: '',
    idPherec: '',
    naDrug: '',
    sdDrugFreq: '',
    perDose: '',
    doseUnit: '',
    insulin: '',
  };
}

function visitKinds(diseaseTypes: readonly ChronicDiseaseType[]): TcdVisitKind[] {
  const values: TcdVisitKind[] = [];
  if (diseaseTypes.includes('hypertension')) values.push('1');
  if (diseaseTypes.includes('type2_diabetes')) values.push('2');
  return values;
}

export function hasHypertension(form: Pick<FusedFollowUpFormState, 'sdVisitKind'>): boolean {
  return form.sdVisitKind.includes('1');
}

export function hasDiabetes(form: Pick<FusedFollowUpFormState, 'sdVisitKind'>): boolean {
  return form.sdVisitKind.includes('2');
}

export function createFusedFollowUpFormState(
  summary: ChronicDiseasePatientSummary,
): FusedFollowUpFormState {
  const latestPressure = summary.bloodPressurePoints[summary.bloodPressurePoints.length - 1];
  const latestFasting = [...summary.bloodGlucosePoints]
    .reverse()
    .find((item) => item.measurementType === 'fasting');
  const doctorId = summary.doctorId || '';

  return {
    idPhr: summary.idPhr,
    idRecord: summary.idRecord,
    id: '',
    status: '3',
    sdVisitKind: visitKinds(summary.managedDiseaseTypes),
    dtHyPlan: '',
    dtDbsPlan: '',
    sdDataWay: '',
    stature: summary.latestHeightCm?.toString() || '',
    avoirdupois: summary.latestWeightKg?.toString() || '',
    advAdp: '',
    bmi: '',
    advBmi: '',
    waistline: summary.latestWaistCm?.toString() || '',
    advWaistline: '',
    pressureH: latestPressure?.systolic?.toString() || '',
    pressureL: latestPressure?.diastolic?.toString() || '',
    heartRate: summary.latestHeartRate?.toString() || '',
    glu: latestFasting?.value?.toString() || '',
    fbgMeal: '',
    isGlu: '1',
    inputUser: doctorId,
    idUser: doctorId,
    sdHySymptom: [],
    sdDbsSymptom: [],
    desOther: '',
    sdArteriopalmus: [],
    sdProAct: '',
    sdPsychicAdj: '',
    fgCardiovascular: '',
    lowEffects: '',
    otherDisease: '',
    note: '',
    sdWehtherSmoke: '',
    daySmoke: '',
    advDaySmoke: '',
    sdWhetherDrink: '',
    dayDrink: '',
    advDayDrink: '',
    sdMainDrinking: '',
    sportWeek: '',
    advSportWeek: '',
    sportMinute: '',
    advSportMinute: '',
    sdSalt: '',
    sdAdvSalt: '',
    rice: '',
    targRice: '',
    fgDrugChange: '',
    sdDrugPro: '',
    sdSideEffects: '',
    desSideEffects: '',
    drugList: [],
    fgRef: '',
    sdRefStatus: '',
    desRef: '',
    refDep: '',
    desNoRef: '',
    desAdr: '',
    sdComplications: [],
    desComplications: '',
    desComor: '',
    sdComorbidity: [],
    desComorbidity: '',
    sdMajorCc: [],
    targetOrganDamage: [],
    desPresAdvice: '',
  };
}

export function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function calculateBmi(heightCm: string, weightKg: string): string {
  const height = optionalNumber(heightCm);
  const weight = optionalNumber(weightKg);
  if (height === undefined || weight === undefined || height <= 0 || weight <= 0) return '';
  return (weight / ((height / 100) ** 2)).toFixed(2);
}

export function updateCalculatedBmi(form: FusedFollowUpFormState): void {
  form.bmi = calculateBmi(form.stature, form.avoirdupois);
  form.advBmi = calculateBmi(form.stature, form.advAdp);
}

export function toggleExclusiveCode(
  currentCodes: readonly string[],
  code: string,
  exclusiveCode: string,
): string[] {
  if (code === exclusiveCode) {
    return currentCodes.includes(exclusiveCode) ? [] : [exclusiveCode];
  }
  const withoutExclusive = currentCodes.filter((item) => item !== exclusiveCode);
  return withoutExclusive.includes(code)
    ? withoutExclusive.filter((item) => item !== code)
    : [...withoutExclusive, code];
}

export function toggleSymptomCode(currentCodes: readonly string[], code: string): string[] {
  return toggleExclusiveCode(currentCodes, code, '1');
}

export function toggleArteriopalmusCode(
  currentCodes: readonly string[],
  code: string,
): string[] {
  const singleCodes = new Set(['0', '1', '2', '3']);
  if (singleCodes.has(code)) {
    return currentCodes.length === 1 && currentCodes[0] === code ? [] : [code];
  }
  const withoutSingles = currentCodes.filter((item) => !singleCodes.has(item));
  return withoutSingles.includes(code)
    ? withoutSingles.filter((item) => item !== code)
    : [...withoutSingles, code];
}

function required(value: string, message: string, sectionIndex: number): FollowUpValidationIssue | null {
  return value.trim() ? null : { message, sectionIndex };
}

function requiredList(
  values: readonly string[],
  message: string,
  sectionIndex: number,
): FollowUpValidationIssue | null {
  return values.length > 0 ? null : { message, sectionIndex };
}

function numberInRange(
  value: string,
  min: number,
  max: number,
  emptyMessage: string,
  rangeMessage: string,
  sectionIndex: number,
): FollowUpValidationIssue | null {
  const parsed = optionalNumber(value);
  if (parsed === undefined) return { message: emptyMessage, sectionIndex };
  if (parsed < min || parsed > max) return { message: rangeMessage, sectionIndex };
  return null;
}

export function validateFusedFollowUpForm(input: {
  form: FusedFollowUpFormState;
}): FollowUpValidationIssue | null {
  const { form } = input;
  let issue = required(form.idPhr, '患者随访信息不完整，请重新进入随访后再试', 0);
  if (issue) return issue;
  issue = required(form.idRecord, '随访登记信息不完整，请返回 HIS 核对后重试', 0);
  if (issue) return issue;
  if (form.sdVisitKind.length === 0) {
    return { message: '缺少明确公卫在管标记，不能保存正式随访', sectionIndex: 0 };
  }
  if (form.status === '3') {
    issue = required(form.inputUser, '当前医生信息不完整，请重新接诊后再试', 0);
    if (issue) return issue;
    issue = required(form.idUser, '责任医生信息不完整，请返回 HIS 核对后重试', 0);
    if (issue) return issue;
  }

  const measurements: Array<FollowUpValidationIssue | null> = [
    numberInRange(form.stature, 0, 300, '请输入身高', '身高值不在正常范围[0,300]', 1),
    numberInRange(form.avoirdupois, 0, 1000, '请输入体重', '体重值不在正常范围[0,1000]', 1),
    numberInRange(form.advAdp, 0, 1000, '请输入目标体重', '目标体重不在正常范围[0,1000]', 1),
    numberInRange(form.waistline, 0, 999, '请输入腰围', '腰围不在正常范围[0,999]', 1),
    numberInRange(form.advWaistline, 0, 999, '请输入目标腰围', '目标腰围不在正常范围[0,999]', 1),
    numberInRange(form.pressureH, 0, 300, '请输入收缩压', '收缩压值不在正常范围[0,300]', 1),
    numberInRange(form.pressureL, 0, 200, '请输入舒张压', '舒张压值不在正常范围[0,200]', 1),
    numberInRange(form.heartRate, 0, 200, '请输入心率', '心率值不在正常范围[0,200]', 1),
  ];
  issue = measurements.find(Boolean) || null;
  if (issue) return issue;
  if (Number(form.pressureH) < Number(form.pressureL)) {
    return { message: '收缩压需大于或等于舒张压', sectionIndex: 1 };
  }
  if (hasDiabetes(form)) {
    const glucose = form.isGlu === '1' ? form.glu : form.fbgMeal;
    issue = numberInRange(glucose, 0, 100, '请输入血糖', '血糖值不在正常范围[0,100]', 1);
    if (issue) return issue;
  }

  if (hasHypertension(form)) {
    issue = requiredList(form.sdHySymptom, '请输入高血压症状', 2);
    if (issue) return issue;
  }
  if (hasDiabetes(form)) {
    issue = requiredList(form.sdDbsSymptom, '请输入糖尿病症状', 2);
    if (issue) return issue;
  }
  issue = required(form.sdPsychicAdj, '请输入心理调整', 2);
  if (issue) return issue;

  issue = required(form.sdWehtherSmoke, '请输入吸烟情况', 3);
  if (issue) return issue;
  issue = required(form.sdWhetherDrink, '请输入饮酒情况', 3);
  if (issue) return issue;
  for (const [value, message] of [
    [form.sportWeek, '请输入每周运动'],
    [form.advSportWeek, '请输入每周运动目标'],
    [form.sportMinute, '请输入每次运动时长'],
    [form.advSportMinute, '请输入每次运动时长目标'],
  ] as const) {
    issue = required(value, message, 3);
    if (issue) return issue;
  }
  if (hasHypertension(form)) {
    issue = required(form.sdSalt, '请输入日摄盐量', 3);
    if (issue) return issue;
    issue = required(form.sdAdvSalt, '请输入日摄盐目标量', 3);
    if (issue) return issue;
  }
  if (hasDiabetes(form)) {
    issue = required(form.rice, '请输入主食', 3);
    if (issue) return issue;
    issue = required(form.targRice, '请输入目标主食', 3);
    if (issue) return issue;
  }

  if (form.status === '2' || form.status === '3') {
    issue = required(form.fgDrugChange, '请输入是否用药调整', 4);
    if (issue) return issue;
    issue = required(form.sdDrugPro, '请输入服药依从性', 4);
    if (issue) return issue;
    issue = required(form.sdSideEffects, '请输入药物不良反应', 4);
    if (issue) return issue;
    if (form.sdSideEffects === '2') {
      issue = required(form.desSideEffects, '请输入药物不良反应情况', 4);
      if (issue) return issue;
    }
  }
  if (form.desSideEffects.length > 255) {
    return { message: '药物不良反应说明不能超过255个字符', sectionIndex: 4 };
  }
  if (form.desPresAdvice.length > 5007) {
    return { message: '健康指导不能超过5007个字符', sectionIndex: 6 };
  }
  return null;
}

function joined(values: readonly string[]): string {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].join(',');
}

function normalizeRichText(value: string): string {
  const trimmed = value.trim();
  return trimmed === '<p><br></p>' ? '' : trimmed;
}

export function buildFusedFollowUpRequest(
  form: FusedFollowUpFormState,
): TcdVisitForm {
  const smokingDisabled = form.sdWehtherSmoke === '0' || form.sdWehtherSmoke === '2';
  const drinkingDisabled = form.sdWhetherDrink === '0' || form.sdWhetherDrink === '4';
  const diabetes = hasDiabetes(form);
  const hypertension = hasHypertension(form);

  return {
    idPhr: form.idPhr.trim(),
    idRecord: form.idRecord.trim(),
    id: form.id.trim(),
    status: form.status,
    sdVisitKind: joined(form.sdVisitKind),
    dtHyPlan: hypertension ? form.dtHyPlan : '',
    dtDbsPlan: diabetes ? form.dtDbsPlan : '',
    sdDataWay: form.sdDataWay,
    stature: form.stature,
    avoirdupois: form.avoirdupois,
    advAdp: form.advAdp,
    bmi: calculateBmi(form.stature, form.avoirdupois),
    advBmi: calculateBmi(form.stature, form.advAdp),
    waistline: form.waistline,
    advWaistline: form.advWaistline,
    pressureH: form.pressureH,
    pressureL: form.pressureL,
    heartRate: form.heartRate,
    glu: diabetes && form.isGlu === '1' ? form.glu : '',
    fbgMeal: diabetes && form.isGlu === '0' ? form.fbgMeal : '',
    isGlu: form.isGlu,
    inputUser: form.inputUser.trim(),
    idUser: form.idUser.trim(),
    sdHySymptom: hypertension ? joined(form.sdHySymptom) : '',
    sdDbsSymptom: diabetes ? joined(form.sdDbsSymptom) : '',
    desOther: form.desOther.trim(),
    sdArteriopalmus: diabetes ? joined(form.sdArteriopalmus) : '',
    sdProAct: form.sdProAct,
    sdPsychicAdj: form.sdPsychicAdj,
    fgCardiovascular: hypertension ? form.fgCardiovascular : '',
    lowEffects: diabetes ? form.lowEffects : '',
    otherDisease: form.otherDisease.trim(),
    note: form.note.trim(),
    sdWehtherSmoke: form.sdWehtherSmoke,
    daySmoke: smokingDisabled ? '' : form.daySmoke,
    advDaySmoke: smokingDisabled ? '' : form.advDaySmoke,
    sdWhetherDrink: form.sdWhetherDrink,
    dayDrink: drinkingDisabled ? '' : form.dayDrink,
    advDayDrink: drinkingDisabled ? '' : form.advDayDrink,
    sdMainDrinking: drinkingDisabled ? '' : form.sdMainDrinking,
    sportWeek: form.sportWeek,
    advSportWeek: form.advSportWeek,
    sportMinute: form.sportMinute,
    advSportMinute: form.advSportMinute,
    sdSalt: hypertension ? form.sdSalt : '',
    sdAdvSalt: hypertension ? form.sdAdvSalt : '',
    rice: diabetes ? form.rice : '',
    targRice: diabetes ? form.targRice : '',
    fgDrugChange: form.fgDrugChange,
    sdDrugPro: form.sdDrugPro,
    sdSideEffects: form.sdSideEffects,
    desSideEffects: form.sdSideEffects === '2' ? form.desSideEffects.trim() : '',
    drugList: form.fgDrugChange === '1'
      ? form.drugList.filter((item) => item.idDrug.trim())
      : [],
    fgRef: form.fgRef,
    sdRefStatus: form.sdRefStatus,
    desRef: form.desRef,
    refDep: form.refDep.trim(),
    desNoRef: form.desNoRef.trim(),
    desAdr: diabetes ? form.desAdr : '',
    sdComplications: diabetes ? joined(form.sdComplications) : '',
    desComplications: diabetes && form.sdComplications.includes('0')
      ? form.desComplications.trim()
      : '',
    desComor: form.desComor,
    sdComorbidity: joined(form.sdComorbidity),
    desComorbidity: form.sdComorbidity.includes('0') ? form.desComorbidity.trim() : '',
    sdMajorCc: hypertension ? joined(form.sdMajorCc) : '',
    targetOrganDamage: hypertension ? joined(form.targetOrganDamage) : '',
    desPresAdvice: normalizeRichText(form.desPresAdvice),
  };
}
