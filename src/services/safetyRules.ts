/**
 * L1 刚性安全复核规则引擎（确定性、无网络、毫秒级）
 *
 * 设计原则：
 * - 仅纳入"高确信度、低误报"的硬规则，宁缺勿滥
 * - 任何概率性/语义性判断交给 L2 柔性提醒（useVoiceSafetyReview）
 * - 规则失败不等于替代柔性提醒，两层并行存在
 *
 * 当前覆盖：
 *  1. 抗生素过敏交叉禁忌（青霉素 / 头孢 / 磺胺类）
 *  2. 诊断-性别硬冲突（盆腔炎/前列腺炎/妊娠相关 vs 性别）
 *  3. 儿童禁用药（按年龄阈值，如喹诺酮 < 18 岁）
 *  4. 重复用药（同一通用名/同类药物双写）
 */

import type { GeneratedRecord, MedicationEntry, PatientInfo } from '../types/voiceResult';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextGenderText,
} from '../utils/patientContext';

export type RigidBlockSeverity = 'block' | 'warn';

export type RigidBlockCategory =
  | 'allergy_cross_class'
  | 'diagnosis_gender_conflict'
  | 'pediatric_contraindication'
  | 'duplicate_medication';

export interface RigidBlockAlert {
  id: string;
  category: RigidBlockCategory;
  severity: RigidBlockSeverity;
  title: string;
  message: string;
  relatedItems: string[];
  evidence?: string;
}

// ---------- 数据表 ----------

interface DrugClass {
  classId: string;
  classLabel: string;
  /** 过敏史关键词（命中即视为该类过敏） */
  allergyKeywords: string[];
  /** 该类下属药物的关键词（命中处方即视为该类药物） */
  drugKeywords: string[];
}

const ANTIBIOTIC_CLASSES: DrugClass[] = [
  {
    classId: 'penicillin',
    classLabel: '青霉素类',
    allergyKeywords: ['青霉素', '阿莫西林', '氨苄西林', '哌拉西林', 'PCN'],
    drugKeywords: [
      '青霉素', '阿莫西林', '氨苄西林', '哌拉西林', '美洛西林', '苯唑西林',
      '氟氯西林', '阿洛西林', '舒巴坦', '克拉维酸',
    ],
  },
  {
    classId: 'cephalosporin',
    classLabel: '头孢菌素类',
    allergyKeywords: ['头孢', '先锋'],
    drugKeywords: [
      '头孢', '先锋', '头孢氨苄', '头孢拉定', '头孢呋辛', '头孢克洛', '头孢克肟',
      '头孢曲松', '头孢噻肟', '头孢哌酮', '头孢他啶', '头孢吡肟', '头孢泊肟',
      '头孢地尼', '头孢丙烯',
    ],
  },
  {
    classId: 'sulfa',
    classLabel: '磺胺类',
    allergyKeywords: ['磺胺', '复方新诺明', '增效联磺', 'SMZ'],
    drugKeywords: [
      '磺胺', '复方新诺明', '增效联磺', '柳氮磺吡啶', '磺胺嘧啶', '磺胺甲噁唑',
      '磺胺甲恶唑', '甲氧苄啶', '复方磺胺', 'SMZ-TMP',
    ],
  },
];

interface GenderConflict {
  diagnosisKeywords: string[];
  forbiddenSex: '男' | '女';
  label: string;
}

const DIAGNOSIS_GENDER_CONFLICTS: GenderConflict[] = [
  { diagnosisKeywords: ['盆腔炎', '子宫', '宫颈', '阴道炎', '卵巢', '输卵管', '月经', '痛经', '妊娠', '孕', '流产', '产后', '更年期'], forbiddenSex: '男', label: '女性专属诊断' },
  { diagnosisKeywords: ['前列腺', '精囊', '阴茎', '睾丸', '附睾', '包皮', '勃起'], forbiddenSex: '女', label: '男性专属诊断' },
];

interface PediatricRule {
  drugKeywords: string[];
  minAgeYears: number;
  label: string;
  evidence: string;
}

