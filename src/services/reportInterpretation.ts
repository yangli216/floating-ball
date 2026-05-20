import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PROMPTS } from '../prompts';
import { chat, type ChatMessage } from './llm';
import type { AppPatient } from '../types/appState';
import type {
  ReportInterpretationKeyPoint,
  ReportInterpretationPatientInput,
  ReportInterpretationPatientProfile,
  ReportInterpretationRequestPayload,
  ReportInterpretationResolvedRequest,
  ReportInterpretationTaskId,
  ReportInterpretationWindowPayload,
  ReportInterpretationWindowStateEvent,
} from '../types/reportInterpretation';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextId,
  getPatientContextName,
  getPatientContextVisitId,
  getPatientContextGenderText,
  getPatientContextPastMedicalHistory,
} from '../utils/patientContext';

const REPORT_INTERPRETATION_WINDOW_LABEL = 'report-interpretation-window';
const REPORT_INTERPRETATION_WINDOW_URL = 'index.html?window=report-interpretation';
const UPDATE_EVENT = 'report-interpretation:update';
const STATUS_EVENT = 'report-interpretation:status';
const WINDOW_EVENT_RETRY_DELAYS = [0, 120, 320] as const;

interface ReportInterpretationLLMResponse {
  summary?: string;
  conclusion?: string;
  keyPoints?: Array<{
    title?: string;
    detail?: string;
    urgency?: 'low' | 'medium' | 'high' | string;
  }>;
  sections?: Array<{
    title?: string;
    content?: string;
  }>;
  recommendations?: string[] | string;
  cautions?: string[] | string;
}

interface ReportInterpretationFindingRule {
  pattern: RegExp;
  meaning: string;
  action: string;
  urgency: 'low' | 'medium' | 'high';
}

interface ReportInterpretationQueryInsight {
  reportDate?: string;
  reportItem?: string;
  resultLines: string[];
  conclusionLines: string[];
  reportHighlights: string[];
  redFlagLines: string[];
  recommendedActions: string[];
}

const REPORT_DATE_LABELS = ['报告日期', '检查日期', '检验日期'];
const REPORT_ITEM_LABELS = ['检查项目', '检验项目', '项目'];
const REPORT_RESULT_LABELS = ['检查结果', '检验结果', '检查所见', '影像表现', '结果'];
const REPORT_CONCLUSION_LABELS = ['影像诊断', '检查结论', '检验结论', '诊断意见', '提示'];
const REPORT_STOP_LABELS = ['建议', '备注', ...REPORT_CONCLUSION_LABELS];
const GENERIC_INTERPRETATION_PHRASES = [
  '需结合临床表现综合判断',
  '不足以单独下结论',
  '仅供医生快速判读',
  '不应脱离症状',
  '建议结合临床',
  '请结合临床',
  '优先安排复查或进一步检查',
];
const HIGH_RISK_FINDING_PATTERN = /出血|梗死|梗阻|栓塞|夹层|气胸|穿孔|恶性|占位|肿块|骨折|脱位|大面积|重度|急性|坏死/i;
const LAB_ABNORMAL_PATTERN = /↑|↓|阳性|异常|升高|降低|增高|减少|偏高|偏低|高于|低于|[A-Za-z]{2,}[A-Za-z0-9%/.-]*\s*[:：]?\s*\d/i;
const CHECK_FINDING_PATTERN = /阳性|高密度影|低密度影|斑片|结节|实变|磨玻璃|积液|增粗|阴影|占位|肿块|狭窄|扩张|骨折|脱位|出血|梗死|梗阻|钙化/i;

