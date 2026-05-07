import { chat, getReviewerLLMConfig, type ChatMessage } from './llm';
import { isRegionalMode, getCachedBootstrap } from './regionalClient';
import {
  DiagnosisCheckPrompt,
  MedicineCheckPrompt,
  ExaminationCheckPrompt,
  MedicalRecordCheckPrompt,
  TCMDiagnosisCheckPrompt,
  TCMMedicineCheckPrompt,
  VoiceSafetyReviewPrompt
} from '../prompts';
import type {
  VoiceSafetyIssue,
  VoiceSafetyIssueCategory,
  VoiceSafetyIssueSeverity,
  VoiceSafetyReviewContext,
  VoiceSafetyReviewResult,
} from '../types/voiceResult';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextGenderText,
  getPatientContextName,
  getPatientContextPastMedicalHistory,
} from '../utils/patientContext';

/**
 * 检查独立审查 AI 是否已启用
 */
export function isReviewerEnabled(): boolean {
  // 区域化模式下由后端控制
  if (isRegionalMode()) {
    const bootstrap = getCachedBootstrap();
    return bootstrap?.reviewer?.enabled ?? false;
  }
  const saved = localStorage.getItem('REVIEWER_ENABLED');
  // 默认启用；仅当明确设置为 'false' 时禁用
  return saved === null || saved === 'true';
}

export type FactCheckType = 'diagnosis' | 'medicine' | 'examination' | 'medical_record';

export interface FactCheckIssue {
  id: string;
  type: FactCheckType;
  severity: 'high' | 'medium' | 'low';
  content: string; // 有问题的原文内容
  issue: string; // 问题描述
  suggestion?: string; // 修正建议
  startIndex?: number; // 在原文中的起始位置
  endIndex?: number; // 在原文中的结束位置
}

export interface FactCheckResult {
  hasIssues: boolean;
  issues: FactCheckIssue[];
  checkedAt: number;
}

