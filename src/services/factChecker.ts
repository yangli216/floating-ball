import { chat, type ChatMessage } from './llm';
import {
  DiagnosisCheckPrompt,
  MedicineCheckPrompt,
  ExaminationCheckPrompt,
  MedicalRecordCheckPrompt
} from '../prompts/prompts';

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

/**
 * 检查诊断是否合理
 */
export async function checkDiagnosis(context: DiagnosisCheckContext): Promise<FactCheckResult> {
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
    const response = await chat(messages);
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
    const response = await chat(messages);
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
    const response = await chat(messages);
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
    const response = await chat(messages);
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
