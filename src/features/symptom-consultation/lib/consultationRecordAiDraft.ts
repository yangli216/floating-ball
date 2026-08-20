import type { ChatMessage, LLMConfigOverride } from '@services/llm';
import { normalizeGeneratedClinicalRecordNarrative } from '@features/clinical-result/clinicalRecordNarrativeQuality';
import type { ConsultationGeneratedRecordDraft } from './consultationGeneratedRecord';

export type ConsultationRecordAiDraftMode = 'western' | 'tcm';

export interface ConsultationRecordAiDraftSymptom {
  key: string;
  name: string;
  config?: {
    sections?: ConsultationRecordAiDraftSection[];
  };
}

export interface ConsultationRecordAiDraftSection {
  title?: string;
  fields?: ConsultationRecordAiDraftField[];
}

export interface ConsultationRecordAiDraftField {
  label?: string;
  storageKey?: string;
  key?: string;
  type?: string;
}

export interface ConsultationRecordAiDraftPatientProfile {
  patientName?: string;
  gender?: string;
  age?: string;
}

export interface BuildConsultationRecordAiDraftMessagesInput<TSymptom extends ConsultationRecordAiDraftSymptom> {
  selectedSymptoms: TSymptom[];
  formData: Record<string, Record<string, unknown> | undefined>;
  mode: ConsultationRecordAiDraftMode;
  patientProfile?: ConsultationRecordAiDraftPatientProfile;
  companionSymptomNames?: string[];
  localFallbackDraft: Pick<ConsultationGeneratedRecordDraft, 'chiefComplaint' | 'historyOfPresentIllness'>;
  generalConditionText?: string;
  tcmFourExaminationsText?: string;
}

export interface ConsultationRecordAiDraftRequestSpec {
  messages: ChatMessage[];
  config: LLMConfigOverride;
}

export interface ConsultationRecordAiDraftOutput {
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

interface SymptomFieldSummary {
  label: string;
  value: string;
}

interface SymptomSummary {
  name: string;
  fields: SymptomFieldSummary[];
}

const SYSTEM_PROMPT = [
  '你是基层全科门诊医生的病历草稿助手。',
  '任务：根据结构化问诊表单，生成可直接给医生编辑的门诊“主诉”和“现病史”。',
  '写作风格参考基层医生个人模板：短、直接、门诊可用，不写教科书式长篇分析。',
  '必须严格依据输入，不得编造未提供的症状、检查、诊断、用药或体征。',
  '只输出 JSON，不要输出 Markdown、解释、免责声明或多余文字。',
].join('\n');

const USER_INSTRUCTIONS = [
  '生成要求：',
  '1. 主诉要短，只写“主要症状/体征/检查异常/慢病复诊理由 + 时间”，不要写诱因、治疗经过或大量阴性症状。',
  '2. 现病史按基层门诊模板风格组织：起病时间、诱因、主要表现、伴随症状、关键阴性、一般情况。',
  '3. 保留各症状自己的时间线，不要把第一个症状的持续时间套到其他症状上。',
  '4. 自动判断场景：急性症状、慢病复诊、检查异常、健康体检。慢病复诊可写“病史X年，复诊/取药/控制情况”；检查异常可写“体检/检查发现X异常X时间”。',
  '5. 只写有价值的阴性症状；不要机械输出“不清楚、无、以上都无、未查、不详、不记得”。',
  '6. 现病史可以用一段或两段，整体控制在基层门诊可读长度。',
  '7. 不写诊断结论，不写处理意见，不写体格检查。',
  '8. 未采集到的内容保持空字符串，不得写“待医生补充完善、待医生核实、建议询问、信息不足、未提供相关信息”等工作流提示。',
  '9. 输出 JSON 格式：{"chiefComplaint":"...","historyOfPresentIllness":"..."}。',
].join('\n');

const EMPTY_VALUES = new Set(['', '不清楚', '无', '以上都无', '未查', '不详', '不记得', '其他']);

function getFieldKey(field: ConsultationRecordAiDraftField): string {
  return field.storageKey || field.key || '';
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeValue(item))
      .filter((item) => item && !EMPTY_VALUES.has(item))
      .join('、');
  }

  if (typeof value === 'object') {
    const valueObject = value as { inputValue?: unknown; radioValue?: unknown };
    const inputValue = normalizeValue(valueObject.inputValue);
    const radioValue = normalizeValue(valueObject.radioValue);
    if (inputValue && radioValue) {
      return `${inputValue}${radioValue}`;
    }
    return inputValue || radioValue;
  }

  return '';
}

function shouldKeepValue(value: string): boolean {
  return value !== '' && !EMPTY_VALUES.has(value);
}

function buildSymptomSummaries<TSymptom extends ConsultationRecordAiDraftSymptom>(
  selectedSymptoms: TSymptom[],
  formData: Record<string, Record<string, unknown> | undefined>,
): SymptomSummary[] {
  return selectedSymptoms.map((symptom) => {
    const data = formData[symptom.key] || {};
    const fields: SymptomFieldSummary[] = [];

    symptom.config?.sections?.forEach((section) => {
      section.fields?.forEach((field) => {
        const key = getFieldKey(field);
        if (!key) return;

        const value = normalizeValue(data[key]);
        if (!shouldKeepValue(value)) return;

        fields.push({
          label: field.label || key,
          value,
        });
      });
    });

    return {
      name: symptom.name,
      fields,
    };
  });
}

export function buildConsultationRecordAiDraftMessages<TSymptom extends ConsultationRecordAiDraftSymptom>(
  input: BuildConsultationRecordAiDraftMessagesInput<TSymptom>,
): ConsultationRecordAiDraftRequestSpec {
  const symptomSummaries = buildSymptomSummaries(input.selectedSymptoms, input.formData);
  const payload = {
    mode: input.mode,
    patient: input.patientProfile || {},
    selectedSymptoms: symptomSummaries,
    companionSymptomNames: input.companionSymptomNames || [],
    generalConditionText: input.generalConditionText || '',
    tcmFourExaminationsText: input.tcmFourExaminationsText || '',
    localFallbackDraft: input.localFallbackDraft,
  };

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          USER_INSTRUCTIONS,
          '输入数据如下：',
          JSON.stringify(payload, null, 2),
        ].join('\n\n'),
      },
    ],
    config: {
      configProfile: 'fast',
      traceContext: {
        scene: 'consultation-record-draft',
        sourceModule: 'consultation_ai',
        operationModule: 'consultation',
        operationAction: 'generate_record_draft',
        title: '智能问诊生成病历草稿',
      },
    },
  };
}

export function normalizeConsultationRecordAiDraftOutput(value: unknown): ConsultationRecordAiDraftOutput {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 病历草稿不是 JSON 对象');
  }

  const record = value as Partial<Record<keyof ConsultationRecordAiDraftOutput, unknown>>;
  const chiefComplaint = normalizeGeneratedClinicalRecordNarrative(
    record.chiefComplaint,
    'chiefComplaint',
  ).text;
  const historyOfPresentIllness = normalizeGeneratedClinicalRecordNarrative(
    record.historyOfPresentIllness,
    'historyOfPresentIllness',
  ).text;

  if (!chiefComplaint || !historyOfPresentIllness) {
    throw new Error('AI 病历草稿缺少主诉或现病史');
  }

  return {
    chiefComplaint,
    historyOfPresentIllness,
  };
}