// Helper function to parse AI response
const parseFactCheckResponse = (response: string): { hasIssues: boolean; issues: any[] } => {
  try {
    // Remove markdown code blocks
    let cleanJson = response.replace(/```json\n?|\n?```|```\n?/g, '').trim();

    // Try to extract JSON object
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    const result = JSON.parse(targetJson);

    // Validate response structure
    if (typeof result.hasIssues !== 'boolean') {
      console.warn('Invalid hasIssues field, defaulting to false');
      return { hasIssues: false, issues: [] };
    }

    // Ensure issues is an array
    if (!Array.isArray(result.issues)) {
      console.warn('Invalid issues field, defaulting to empty array');
      return { hasIssues: false, issues: [] };
    }

    // Filter out invalid issues
    const validIssues = result.issues.filter((issue: any) => {
      return issue && typeof issue.issue === 'string' && issue.issue.trim().length > 0;
    });

    return {
      hasIssues: validIssues.length > 0,
      issues: validIssues
    };
  } catch (e) {
    console.error('Failed to parse fact check response:', e, 'Response:', response);
    return { hasIssues: false, issues: [] };
  }
};

function buildReviewerTraceConfig(
  operationAction: string,
  title: string,
  scene: string,
  sourceModule = 'fact_checker'
) {
  return {
    ...getReviewerLLMConfig(),
    traceContext: {
      scene,
      sourceModule,
      operationModule: 'reviewer',
      operationAction,
      title,
    },
  };
}


export interface DiagnosisCheckContext {
  diagnosis: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  symptoms?: string[];
}

export interface MedicineCheckContext {
  medicineName: string;
  specification?: string;
  dosage?: string;
  frequency?: string;
  diagnosis?: string;
}

export interface ExaminationCheckContext {
  examinationName: string;
  category?: string;
  diagnosis?: string;
  symptoms?: string[];
}

export interface MedicalRecordCheckContext {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  diagnoses?: string[];
  medicines?: string[];
  examinations?: string[];
}

export interface TCMDiagnosisCheckContext {
  diagnosis: string; // 病名-证型
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  tcmFourExaminations?: string; // 四诊信息
}

export interface TCMMedicineCheckContext {
  medicineName: string; // 方剂名称
  ingredients?: string; // 组成（含剂量）
  usage?: string; // 煎服法
  diagnosis?: string; // 病名-证型
}

function normalizeVoiceSafetySeverity(value: unknown): VoiceSafetyIssueSeverity {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeVoiceSafetyCategory(value: unknown): VoiceSafetyIssueCategory {
  const validCategories: VoiceSafetyIssueCategory[] = [
    'drug_interaction',
    'contraindication',
    'red_flag',
    'allergy',
    'missing_check',
    'diagnosis_treatment_mismatch',
    'other',
  ];
  return typeof value === 'string' && validCategories.includes(value as VoiceSafetyIssueCategory)
    ? value as VoiceSafetyIssueCategory
    : 'other';
}

function buildPatientSummary(context: VoiceSafetyReviewContext): string {
  const patient = context.patientInfo;
  if (!patient) return '未提供';

  const parts = [
    getPatientContextName(patient),
    getPatientContextGenderText(patient),
    getPatientContextAgeText(patient),
  ]
    .filter(value => value !== undefined && value !== null && String(value).trim().length > 0)
    .map(String);

  return parts.length ? parts.join('，') : '未提供';
}

function normalizeVoiceSafetyIssues(issues: any[], checkedAt: number): VoiceSafetyIssue[] {
  return issues
    .filter(issue => issue && typeof issue.message === 'string' && issue.message.trim().length > 0)
    .map((issue, index) => ({
      id: `voice-safety-${checkedAt}-${index}`,
      severity: normalizeVoiceSafetySeverity(issue.severity),
      category: normalizeVoiceSafetyCategory(issue.category),
      title: typeof issue.title === 'string' && issue.title.trim() ? issue.title.trim() : '安全提醒',
      message: issue.message.trim().startsWith('提醒') ? issue.message.trim() : `提醒：${issue.message.trim()}`,
      suggestion: typeof issue.suggestion === 'string' ? issue.suggestion.trim() : undefined,
      relatedItems: Array.isArray(issue.relatedItems)
        ? issue.relatedItems.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
        : [],
      evidence: typeof issue.evidence === 'string' ? issue.evidence.trim() : undefined,
      acknowledged: false,
      dismissed: false,
    }));
}

function isPlaceholderHistory(value?: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(无|无特殊|否认|未提供|未述及|未见特殊|无异常)$/.test(trimmed);
}

/**
 * 从 pastMedicalHistory / allergyHistory 文本中抽取过敏相关片段，
 * 防御 LLM 在病例抽取时把患者基础档案里的过敏信息丢失/简化为"无特殊"。
 */
function extractAllergySnippets(text?: string | null): string[] {
  if (!text) return [];
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const segments = normalized.split(/[,，;；。]/).map(s => s.trim()).filter(Boolean);
  return segments.filter(s => /过敏|皮试阳性|不耐受/.test(s));
}

function buildSafetyAllergyContext(context: VoiceSafetyReviewContext): string | undefined {
  const patientAllergy = getPatientContextAllergyHistory(context.patientInfo);
  const direct = context.allergyHistory || patientAllergy;
  const snippets: string[] = [];
  if (direct && !isPlaceholderHistory(direct)) snippets.push(direct.trim());
  // 兜底：从 record / patientInfo 的 pastMedicalHistory 中抽取"X过敏"关键片段
  const recordPmh = typeof context.record.pastMedicalHistory === 'string' ? context.record.pastMedicalHistory : undefined;
  const patientPmh = getPatientContextPastMedicalHistory(context.patientInfo);
  for (const candidate of [recordPmh, patientPmh]) {
    snippets.push(...extractAllergySnippets(candidate));
  }
  const merged = Array.from(new Set(snippets.map(s => s.trim()).filter(Boolean)));
  return merged.length ? merged.join('；') : undefined;
}

function buildSafetyPastMedicalHistory(context: VoiceSafetyReviewContext): string | undefined {
  const recordHistory = typeof context.record.pastMedicalHistory === 'string' ? context.record.pastMedicalHistory : undefined;
  if (recordHistory && !isPlaceholderHistory(recordHistory)) return recordHistory;
  const patientHistory = getPatientContextPastMedicalHistory(context.patientInfo);
  if (patientHistory && !isPlaceholderHistory(patientHistory)) return patientHistory;
  return recordHistory || patientHistory || undefined;
}

export async function checkVoiceSafetyReview(context: VoiceSafetyReviewContext): Promise<VoiceSafetyReviewResult> {
  const checkedAt = Date.now();
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt };
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: VoiceSafetyReviewPrompt.system,
    },
    {
      role: 'user',
      content: VoiceSafetyReviewPrompt.buildUserPrompt({
        patientSummary: buildPatientSummary(context),
        chiefComplaint: context.record.chiefComplaint,
        historyOfPresentIllness: context.record.historyOfPresentIllness,
        pastMedicalHistory: buildSafetyPastMedicalHistory(context),
        allergyHistory: buildSafetyAllergyContext(context),
        diagnoses: context.record.diagnosisList?.map(diagnosis => diagnosis.name) || [],
        medicines: context.record.medications?.map(medicine => [medicine.name, medicine.spec, medicine.dosage, medicine.frequency, medicine.usage].filter(Boolean).join(' ')) || [],
        examinations: context.record.examinations?.map(examination => examination.name) || [],
        labTests: context.record.labTests?.map(labTest => labTest.name) || [],
        procedures: context.record.procedures?.map(procedure => procedure.name) || [],
        recentMedications: context.recentMedications || [],
      }),
    },
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('review_voice_safety', '审查语音问诊安全风险', 'reviewer-voice-safety', 'voice_safety_reviewer')
    );
    const result = parseFactCheckResponse(response);
    const issues = normalizeVoiceSafetyIssues(result.issues, checkedAt);

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt,
    };
  } catch (error) {
    console.error('Voice safety review failed:', error);
    return { hasIssues: false, issues: [], checkedAt };
  }
}

/**
 * 检查诊断是否合理
 */
export async function checkDiagnosis(context: DiagnosisCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: DiagnosisCheckPrompt.system
    },
    {
      role: 'user',
      content: DiagnosisCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_diagnosis', '审查诊断合理性', 'reviewer-diagnosis-check', 'diagnosis_reviewer')
    );
    const result = parseFactCheckResponse(response);

    // 为每个 issue 添加 id 和 type
    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `diagnosis-${Date.now()}-${index}`,
      type: 'diagnosis' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('Diagnosis fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}

/**
 * 检查药物使用是否合理
 */
export async function checkMedicine(context: MedicineCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: MedicineCheckPrompt.system
    },
    {
      role: 'user',
      content: MedicineCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_medicine', '审查用药合理性', 'reviewer-medicine-check', 'medicine_reviewer')
    );
    const result = parseFactCheckResponse(response);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `medicine-${Date.now()}-${index}`,
      type: 'medicine' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('Medicine fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}

/**
 * 检查检查项目是否合理
 */
export async function checkExamination(context: ExaminationCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: ExaminationCheckPrompt.system
    },
    {
      role: 'user',
      content: ExaminationCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_examination', '审查检查合理性', 'reviewer-examination-check', 'examination_reviewer')
    );
    const result = parseFactCheckResponse(response);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `examination-${Date.now()}-${index}`,
      type: 'examination' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('Examination fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}

/**
 * 检查整个病历记录的一致性和合理性
 */
export async function checkMedicalRecord(context: MedicalRecordCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: MedicalRecordCheckPrompt.system
    },
    {
      role: 'user',
      content: MedicalRecordCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_medical_record', '审查病历一致性', 'reviewer-medical-record-check', 'medical_record_reviewer')
    );
    const result = parseFactCheckResponse(response);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `record-${Date.now()}-${index}`,
      type: 'medical_record' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('Medical record fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}

/**
 * 检查中医诊断（病名-证型）是否合理
 */
export async function checkTCMDiagnosis(context: TCMDiagnosisCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: TCMDiagnosisCheckPrompt.system
    },
    {
      role: 'user',
      content: TCMDiagnosisCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_tcm_diagnosis', '审查中医诊断合理性', 'reviewer-tcm-diagnosis-check', 'tcm_diagnosis_reviewer')
    );
    const result = parseFactCheckResponse(response);

    // 为每个 issue 添加 id 和 type
    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `tcm-diagnosis-${Date.now()}-${index}`,
      type: 'diagnosis' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('TCM diagnosis fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}

/**
 * 检查中药方剂使用是否合理
 */
export async function checkTCMMedicine(context: TCMMedicineCheckContext): Promise<FactCheckResult> {
  if (!isReviewerEnabled()) {
    return { hasIssues: false, issues: [], checkedAt: Date.now() };
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: TCMMedicineCheckPrompt.system
    },
    {
      role: 'user',
      content: TCMMedicineCheckPrompt.buildUserPrompt(context)
    }
  ];

  try {
    const response = await chat(
      messages,
      undefined,
      undefined,
      undefined,
      buildReviewerTraceConfig('check_tcm_medicine', '审查中药方剂合理性', 'reviewer-tcm-medicine-check', 'tcm_medicine_reviewer')
    );
    const result = parseFactCheckResponse(response);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `tcm-medicine-${Date.now()}-${index}`,
      type: 'medicine' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content || '',
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues && issues.length > 0,
      issues,
      checkedAt: Date.now()
    };
  } catch (e) {
    console.error('TCM medicine fact check failed:', e);
    return {
      hasIssues: false,
      issues: [],
      checkedAt: Date.now()
    };
  }
}