const LAB_FINDING_RULES: ReportInterpretationFindingRule[] = [
  {
    pattern: /WBC|白细胞|NEUT|中性粒|CRP|C反应蛋白|PCT|降钙素原/i,
    meaning: '提示炎症或感染活动可能增强，需结合发热、局部感染灶和抗感染治疗反应判断。',
    action: '结合症状和查体评估感染灶；必要时复查炎症指标动态变化。',
    urgency: 'medium',
  },
  {
    pattern: /HGB|Hb|血红蛋白|RBC|红细胞/i,
    meaning: '提示可能存在贫血或血液浓缩，建议结合出血史、营养状态和红细胞参数综合判断。',
    action: '若伴乏力、头晕或慢性失血线索，建议完善贫血病因评估。',
    urgency: 'medium',
  },
  {
    pattern: /PLT|血小板/i,
    meaning: '血小板异常需分别关注出血风险或血栓风险，并结合病因进一步判断。',
    action: '结合出血点、凝血功能和基础疾病判断是否需要进一步复查。',
    urgency: 'medium',
  },
  {
    pattern: /ALT|AST|转氨酶|胆红素|ALP|GGT/i,
    meaning: '提示肝细胞损伤或胆汁淤积可能，需结合药物史、饮酒史和基础肝病。',
    action: '复核肝功能相关指标，并结合用药和既往肝病史评估。',
    urgency: 'medium',
  },
  {
    pattern: /Cr|CREA|肌酐|尿素氮|eGFR/i,
    meaning: '提示肾功能变化，需结合基础肾病、尿量和近期用药判断。',
    action: '必要时复查肾功能并评估是否存在脱水、感染或药物相关影响。',
    urgency: 'medium',
  },
  {
    pattern: /D-二聚体|D二聚体|FDP|肌钙蛋白|TnI|TnT/i,
    meaning: '属于需要结合临床高危线索优先判断的指标异常，单份结果不足以定性，但不能忽视。',
    action: '结合胸痛、呼吸困难、下肢肿痛等高危表现，必要时尽快进一步排查。',
    urgency: 'high',
  },
];

const CHECK_FINDING_RULES: ReportInterpretationFindingRule[] = [
  {
    pattern: /感染|炎|斑片状|实变|磨玻璃|高密度影/i,
    meaning: '更偏向炎症或感染性改变，需结合体温、痰色、血氧和炎症指标判断严重程度。',
    action: '结合呼吸道症状和炎症指标评估是否需要复查影像或调整治疗。',
    urgency: 'medium',
  },
  {
    pattern: /积液/i,
    meaning: '提示局部渗出或液体潴留，需结合炎症、心肾功能及病程综合判断。',
    action: '结合症状和病程判断是否需要进一步明确积液性质或复查。',
    urgency: 'medium',
  },
  {
    pattern: /结节|占位|肿块|恶性/i,
    meaning: '提示存在占位性病变或随访重点，需要结合既往片和高危因素评估性质。',
    action: '建议对照既往检查，并按专科路径决定是否进一步增强检查或随访。',
    urgency: 'high',
  },
  {
    pattern: /骨折|脱位/i,
    meaning: '提示明确器质性损伤，应尽快结合体征和专科处理方案评估稳定性。',
    action: '结合疼痛、活动受限和局部查体决定固定、复位或转诊。',
    urgency: 'high',
  },
  {
    pattern: /出血|梗死|梗阻|栓塞|夹层|气胸|穿孔/i,
    meaning: '属于高危影像信号，需优先判断是否存在急诊处理指征。',
    action: '结合生命体征和急性症状，必要时立即转入急诊或专科评估。',
    urgency: 'high',
  },
];

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function readIncomingPatientText(
  patient: ReportInterpretationPatientInput | null | undefined,
  keys: string[],
): string {
  if (!patient) {
    return '';
  }

  for (const key of keys) {
    const value = normalizeText((patient as Record<string, unknown>)[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function generateRequestId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function taskLabel(taskId: ReportInterpretationTaskId): string {
  return taskId === 'inspectReport' ? '检验报告' : '检查报告';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => normalizeText(item)).filter(Boolean)));
}

function splitReportLines(query: string): string[] {
  return query
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractInlineValue(line: string, labels: string[]): string {
  for (const label of labels) {
    if (line.startsWith(label)) {
      return normalizeText(line.slice(label.length).replace(/^[:：]\s*/, ''));
    }
  }

  return '';
}

function extractTaggedValue(lines: string[], labels: string[]): string {
  for (const line of lines) {
    const value = extractInlineValue(line, labels);
    if (value) {
      return value;
    }
  }

  return '';
}

function startsWithAnyLabel(line: string, labels: string[]): boolean {
  return labels.some((label) => line.startsWith(label));
}

function collectTaggedBlock(lines: string[], startLabels: string[], stopLabels: string[]): string[] {
  const values: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const inlineValue = extractInlineValue(line, startLabels);
    if (line.startsWith(startLabels[0]) || startsWithAnyLabel(line, startLabels)) {
      collecting = true;
      if (inlineValue) {
        values.push(inlineValue);
      }
      continue;
    }

    if (!collecting) {
      continue;
    }

    if (startsWithAnyLabel(line, stopLabels)) {
      break;
    }

    values.push(normalizeText(line));
  }

  return uniqueStrings(values);
}

function pickFindingRule(taskId: ReportInterpretationTaskId, finding: string): ReportInterpretationFindingRule {
  const rules = taskId === 'inspectReport' ? LAB_FINDING_RULES : CHECK_FINDING_RULES;
  const matched = rules.find((rule) => rule.pattern.test(finding));
  if (matched) {
    return matched;
  }

  return taskId === 'inspectReport'
    ? {
        pattern: /.*/,
        meaning: '需要结合参考范围、采样时点和动态复查结果综合判断。',
        action: '建议对照参考范围并结合症状决定是否复查。',
        urgency: 'medium',
      }
    : {
        pattern: /.*/,
        meaning: '需要结合症状、病程、查体和既往同类检查综合判断。',
        action: '建议结合临床表现决定是否复查或补充进一步检查。',
        urgency: 'medium',
      };
}

function analyzeReportQuery(request: ReportInterpretationResolvedRequest): ReportInterpretationQueryInsight {
  const lines = splitReportLines(request.query);
  const reportDate = extractTaggedValue(lines, REPORT_DATE_LABELS);
  const reportItem = extractTaggedValue(lines, REPORT_ITEM_LABELS);
  const resultLines = collectTaggedBlock(lines, REPORT_RESULT_LABELS, REPORT_STOP_LABELS);
  const conclusionLines = uniqueStrings([
    ...collectTaggedBlock(lines, REPORT_CONCLUSION_LABELS, ['建议', '备注']),
    ...lines.filter((line) => extractInlineValue(line, REPORT_CONCLUSION_LABELS)),
  ]);

  const rawCandidates = request.taskId === 'inspectReport'
    ? uniqueStrings([
        ...lines.filter((line) => LAB_ABNORMAL_PATTERN.test(line)),
        ...resultLines,
        ...conclusionLines,
      ])
    : uniqueStrings([
        ...conclusionLines,
        ...lines.filter((line) => CHECK_FINDING_PATTERN.test(line)),
        ...resultLines,
      ]);

  const reportHighlights = rawCandidates.slice(0, 4);
  const redFlagLines = reportHighlights.filter((line) => HIGH_RISK_FINDING_PATTERN.test(line) || pickFindingRule(request.taskId, line).urgency === 'high');
  const recommendedActions = uniqueStrings(
    reportHighlights.map((line) => pickFindingRule(request.taskId, line).action)
  ).slice(0, 4);

  return {
    reportDate: reportDate || undefined,
    reportItem: reportItem || undefined,
    resultLines,
    conclusionLines,
    reportHighlights,
    redFlagLines,
    recommendedActions,
  };
}

function isGenericInterpretationText(text: string, clues: string[]): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return true;
  }

  const hasClue = clues.some((item) => {
    const clue = normalizeText(item);
    if (!clue) {
      return false;
    }

    return normalized.includes(clue) || normalized.includes(clue.split(/[；，,。]/)[0] || clue);
  });

  return GENERIC_INTERPRETATION_PHRASES.some((item) => normalized.includes(item)) && !hasClue;
}

