import { PROMPTS } from '../prompts';
import { chat, type ChatMessage } from './llm';
import { medicalDataService } from './medicalData';
import type { AppPatient } from '../types/appState';
import type { ConsultationSessionDraft } from '../stores/consultationSession';
import type { Diagnosis, TreatmentRecommendation } from '../types/consultation';

export interface SessionContext {
  patientName: string;
  gender: string;
  age: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  allergyHistory: string;
}

export interface SessionRecordDraft {
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export type SessionDiagnosisSuggestion = Diagnosis;

export interface SessionDifferentialChecklist {
  isNeeded: boolean;
  items: Array<{
    question: string;
    recordText: string;
  }>;
}

export type SessionTreatmentSuggestion = TreatmentRecommendation;

export interface SessionReminders {
  urgent: string[];
  normal: string[];
}

export interface SessionWritebackResult {
  consultationId: string;
  timestamp: number;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  diagnosisList: Array<{
    name: string;
    code?: string;
  }>;
  medications: Array<{
    name: string;
    usage?: string;
  }>;
  examinations: Array<{
    name: string;
  }>;
  reminders?: Array<{
    level: 'urgent' | 'normal';
    content: string;
  }>;
  treatmentPlan: string;
  medicalSummary: string;
}

function readPatientText(patient: AppPatient | null | undefined, keys: string[]): string {
  if (!patient) {
    return '';
  }

  for (const key of keys) {
    const value = patient[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return '';
}

function cleanJsonEnvelope(response: string): string {
  return response.replace(/```json\n?|\n?```|```\n?/g, '').trim();
}

function extractJsonArray<T>(response: string): T[] {
  const clean = cleanJsonEnvelope(response);
  const match = clean.match(/\[[\s\S]*\]/);
  const target = match ? match[0] : clean;
  return JSON.parse(target);
}

function extractJsonObject<T>(response: string): T {
  const clean = cleanJsonEnvelope(response);
  const match = clean.match(/\{[\s\S]*\}/);
  const target = match ? match[0] : clean;
  return JSON.parse(target);
}

function buildFallbackDiagnoses(context: SessionContext): SessionDiagnosisSuggestion[] {
  const complaint = context.chiefComplaint;

  if (context.allergyHistory.includes('青霉素') || complaint.includes('皮疹') || complaint.includes('瘙痒')) {
    return [
      {
        code: 'L50.900',
        name: '荨麻疹',
        rate: '84%',
        rationale: '皮疹、瘙痒和明确诱因提示急性过敏反应，基层门诊优先考虑荨麻疹相关诊断。',
      },
      {
        code: 'T78.400',
        name: '过敏反应',
        rate: '72%',
        rationale: '若伴胸闷、呼吸不适或喉头紧缩，应及时抬高风险等级并继续排查。',
      },
    ];
  }

  if (complaint.includes('发热') || complaint.includes('流涕') || complaint.includes('轻咳')) {
    return [
      {
        code: 'J06.900',
        name: '急性上呼吸道感染',
        rate: '82%',
        rationale: '发热、流涕和轻咳更符合上呼吸道感染表现，且符合基层常见病优先原则。',
      },
      {
        code: 'J11.100',
        name: '流行性感冒',
        rate: '67%',
        rationale: '若高热明显或存在流行病学接触史，需要提高流感相关诊断优先级。',
      },
    ];
  }

  return [
    {
      code: 'J44.100',
      name: '慢性阻塞性肺疾病急性加重',
      rate: '86%',
      rationale: '咳痰增多、气促加重且有慢病背景时，基层首选考虑慢阻肺急性加重。',
    },
    {
      code: 'J20.900',
      name: '急性支气管炎',
      rate: '68%',
      rationale: '若慢病基础不明确，可作为次级候选诊断。',
    },
  ];
}

function buildFallbackDifferential(context: SessionContext, diagnosisName: string): SessionDifferentialChecklist {
  const urgentItem = context.chiefComplaint.includes('胸闷')
    ? [{
        question: '确认无明显喘鸣、喉头紧缩或低血压表现（排除严重过敏反应）',
        recordText: '无明显喘鸣，无喉头紧缩感，生命体征暂平稳。',
      }]
    : [{
        question: `确认无与“${diagnosisName}”不符的红旗症状（如持续高热、意识障碍、明显低氧）`,
        recordText: '暂未见明显红旗症状。',
      }];

  return {
    isNeeded: true,
    items: urgentItem,
  };
}

function buildFallbackTreatments(diagnosisName: string): SessionTreatmentSuggestion[] {
  if (diagnosisName.includes('荨麻疹') || diagnosisName.includes('过敏')) {
    return [
      {
        type: 'medicine',
        name: '氯雷他定片',
        reason: '基层常用抗过敏药物，便于门诊短程处理。',
        usage: '10mg，口服，每日1次',
      },
      {
        type: 'exam',
        name: '生命体征连续监测',
        reason: '便于及时识别向严重过敏反应进展的风险。',
      },
    ];
  }

  if (diagnosisName.includes('上呼吸道')) {
    return [
      {
        type: 'medicine',
        name: '对乙酰氨基酚',
        reason: '用于发热对症处理，基层可及性高。',
        usage: '按年龄和体重规范使用',
      },
      {
        type: 'exam',
        name: '血常规',
        reason: '必要时辅助判断感染性质。',
      },
    ];
  }

  return [
    {
      type: 'medicine',
      name: '氨溴索',
      reason: '基层常见祛痰方案，可改善咳痰症状。',
      usage: '30mg，口服，每日3次',
    },
    {
      type: 'exam',
      name: '胸部X线片',
      reason: '用于区分感染性病变和慢阻肺相关加重表现。',
    },
  ];
}

export function buildSessionContext(patient: AppPatient | null | undefined): SessionContext {
  return {
    patientName: readPatientText(patient, ['naPi', 'name', 'patientName']) || '未知患者',
    gender: readPatientText(patient, ['sdSexText', 'gender']) || '未知性别',
    age: readPatientText(patient, ['ageText', 'age']) || '未知年龄',
    chiefComplaint: readPatientText(patient, ['chiefComplaint', 'chief_complaint']) || '尚未填写主诉',
    historyOfPresentIllness: readPatientText(
      patient,
      ['historyOfPresentIllness', 'history_of_present_illness']
    ) || '尚未填写现病史',
    allergyHistory: readPatientText(patient, ['allergyHistory']) || '未提供过敏史',
  };
}

export function buildRecordDraft(context: SessionContext): SessionRecordDraft {
  return {
    chiefComplaint: context.chiefComplaint,
    historyOfPresentIllness: context.historyOfPresentIllness,
  };
}

export async function generateDiagnosisSuggestions(
  context: SessionContext
): Promise<SessionDiagnosisSuggestion[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.consultation.diagnosisRecommendation.system,
    },
    {
      role: 'user',
      content: PROMPTS.consultation.diagnosisRecommendation.buildUserPrompt({
        patientName: context.patientName,
        gender: context.gender,
        age: context.age,
        chiefComplaint: context.chiefComplaint,
        historyOfPresentIllness: context.historyOfPresentIllness,
      }),
    },
  ];

  try {
    const response = await chat(messages);
    const parsed = extractJsonArray<Array<Record<string, string>>[number]>(response);
    let diagnoses: SessionDiagnosisSuggestion[] = parsed.map((item) => {
      let matched = medicalDataService.matchDiagnosis(item.code || '');
      if (!matched) {
        matched = medicalDataService.matchDiagnosis(item.name || '');
      }

      if (matched) {
        return {
          id: matched.id,
          code: matched.code,
          name: matched.name,
          rate: item.rate || '70%',
          rationale: item.rationale || '未返回诊断依据',
        };
      }

      return {
        id: undefined,
        code: item.code || '',
        name: item.name || '未命名诊断',
        rate: item.rate || '70%',
        rationale: item.rationale || '未返回诊断依据',
      };
    });

    diagnoses.sort((a, b) => {
      const rateA = Number.parseFloat((a.rate || '').replace('%', '')) || 0;
      const rateB = Number.parseFloat((b.rate || '').replace('%', '')) || 0;
      return rateB - rateA;
    });

    const timestamp = Date.now();
    return diagnoses.slice(0, 5).map((diagnosis, index) => ({
      ...diagnosis,
      id: diagnosis.id || `session-diagnosis-${timestamp}-${index}`,
    }));
  } catch (error) {
    console.error('[consultationSession] generateDiagnosisSuggestions failed:', error);
    return buildFallbackDiagnoses(context).map((diagnosis, index) => ({
      ...diagnosis,
      id: diagnosis.id || `session-diagnosis-fallback-${Date.now()}-${index}`,
    }));
  }
}

export async function generateDifferentialChecklist(
  context: SessionContext,
  diagnosisName: string
): Promise<SessionDifferentialChecklist> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.consultation.diagnosisChecklist.system,
    },
    {
      role: 'user',
      content: PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
        diagnosisName,
        chiefComplaint: context.chiefComplaint,
        historyOfPresentIllness: context.historyOfPresentIllness,
      }),
    },
  ];

  try {
    const response = await chat(messages);
    const parsed = extractJsonObject<SessionDifferentialChecklist>(response);
    if (parsed.isNeeded) {
      return parsed;
    }
    return {
      isNeeded: false,
      items: [],
    };
  } catch (error) {
    console.error('[consultationSession] generateDifferentialChecklist failed:', error);
    return buildFallbackDifferential(context, diagnosisName);
  }
}

export async function generateTreatmentSuggestions(
  context: SessionContext,
  diagnosis: SessionDiagnosisSuggestion
): Promise<SessionTreatmentSuggestion[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.consultation.treatmentRecommendation.system,
    },
    {
      role: 'user',
      content: PROMPTS.consultation.treatmentRecommendation.buildUserPrompt({
        patientName: context.patientName,
        gender: context.gender,
        age: context.age,
        diagnosisName: diagnosis.name,
        diagnosisCode: diagnosis.code || '待补充编码',
        chiefComplaint: context.chiefComplaint,
      }),
    },
  ];

  try {
    const response = await chat(messages);
    const parsed = extractJsonArray<Array<Record<string, string>>[number]>(response);
    return parsed.slice(0, 8).map((item) => {
      let matchedItem = null;
      if (item.type === 'medicine') {
        matchedItem = medicalDataService.matchMedicine(item.name || '');
      } else if (item.type === 'exam') {
        matchedItem = medicalDataService.matchItem(item.name || '');
      }

      return {
        type: item.type === 'exam' ? 'exam' : 'medicine',
        name: item.name || '未命名项目',
        reason: item.reason || '未返回推荐原因',
        usage: item.usage || '',
        matchedItem,
        selected: false,
      };
    });
  } catch (error) {
    console.error('[consultationSession] generateTreatmentSuggestions failed:', error);
    return buildFallbackTreatments(diagnosis.name).map((item) => ({
      ...item,
      matchedItem:
        item.type === 'medicine'
          ? medicalDataService.matchMedicine(item.name)
          : medicalDataService.matchItem(item.name),
      selected: false,
    }));
  }
}

export function buildSessionReminders(context: SessionContext): SessionReminders {
  const urgent: string[] = [];
  const normal: string[] = [];

  if (context.allergyHistory.includes('青霉素')) {
    urgent.push('存在明确药物过敏史，相关推荐用药必须由医生再次确认。');
  }

  if (context.chiefComplaint.includes('胸闷') || context.historyOfPresentIllness.includes('呼吸')) {
    urgent.push('当前症状涉及呼吸风险，建议先查看风险提醒与生命体征。');
  }

  normal.push('若要补充结构化症状属性，请进入完整症状问诊。');
  normal.push('AI 推荐只作为草稿，最终诊断和用药决定权仍归医生。');

  return { urgent, normal };
}

export function buildSessionWritebackResult(
  patient: AppPatient | null | undefined,
  draft: ConsultationSessionDraft
): SessionWritebackResult {
  const consultationId =
    readPatientText(patient, ['idPi', 'patientId', 'id']) || `session-${Date.now()}`;
  const pastMedicalHistory =
    readPatientText(patient, ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText']) ||
    '未提供既往病史。';

  const treatmentPlanParts: string[] = [];
  if (draft.medications.length > 0) {
    treatmentPlanParts.push(`建议用药：${draft.medications.map((item) => item.name).join('；')}`);
  }
  if (draft.examinations.length > 0) {
    treatmentPlanParts.push(`建议检查：${draft.examinations.map((item) => item.name).join('；')}`);
  }
  const urgentReminders = draft.reminders
    .filter((item) => item.level === 'urgent')
    .map((item) => item.content);
  if (urgentReminders.length > 0) {
    treatmentPlanParts.push(`重点提醒：${urgentReminders.join('；')}`);
  }
  if (treatmentPlanParts.length === 0) {
    treatmentPlanParts.push('建议结合医生站规则完成最终确认。');
  }

  const summaryParts = [
    `主诉：${draft.chiefComplaint || '未填写'}`,
    `现病史：${draft.historyOfPresentIllness || '未填写'}`,
  ];

  if (draft.diagnoses.length > 0) {
    summaryParts.push(`诊断：${draft.diagnoses.map((item) => item.name).join('；')}`);
  }
  if (draft.reminders.length > 0) {
    summaryParts.push(`提醒：${draft.reminders.map((item) => item.content).join('；')}`);
  }

  return {
    consultationId,
    timestamp: Date.now(),
    chiefComplaint: draft.chiefComplaint,
    historyOfPresentIllness: draft.historyOfPresentIllness,
    pastMedicalHistory,
    diagnosisList: draft.diagnoses.map((item) => ({
      name: item.name,
      code: item.code,
    })),
    medications: draft.medications.map((item) => ({
      name: item.name,
      usage: item.usage,
    })),
    examinations: draft.examinations.map((item) => ({
      name: item.name,
    })),
    reminders: draft.reminders.length > 0 ? draft.reminders : undefined,
    treatmentPlan: treatmentPlanParts.join('；'),
    medicalSummary: summaryParts.join('\n'),
  };
}
