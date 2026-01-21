import { chat, type ChatMessage } from './llm';

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
  const prompt = buildDiagnosisCheckPrompt(context);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位专业的医疗事实核查员。你的任务是检查诊断建议是否符合医学规范和临床实践。

你需要检查以下方面：
1. 诊断名称是否规范（符合 ICD-10 标准）
2. 诊断是否与症状相符
3. 是否存在明显的逻辑错误
4. 是否有潜在的诊断风险
5. 优先判断诊断是否有明显错误，无明显事实性错误可考虑不提示

请以 JSON 格式返回检查结果，格式如下：
{
  "hasIssues": true/false,
  "issues": [
    {
      "severity": "high/medium/low",
      "content": "有问题的诊断名称",
      "issue": "问题描述",
      "suggestion": "修正建议（可选）"
    }
  ]
}

如果没有发现问题，返回 { "hasIssues": false, "issues": [] }`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await chat(messages);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    const result = JSON.parse(targetJson);

    // 为每个 issue 添加 id 和 type
    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `diagnosis-${Date.now()}-${index}`,
      type: 'diagnosis' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content,
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues,
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
  const prompt = buildMedicineCheckPrompt(context);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位专业的临床药师，负责审核药物使用的合理性。

你需要检查以下方面：
1. 药物名称是否规范
2. 剂量是否合理（是否超出常规范围）
3. 用法用量是否符合药典标准
4. 是否与诊断相符
5. 是否存在明显的用药风险

请以 JSON 格式返回检查结果，格式如下：
{
  "hasIssues": true/false,
  "issues": [
    {
      "severity": "high/medium/low",
      "content": "有问题的药物信息",
      "issue": "问题描述",
      "suggestion": "修正建议（可选）"
    }
  ]
}

如果没有发现问题，返回 { "hasIssues": false, "issues": [] }`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await chat(messages);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    const result = JSON.parse(targetJson);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `medicine-${Date.now()}-${index}`,
      type: 'medicine' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content,
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues,
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
  const prompt = buildExaminationCheckPrompt(context);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位专业的临床检验专家，负责审核检查项目的合理性。

你需要检查以下方面：
1. 检查项目名称是否规范
2. 检查项目是否与诊断相关
3. 是否存在重复或不必要的检查
4. 是否遗漏了必要的检查

请以 JSON 格式返回检查结果，格式如下：
{
  "hasIssues": true/false,
  "issues": [
    {
      "severity": "high/medium/low",
      "content": "有问题的检查项目",
      "issue": "问题描述",
      "suggestion": "修正建议（可选）"
    }
  ]
}

如果没有发现问题，返回 { "hasIssues": false, "issues": [] }`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await chat(messages);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    const result = JSON.parse(targetJson);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `examination-${Date.now()}-${index}`,
      type: 'examination' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content,
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues,
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
  const prompt = buildMedicalRecordCheckPrompt(context);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位经验丰富的主治医师，负责审核病历记录的完整性和一致性。

你需要检查以下方面：
1. 主诉、现病史、诊断之间是否逻辑一致
2. 药物、检查项目是否与诊断相符
3. 病历书写是否规范
4. 是否存在明显的医疗风险

请以 JSON 格式返回检查结果，格式如下：
{
  "hasIssues": true/false,
  "issues": [
    {
      "severity": "high/medium/low",
      "content": "有问题的内容",
      "issue": "问题描述",
      "suggestion": "修正建议（可选）"
    }
  ]
}

如果没有发现问题，返回 { "hasIssues": false, "issues": [] }`
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    const response = await chat(messages);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    const result = JSON.parse(targetJson);

    const issues: FactCheckIssue[] = result.issues.map((issue: any, index: number) => ({
      id: `record-${Date.now()}-${index}`,
      type: 'medical_record' as FactCheckType,
      severity: issue.severity || 'medium',
      content: issue.content,
      issue: issue.issue,
      suggestion: issue.suggestion
    }));

    return {
      hasIssues: result.hasIssues,
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

// Helper functions to build prompts

function buildDiagnosisCheckPrompt(context: DiagnosisCheckContext): string {
  let prompt = `请检查以下诊断是否合理：\n\n`;
  prompt += `诊断：${context.diagnosis}\n`;

  if (context.chiefComplaint) {
    prompt += `主诉：${context.chiefComplaint}\n`;
  }

  if (context.historyOfPresentIllness) {
    prompt += `现病史：${context.historyOfPresentIllness}\n`;
  }

  if (context.symptoms && context.symptoms.length > 0) {
    prompt += `症状：${context.symptoms.join('、')}\n`;
  }

  return prompt;
}

function buildMedicineCheckPrompt(context: MedicineCheckContext): string {
  let prompt = `请检查以下药物使用是否合理：\n\n`;
  prompt += `药物名称：${context.medicineName}\n`;

  if (context.specification) {
    prompt += `规格：${context.specification}\n`;
  }

  if (context.dosage) {
    prompt += `用量：${context.dosage}\n`;
  }

  if (context.frequency) {
    prompt += `用法：${context.frequency}\n`;
  }

  if (context.diagnosis) {
    prompt += `诊断：${context.diagnosis}\n`;
  }

  return prompt;
}

function buildExaminationCheckPrompt(context: ExaminationCheckContext): string {
  let prompt = `请检查以下检查项目是否合理：\n\n`;
  prompt += `检查项目：${context.examinationName}\n`;

  if (context.category) {
    prompt += `类别：${context.category}\n`;
  }

  if (context.diagnosis) {
    prompt += `诊断：${context.diagnosis}\n`;
  }

  if (context.symptoms && context.symptoms.length > 0) {
    prompt += `症状：${context.symptoms.join('、')}\n`;
  }

  return prompt;
}

function buildMedicalRecordCheckPrompt(context: MedicalRecordCheckContext): string {
  let prompt = `请检查以下病历记录是否完整、一致、合理：\n\n`;

  if (context.chiefComplaint) {
    prompt += `主诉：${context.chiefComplaint}\n`;
  }

  if (context.historyOfPresentIllness) {
    prompt += `现病史：${context.historyOfPresentIllness}\n`;
  }

  if (context.diagnoses && context.diagnoses.length > 0) {
    prompt += `诊断：${context.diagnoses.join('、')}\n`;
  }

  if (context.medicines && context.medicines.length > 0) {
    prompt += `药物：${context.medicines.join('、')}\n`;
  }

  if (context.examinations && context.examinations.length > 0) {
    prompt += `检查：${context.examinations.join('、')}\n`;
  }

  return prompt;
}