const PEDIATRIC_CONTRAINDICATIONS: PediatricRule[] = [
  {
    drugKeywords: ['沙星', '诺氟', '环丙', '左氧氟', '莫西沙星', '加替沙星', '氧氟沙星'],
    minAgeYears: 18,
    label: '喹诺酮类',
    evidence: '喹诺酮类影响软骨发育，18 岁以下禁用',
  },
  {
    drugKeywords: ['四环素', '多西环素', '米诺环素', '土霉素', '强力霉素'],
    minAgeYears: 8,
    label: '四环素类',
    evidence: '8 岁以下使用四环素类可致牙釉质发育不良',
  },
  {
    drugKeywords: ['阿司匹林', '乙酰水杨酸'],
    minAgeYears: 16,
    label: '阿司匹林',
    evidence: '16 岁以下儿童病毒感染时使用阿司匹林可诱发瑞氏综合征',
  },
];

// ---------- 工具函数 ----------

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function contains(haystack: string, needles: string[]): string | null {
  for (const needle of needles) {
    if (needle && haystack.includes(needle)) return needle;
  }
  return null;
}

function parseAgeYears(patient?: PatientInfo | null): number | null {
  if (!patient) return null;
  const raw = getPatientContextAgeText(patient);
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = normalizeText(raw);
  // 支持 "30岁"、"3 个月"、"6月"、"15"、"3周岁" 等
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:周?岁|y|year)/i);
  if (yearMatch) return Number(yearMatch[1]);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:个?月|m(?:onth)?)/i);
  if (monthMatch) return Number(monthMatch[1]) / 12;
  const dayMatch = text.match(/(\d+)\s*(?:天|日|d(?:ay)?)/i);
  if (dayMatch) return Number(dayMatch[1]) / 365;
  const pure = text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (pure) return Number(pure[1]);
  return null;
}

function normalizeSex(patient?: PatientInfo | null): '男' | '女' | null {
  if (!patient) return null;
  const raw = normalizeText(getPatientContextGenderText(patient)).trim();
  if (!raw) return null;
  if (raw.includes('男') || raw.toLowerCase() === 'm' || raw.toLowerCase() === 'male') return '男';
  if (raw.includes('女') || raw.toLowerCase() === 'f' || raw.toLowerCase() === 'female') return '女';
  return null;
}

function describeMedication(med: MedicationEntry): string {
  return [med.name, med.spec, med.dosage].filter(Boolean).join(' ');
}

// ---------- 规则实现 ----------

function ruleAllergyCrossClass(record: GeneratedRecord, patient: PatientInfo | null | undefined, alerts: RigidBlockAlert[]): void {
  const allergyText = normalizeText(getPatientContextAllergyHistory(patient)).trim();
  if (!allergyText) return;
  // 排除"无过敏史"等否定描述
  if (/^(无|否认|未发现|无过敏|无明显|none|nkda)/i.test(allergyText)) return;

  ANTIBIOTIC_CLASSES.forEach(cls => {
    const allergyHit = contains(allergyText, cls.allergyKeywords);
    if (!allergyHit) return;
    const conflicting: string[] = [];
    record.medications?.forEach(med => {
      const desc = describeMedication(med);
      if (contains(desc, cls.drugKeywords)) {
        conflicting.push(med.name);
      }
    });
    if (conflicting.length === 0) return;
    alerts.push({
      id: `rigid-allergy-${cls.classId}-${alerts.length}`,
      category: 'allergy_cross_class',
      severity: 'block',
      title: `过敏禁忌：${cls.classLabel}`,
      message: `患者过敏史涉及"${allergyHit}"，本次处方包含 ${cls.classLabel} 药物（${conflicting.join('、')}），存在严重过敏风险。`,
      relatedItems: conflicting,
      evidence: `过敏史命中关键词：${allergyHit}；冲突药物类别：${cls.classLabel}`,
    });
  });
}

function ruleDiagnosisGenderConflict(record: GeneratedRecord, patient: PatientInfo | null | undefined, alerts: RigidBlockAlert[]): void {
  const sex = normalizeSex(patient);
  if (!sex) return;
  const diagnoses = record.diagnosisList || [];
  if (diagnoses.length === 0) return;

  DIAGNOSIS_GENDER_CONFLICTS.forEach(conflict => {
    if (sex !== conflict.forbiddenSex) return;
    const hits: { diag: string; keyword: string }[] = [];
    diagnoses.forEach(d => {
      const k = contains(normalizeText(d.name), conflict.diagnosisKeywords);
      if (k) hits.push({ diag: d.name, keyword: k });
    });
    if (hits.length === 0) return;
    alerts.push({
      id: `rigid-gender-${conflict.forbiddenSex}-${alerts.length}`,
      category: 'diagnosis_gender_conflict',
      severity: 'block',
      title: '诊断与性别冲突',
      message: `患者为${sex}性，但诊断含"${hits.map(h => h.diag).join('、')}"（${conflict.label}），请核对患者身份或诊断名称。`,
      relatedItems: hits.map(h => h.diag),
      evidence: `命中关键词：${hits.map(h => h.keyword).join('、')}`,
    });
  });
}

