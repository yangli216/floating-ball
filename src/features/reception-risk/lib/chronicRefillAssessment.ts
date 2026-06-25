import type { HisPatientHistory, HisVisitRecord } from '@/services/his/types';

export interface ChronicRefillCandidate {
  diagnosis: string;
  diagnoses: string[];
  medications: string[];
  chronicVisitCount: number;
  chronicVisits: HisVisitRecord[];
  evidenceText: string;
}

export interface CurrentEncounterIntentContext {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  diagnosis?: string;
}

const CHRONIC_DIAGNOSIS_GROUPS: Array<{ name: string; keywords: string[] }> = [
  { name: '高血压', keywords: ['高血压'] },
  { name: '糖尿病', keywords: ['糖尿病'] },
  { name: '冠心病', keywords: ['冠心病', '冠状动脉粥样硬化性心脏病'] },
  { name: '血脂异常', keywords: ['高脂血症', '血脂异常', '高胆固醇血症'] },
  { name: '慢性阻塞性肺疾病', keywords: ['慢性阻塞性肺疾病', '慢阻肺'] },
  { name: '支气管哮喘', keywords: ['支气管哮喘', '哮喘'] },
  { name: '心房颤动', keywords: ['心房颤动', '房颤'] },
  { name: '慢性心力衰竭', keywords: ['慢性心力衰竭', '心力衰竭', '心衰'] },
  { name: '甲状腺功能减退', keywords: ['甲状腺功能减退', '甲减'] },
  { name: '高尿酸血症', keywords: ['高尿酸血症', '痛风'] },
  { name: '癫痫', keywords: ['癫痫'] },
  { name: '帕金森病', keywords: ['帕金森病', '帕金森综合征'] },
];

const ACUTE_DIAGNOSIS_KEYWORDS = [
  '急性',
  '上呼吸道感染',
  '支气管炎',
  '肺炎',
  '胃肠炎',
  '扁桃体炎',
  '外伤',
];

const REPORT_FOLLOW_UP_PATTERNS = [
  /(?:携|带|拿).{0,8}(?:报告|检查结果|检验结果|化验结果|影像结果)/u,
  /(?:复诊|回诊|回来|再诊).{0,10}(?:报告|结果|检查|检验|化验|影像)/u,
  /(?:报告|检查结果|检验结果|化验结果|影像结果).{0,10}(?:复诊|回诊|回来|解读|查看|复核)/u,
  /(?:看|查看|解读|复核).{0,6}(?:报告|检查结果|检验结果|化验结果|影像结果)/u,
  /(?:检查|检验|化验|影像)结果(?:已出|出来)/u,
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function isReportFollowUpIntent(
  context: CurrentEncounterIntentContext | null | undefined,
): boolean {
  const encounterText = [
    context?.chiefComplaint,
    context?.historyOfPresentIllness,
    context?.diagnosis,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('；');
  if (!encounterText) return false;

  return REPORT_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(encounterText));
}

function findChronicDiagnosis(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized || ACUTE_DIAGNOSIS_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)))) {
    return '';
  }
  return CHRONIC_DIAGNOSIS_GROUPS.find((group) => (
    group.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
  ))?.name || '';
}

function normalizeMedicationName(value: string): string {
  return value
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\d+(?:\.\d+)?\s*(?:mg|g|ml|片|粒|支|盒|瓶|袋)/gi, '')
    .replace(/\s+/g, '')
    .trim();
}

function latestVisits(history: HisPatientHistory | null | undefined): HisVisitRecord[] {
  return [...(history?.visits || [])]
    .sort((left, right) => right.visitTime - left.visitTime)
    .slice(0, 3);
}

export function assessChronicRefillCandidate(
  history: HisPatientHistory | null | undefined,
  currentEncounter?: CurrentEncounterIntentContext | null,
  hasFollowUpReport?: boolean,
): ChronicRefillCandidate | null {
  if (hasFollowUpReport || isReportFollowUpIntent(currentEncounter)) return null;

  const visits = latestVisits(history);
  const chronicDiagnoses: string[] = [];
  const chronicVisits = visits.filter((visit) => {
    const visitDiagnoses = (visit.diagnoses || [])
      .map(findChronicDiagnosis)
      .filter(Boolean);
    visitDiagnoses.forEach((diagnosis) => {
      if (!chronicDiagnoses.includes(diagnosis)) {
        chronicDiagnoses.push(diagnosis);
      }
    });
    return visitDiagnoses.length > 0;
  });
  if (chronicVisits.length === 0) return null;

  const medications = new Map<string, string>();
  chronicVisits.forEach((visit) => {
    (visit.medications || []).forEach((medication) => {
      const normalized = normalizeMedicationName(medication);
      if (!normalized) return;
      if (!medications.has(normalized)) {
        medications.set(normalized, medication.trim());
      }
    });
  });
  const chronicMedications = Array.from(medications.values()).slice(0, 8);
  if (chronicMedications.length === 0) return null;

  const diagnosis = chronicDiagnoses[0];

  return {
    diagnosis,
    diagnoses: chronicDiagnoses,
    medications: chronicMedications,
    chronicVisitCount: chronicVisits.length,
    chronicVisits,
    evidenceText: `历史就诊记录显示${chronicDiagnoses.join('、')}慢病诊断及配药记录：${chronicMedications.join('、')}`,
  };
}