function pickMeaningfulText(value: unknown, fallback: string, clues: string[]): string {
  const normalized = normalizeText(value);
  if (!normalized || isGenericInterpretationText(normalized, clues)) {
    return fallback;
  }

  return normalized;
}

function normalizeMeaningfulList(value: string[] | string | undefined, fallback: string[], clues: string[]): string[] {
  const normalized = normalizeList(value, []).filter((item) => !isGenericInterpretationText(item, clues));
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeList(value: string[] | string | undefined, fallback: string[]): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = items
    .flatMap((item) => item.split(/[\n；;。]/))
    .map((item) => normalizeText(item))
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)).slice(0, 5) : fallback;
}

function normalizeKeyPoints(value: ReportInterpretationLLMResponse['keyPoints']): ReportInterpretationKeyPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const urgency = item?.urgency === 'high' || item?.urgency === 'medium' || item?.urgency === 'low'
        ? item.urgency
        : 'medium';

      return {
        title: normalizeText(item?.title),
        detail: normalizeText(item?.detail),
        urgency,
      } satisfies ReportInterpretationKeyPoint;
    })
    .filter((item) => item.title && item.detail)
    .slice(0, 4);
}

function extractJsonObject<T>(response: string): T {
  const clean = response.replace(/```json\n?|\n?```|```\n?/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

function buildPatientProfile(
  currentPatient: AppPatient | null | undefined,
  incomingPatient: ReportInterpretationPatientInput | null | undefined,
): ReportInterpretationPatientProfile | null {
  const hasCurrent = Boolean(getPatientContextId(currentPatient) || getPatientContextName(currentPatient));
  const hasIncoming = Boolean(
    incomingPatient && Object.values(incomingPatient).some((item) => normalizeText(item).length > 0)
  );

  if (!hasCurrent && !hasIncoming) {
    return null;
  }

  const rawIncoming = incomingPatient ? { ...incomingPatient } : undefined;

  return {
    patientId: readIncomingPatientText(incomingPatient, ['patientId', 'idPi']) || getPatientContextId(currentPatient) || undefined,
    visitId: readIncomingPatientText(incomingPatient, ['visitId', 'idVis']) || getPatientContextVisitId(currentPatient) || undefined,
    patientName: readIncomingPatientText(incomingPatient, ['name', 'naPi']) || getPatientContextName(currentPatient) || undefined,
    genderText: readIncomingPatientText(incomingPatient, ['gender', 'sdSexText']) || getPatientContextGenderText(currentPatient) || undefined,
    ageText: readIncomingPatientText(incomingPatient, ['age', 'ageText']) || getPatientContextAgeText(currentPatient) || undefined,
    allergyHistory:
      readIncomingPatientText(incomingPatient, ['allergyHistory']) || getPatientContextAllergyHistory(currentPatient) || undefined,
    chiefComplaint:
      readIncomingPatientText(incomingPatient, ['chiefComplaint'])
      || normalizeText(currentPatient?.chiefComplaint)
      || undefined,
    historyOfPresentIllness:
      readIncomingPatientText(incomingPatient, ['historyOfPresentIllness'])
      || normalizeText(currentPatient?.historyOfPresentIllness)
      || undefined,
    pastMedicalHistory:
      readIncomingPatientText(incomingPatient, ['pastMedicalHistory'])
      || getPatientContextPastMedicalHistory(currentPatient)
      || undefined,
    diagnosis: readIncomingPatientText(incomingPatient, ['diagnosis']) || normalizeText(currentPatient?.diagnosis) || undefined,
    raw: rawIncoming,
  };
}

export function resolveReportInterpretationRequest(
  payload: ReportInterpretationRequestPayload,
  currentPatient: AppPatient | null | undefined,
): ReportInterpretationResolvedRequest {
  const query = normalizeText(payload.query);
  if (!query) {
    throw new Error('报告原文不能为空。');
  }

  return {
    requestId: normalizeText(payload.requestId) || generateRequestId(),
    taskId: payload.taskId,
    reportKindLabel: taskLabel(payload.taskId),
    query,
    patient: buildPatientProfile(currentPatient, payload.patient),
  };
}

export function formatPatientSummary(patient: ReportInterpretationPatientProfile | null): string {
  if (!patient) {
    return '未提供患者背景，仅基于报告原文解读。';
  }

  const base = [patient.patientName, patient.genderText, patient.ageText]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const supplements = [
    patient.diagnosis ? `当前诊断：${patient.diagnosis}` : '',
    patient.chiefComplaint ? `主诉：${patient.chiefComplaint}` : '',
    patient.historyOfPresentIllness ? `现病史：${patient.historyOfPresentIllness}` : '',
    patient.pastMedicalHistory ? `既往史：${patient.pastMedicalHistory}` : '',
    patient.allergyHistory ? `过敏史：${patient.allergyHistory}` : '',
  ].filter(Boolean);

  const summary = [...base, ...supplements].join('；');
  return summary || '未提供患者背景，仅基于报告原文解读。';
}

function buildFallbackPayload(request: ReportInterpretationResolvedRequest): ReportInterpretationWindowPayload {
  const insight = analyzeReportQuery(request);
  const patientSummary = formatPatientSummary(request.patient);
  const lines = request.query
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const preview = lines.slice(0, 3).join('；') || '已接收报告原文';
  const headline = insight.reportHighlights[0] || preview;
  const reportLabel = insight.reportItem || request.reportKindLabel;
  const leadingRule = pickFindingRule(request.taskId, headline);
  const keyPoints = insight.reportHighlights.length > 0
    ? insight.reportHighlights.slice(0, 3).map((item, index) => {
        const rule = pickFindingRule(request.taskId, item);
        return {
          title: index === 0 ? '报告核心发现' : index === 1 ? '临床关注点' : '处置提醒',
          detail: `原文提示“${item}”。${rule.meaning}`,
          urgency: rule.urgency,
        } satisfies ReportInterpretationKeyPoint;
      })
    : [
        {
          title: '报告核心发现',
          detail: `当前报告最值得先看的内容为：${preview}。`,
          urgency: leadingRule.urgency,
        },
      ];

  const sectionHighlights = insight.reportHighlights.length > 0 ? insight.reportHighlights.join('；') : preview;
  const contextInterpretation = patientSummary.includes('未提供患者背景')
    ? `${headline}。${leadingRule.meaning}`
    : `结合患者背景（${patientSummary}），当前报告最值得关注的是：${headline}。${leadingRule.meaning}`;
  const nextActionText = uniqueStrings([
    ...insight.recommendedActions,
    insight.redFlagLines.length > 0 ? '若伴生命体征不稳、进行性加重或明确高危症状，应优先转急诊或专科处理。' : '',
    request.taskId === 'inspectReport'
      ? '如与当前症状不符，建议复核参考范围、采样时点，并结合动态复查判断。'
      : '建议与既往同类检查对照，必要时结合进一步影像或专科意见判断。',
  ]).join('；');

  return {
    requestId: request.requestId,
    taskId: request.taskId,
    reportKindLabel: request.reportKindLabel,
    patientSummary,
    patient: request.patient,
    sourceQuery: request.query,
    summary: `${reportLabel}最值得关注的发现是：${headline}`,
    conclusion: `${insight.reportDate ? `${insight.reportDate} ` : ''}${reportLabel}提示：${sectionHighlights}。${contextInterpretation}`,
    keyPoints,
    sections: [
      {
        title: '报告核心发现',
        content: sectionHighlights,
      },
      {
        title: '结合患者背景的判断',
        content: contextInterpretation,
      },
      {
        title: '建议下一步',
        content: nextActionText,
      },
    ],
    recommendations: uniqueStrings([
      ...insight.recommendedActions,
      request.taskId === 'inspectReport'
        ? '对照参考范围与动态趋势，必要时补充复查以判断变化方向。'
        : '结合既往影像或同类检查对照，避免孤立解读单次结果。',
    ]).slice(0, 4),
    cautions: [
      'AI 解读不能替代医生最终诊断。',
      request.taskId === 'inspectReport'
        ? '请结合原始报告数值、参考范围、采样时点和动态变化趋势判断。'
        : '请结合原始影像描述、查体和既往同类检查共同判断。',
    ],
    generatedAt: new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function sanitizeLLMResponse(
  request: ReportInterpretationResolvedRequest,
  response: ReportInterpretationLLMResponse,
  fallback: ReportInterpretationWindowPayload,
): ReportInterpretationWindowPayload {
  const clues = analyzeReportQuery(request).reportHighlights;
  const keyPoints = normalizeKeyPoints(response.keyPoints)
    .filter((item) => !isGenericInterpretationText(`${item.title} ${item.detail}`, clues));
  const sections = Array.isArray(response.sections)
    ? response.sections
        .map((item) => ({
          title: normalizeText(item?.title),
          content: normalizeText(item?.content),
        }))
        .filter((item) => item.title && item.content && !isGenericInterpretationText(item.content, clues))
        .slice(0, 4)
    : [];

  return {
    ...fallback,
    requestId: request.requestId,
    taskId: request.taskId,
    reportKindLabel: request.reportKindLabel,
    patientSummary: formatPatientSummary(request.patient),
    patient: request.patient,
    sourceQuery: request.query,
    summary: pickMeaningfulText(response.summary, fallback.summary, clues),
    conclusion: pickMeaningfulText(response.conclusion, fallback.conclusion, clues),
    keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
    sections: sections.length > 0 ? sections : fallback.sections,
    recommendations: normalizeMeaningfulList(response.recommendations, fallback.recommendations, clues),
    cautions: normalizeMeaningfulList(response.cautions, fallback.cautions, clues),
  };
}

export async function buildReportInterpretationPayload(
  request: ReportInterpretationResolvedRequest,
): Promise<ReportInterpretationWindowPayload> {
  const fallback = buildFallbackPayload(request);
  const reportInsights = analyzeReportQuery(request);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.consultation.reportInterpretation.system,
    },
    {
      role: 'user',
      content: PROMPTS.consultation.reportInterpretation.buildUserPrompt({
        reportKindLabel: request.reportKindLabel,
        patientSummary: formatPatientSummary(request.patient),
        taskId: request.taskId,
        query: request.query,
        reportHighlights: reportInsights.reportHighlights,
      }),
    },
  ];

  try {
    const response = await chat(messages, undefined, undefined, undefined, {
      traceContext: {
        scene: 'report-interpretation',
        sourceModule: 'report_interpretation',
        operationModule: 'report_interpretation',
        operationAction: 'build_report_interpretation',
        title: '生成报告解读',
      },
    });

    const parsed = extractJsonObject<ReportInterpretationLLMResponse>(response);
    return sanitizeLLMResponse(request, parsed, fallback);
  } catch (error) {
    console.warn('[ReportInterpretation] Falling back to local interpretation:', error);
    return fallback;
  }
}

async function ensureReportInterpretationWindow(): Promise<{ window: WebviewWindow; isNewWindow: boolean }> {
  const existingWindow = await WebviewWindow.getByLabel(REPORT_INTERPRETATION_WINDOW_LABEL);
  if (existingWindow) {
    console.info('[ReportInterpretation] Reusing existing window:', existingWindow.label);
    return { window: existingWindow, isNewWindow: false };
  }

  const createdWindow = new WebviewWindow(REPORT_INTERPRETATION_WINDOW_LABEL, {
    url: REPORT_INTERPRETATION_WINDOW_URL,
    title: '报告解读',
    decorations: false,
    width: 1040,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    resizable: true,
    center: true,
    focus: true,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finalize = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    void createdWindow.once('tauri://created', () => finalize(resolve));
    void createdWindow.once('tauri://error', (event) => {
      const message = normalizeText(event.payload) || '报告解读窗口创建失败。';
      finalize(() => reject(new Error(message)));
    });
  });

  console.info('[ReportInterpretation] Created window:', createdWindow.label);

  return { window: createdWindow, isNewWindow: true };
}

async function emitWindowEventWithRetry<T>(
  reportWindow: WebviewWindow,
  eventName: string,
  payload: T,
): Promise<void> {
  let lastError: unknown = null;

  for (const delay of WINDOW_EVENT_RETRY_DELAYS) {
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delay);
      });
    }

    try {
      await reportWindow.emit(eventName, payload);
      console.info('[ReportInterpretation] Emitted window event:', {
        eventName,
        target: reportWindow.label,
        delay,
      });
      lastError = null;
    } catch (error) {
      console.warn('[ReportInterpretation] Failed to emit window event:', {
        eventName,
        target: reportWindow.label,
        delay,
        error,
      });
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

export async function openReportInterpretationWindow(
  payload: ReportInterpretationRequestPayload,
  currentPatient: AppPatient | null | undefined,
): Promise<ReportInterpretationWindowPayload> {
  const request = resolveReportInterpretationRequest(payload, currentPatient);
  const { window: reportWindow } = await ensureReportInterpretationWindow();

  console.info('[ReportInterpretation] Opening report window:', {
    requestId: request.requestId,
    taskId: request.taskId,
    windowLabel: reportWindow.label,
  });

  const loadingState: ReportInterpretationWindowStateEvent = {
    loading: true,
    phase: 'generating',
    message: `正在生成${request.reportKindLabel}解读...`,
    detail: '正在结合报告原文和患者背景生成结构化说明。',
    clearPayload: true,
  };

  await reportWindow.show();
  await emitWindowEventWithRetry(reportWindow, STATUS_EVENT, loadingState);

  try {
    await reportWindow.setFocus();
  } catch (error) {
    console.warn('[ReportInterpretation] Failed to focus report window, continue without blocking delivery:', {
      requestId: request.requestId,
      taskId: request.taskId,
      error,
    });
  }

  try {
    const result = await buildReportInterpretationPayload(request);
    console.info('[ReportInterpretation] Built payload successfully:', {
      requestId: request.requestId,
      taskId: request.taskId,
    });
    await emitWindowEventWithRetry(reportWindow, UPDATE_EVENT, result);
    await emitWindowEventWithRetry(reportWindow, STATUS_EVENT, {
      loading: false,
      phase: 'success',
      message: '',
      detail: '',
    } satisfies ReportInterpretationWindowStateEvent);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '报告解读生成失败。';
    console.error('[ReportInterpretation] Failed to build or deliver payload:', {
      requestId: request.requestId,
      taskId: request.taskId,
      error,
    });
    await emitWindowEventWithRetry(reportWindow, STATUS_EVENT, {
      loading: false,
      phase: 'error',
      message: '报告解读生成失败，请稍后重试。',
      detail: message,
      clearPayload: true,
    } satisfies ReportInterpretationWindowStateEvent);
    throw error;
  }
}

export const reportInterpretationWindowLabel = REPORT_INTERPRETATION_WINDOW_LABEL;