function rulePediatricContraindication(record: GeneratedRecord, patient: PatientInfo | null | undefined, alerts: RigidBlockAlert[]): void {
  const ageYears = parseAgeYears(patient);
  if (ageYears == null) return;

  PEDIATRIC_CONTRAINDICATIONS.forEach(rule => {
    if (ageYears >= rule.minAgeYears) return;
    const hits: string[] = [];
    record.medications?.forEach(med => {
      const desc = describeMedication(med);
      if (contains(desc, rule.drugKeywords)) hits.push(med.name);
    });
    if (hits.length === 0) return;
    alerts.push({
      id: `rigid-pediatric-${rule.label}-${alerts.length}`,
      category: 'pediatric_contraindication',
      severity: 'block',
      title: `儿童禁用：${rule.label}`,
      message: `患者年龄约 ${ageYears.toFixed(1)} 岁，处方包含 ${rule.label}（${hits.join('、')}），低于安全使用年龄阈值（${rule.minAgeYears} 岁）。`,
      relatedItems: hits,
      evidence: rule.evidence,
    });
  });
}

function ruleDuplicateMedication(record: GeneratedRecord, _patient: PatientInfo | null | undefined, alerts: RigidBlockAlert[]): void {
  const meds = record.medications || [];
  if (meds.length < 2) return;

  // 1. 按通用名（去除规格）归一化后查重复
  const seen = new Map<string, string[]>();
  meds.forEach(med => {
    const key = normalizeText(med.name).trim();
    if (!key) return;
    const list = seen.get(key) || [];
    list.push(med.name);
    seen.set(key, list);
  });
  seen.forEach((list, key) => {
    if (list.length > 1) {
      alerts.push({
        id: `rigid-dup-name-${key}-${alerts.length}`,
        category: 'duplicate_medication',
        severity: 'warn',
        title: '同名药物重复',
        message: `处方中"${key}"出现 ${list.length} 次，请核对是否重复开具。`,
        relatedItems: list,
      });
    }
  });

  // 2. 同类抗生素双写检测
  ANTIBIOTIC_CLASSES.forEach(cls => {
    const matched: string[] = [];
    meds.forEach(med => {
      if (contains(describeMedication(med), cls.drugKeywords)) {
        matched.push(med.name);
      }
    });
    // 去重以免同名药物在两个规则里都报
    const unique = Array.from(new Set(matched));
    if (unique.length >= 2) {
      alerts.push({
        id: `rigid-dup-class-${cls.classId}-${alerts.length}`,
        category: 'duplicate_medication',
        severity: 'warn',
        title: `同类药物重复：${cls.classLabel}`,
        message: `处方包含多种 ${cls.classLabel} 药物（${unique.join('、')}），通常无需联用，请核对。`,
        relatedItems: unique,
      });
    }
  });
}

// ---------- 入口 ----------

const RULES: Array<(r: GeneratedRecord, p: PatientInfo | null | undefined, alerts: RigidBlockAlert[]) => void> = [
  ruleAllergyCrossClass,
  ruleDiagnosisGenderConflict,
  rulePediatricContraindication,
  ruleDuplicateMedication,
];

export function evaluateRigidSafetyRules(
  record: GeneratedRecord | null | undefined,
  patient?: PatientInfo | null,
): RigidBlockAlert[] {
  if (!record) return [];
  const alerts: RigidBlockAlert[] = [];
  for (const rule of RULES) {
    try {
      rule(record, patient, alerts);
    } catch (err) {
      // 单条规则失败不影响其他规则
      console.warn('[safetyRules] rule failed:', err);
    }
  }
  return alerts;
}

// 暴露给测试或调试
export const __internal = {
  ANTIBIOTIC_CLASSES,
  DIAGNOSIS_GENDER_CONFLICTS,
  PEDIATRIC_CONTRAINDICATIONS,
  parseAgeYears,
  normalizeSex,
};
