import { chatFast, chatStreamWithFallback } from '@/services/llm';
import { getHisAdapter } from '@/services/his';
import { isRegionalMode, regionalPost } from '@/services/regionalClient';
import type {
  HisInpatientOrder,
  HisInpatientEmrContextPackage,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
  HisInpatientQuery,
  HisInpatientTemperatureRecord,
} from '@/services/his';
import { parseLLMJson } from '@features/clinical-result/clinicalResultLlmJsonParser';
import {
  buildInpatientEmrGeneratePrompt,
  INPATIENT_EMR_TEMPLATE_PARSE_PROMPT,
} from '../lib/inpatientEmrPrompts';
import {
  buildDefaultFieldValues,
  fillInpatientEmrTemplateHtml,
  formatInpatientEmrDateMinute,
  parseInpatientEmrTemplate,
} from '../lib/inpatientEmrTemplate';
import type {
  InpatientEmrContext,
  InpatientEmrDocumentContext,
  InpatientEmrGeneratedPreview,
  InpatientEmrGenerationProgress,
  InpatientEmrGenerationRequest,
  InpatientEmrGenerationResult,
  InpatientEmrTemplateField,
  InpatientEmrTemplateParseResult,
} from '../types';

export type InpatientEmrProgressHandler = (progress: InpatientEmrGenerationProgress) => void;

function report(
  onProgress: InpatientEmrProgressHandler | undefined,
  progress: InpatientEmrGenerationProgress,
): void {
  onProgress?.(progress);
}

function formatDiagnosis(registration: HisInpatientRegistrationInfo | null): string {
  const diagnosis = registration?.diagnoses?.find((item) => item.isPrimary && item.name)
    || registration?.diagnoses?.find((item) => item.name);
  if (diagnosis?.name) {
    return diagnosis.code ? `${diagnosis.name}（${diagnosis.code}）` : diagnosis.name;
  }
  if (registration?.admissionDiagnosis) {
    return registration.admissionDiagnosisCode
      ? `${registration.admissionDiagnosis}（${registration.admissionDiagnosisCode}）`
      : registration.admissionDiagnosis;
  }
  return '暂无明确诊断';
}

function extractDatePart(value: string | undefined): string {
  return (value || '').split(/\s+/)[0] || '';
}

function normalizeRecordTime(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.test(trimmed)) {
    return trimmed.length === 10 ? `${trimmed} 00:00` : trimmed;
  }
  return formatInpatientEmrDateMinute();
}

function buildDocumentContext(request: InpatientEmrGenerationRequest): InpatientEmrDocumentContext {
  const recordTime = normalizeRecordTime(request.recordTime);
  const recordType = (request.templateName || '').trim() || '住院病程记录';
  return {
    templateId: request.templateId,
    templateName: (request.templateName || '').trim() || '住院病历模板',
    recordType,
    recordTime,
    recordDate: extractDatePart(recordTime),
  };
}

function getTemperatureRecordDate(record: HisInpatientTemperatureRecord | null | undefined): string {
  if (!record) return '';
  return extractDatePart(record.dtSurvey) || extractDatePart(record.recordTime);
}

function findTemperatureRecordByDate(
  chart: HisInpatientTemperatureChart | null,
  recordDate: string,
): HisInpatientTemperatureRecord | null {
  if (!chart || !recordDate) return null;
  const records = [
    ...(chart.todayRecords || []),
    ...chart.records,
  ];
  return records.find((record) => getTemperatureRecordDate(record) === recordDate) || null;
}

function formatVitalFragments(record: HisInpatientTemperatureRecord): string {
  const fragments: string[] = [];
  if (typeof record.temperature === 'number') {
    fragments.push(`${record.temperatureType || '体温'}${record.temperature}℃`);
  }
  if (typeof record.pulse === 'number') {
    fragments.push(`脉搏${record.pulse}次/分`);
  }
  if (typeof record.heartRate === 'number') {
    fragments.push(`心率${record.heartRate}次/分`);
  }
  if (typeof record.respiration === 'number') {
    fragments.push(`呼吸${record.respiration}次/分`);
  }
  if (typeof record.bloodPressureSystolic === 'number' || typeof record.bloodPressureDiastolic === 'number') {
    fragments.push(`血压${record.bloodPressureSystolic ?? '-'}/${record.bloodPressureDiastolic ?? '-'}mmHg`);
  }
  if (typeof record.spo2 === 'number') {
    fragments.push(`血氧饱和度${record.spo2}%`);
  }
  if (typeof record.weight === 'number') {
    fragments.push(`体重${record.weight}kg`);
  }
  return fragments.length > 0 ? fragments.join('，') : record.detailText || '暂无结构化生命体征';
}

function formatTemperatureNarrative(
  chart: HisInpatientTemperatureChart | null,
  recordDate: string,
): string {
  const sameDayRecord = findTemperatureRecordByDate(chart, recordDate);
  if (sameDayRecord) {
    return `今日体温单显示：${formatVitalFragments(sameDayRecord)}`;
  }
  const record = chart?.records?.[0] || null;
  if (!record) return '暂无体温单数据';
  const latestDate = getTemperatureRecordDate(record);
  return latestDate
    ? `本日体温单暂无记录；最近一次体温单记录（${latestDate}）显示：${formatVitalFragments(record)}`
    : `本日体温单暂无记录；最近一次体温单记录显示：${formatVitalFragments(record)}`;
}

function mergeDocumentContextIntoHisContext(
  hisContext: HisInpatientEmrContextPackage | undefined,
  documentContext: InpatientEmrDocumentContext,
  admissionId: string,
): HisInpatientEmrContextPackage | undefined {
  if (!hisContext) return undefined;
  return {
    ...hisContext,
    documentContext: {
      ...hisContext.documentContext,
      admissionId: hisContext.documentContext?.admissionId || admissionId,
      templateId: documentContext.templateId,
      templateName: documentContext.templateName,
      recordType: documentContext.recordType,
      recordTime: documentContext.recordTime,
      recordDate: documentContext.recordDate,
    },
  };
}

function buildRegistrationFromAiContext(
  hisContext: HisInpatientEmrContextPackage | undefined,
  query: HisInpatientQuery,
): HisInpatientRegistrationInfo | null {
  if (!hisContext) return null;
  const patient = hisContext.patient;
  const admission = hisContext.admission;
  if (!patient && !admission && !hisContext.diagnoses?.length) return null;
  return {
    patientId: patient?.patientId || query.patientId || query.admissionId || '',
    name: patient?.name,
    gender: patient?.sex,
    birthday: patient?.birthDate,
    ageText: patient?.age,
    inpatientVisitId: query.admissionId || query.inpatientVisitId,
    inpatientNo: patient?.inpatientNo,
    medicalRecordNo: patient?.medicalRecordNo,
    admissionTime: admission?.admissionTime,
    deptName: admission?.department,
    wardName: admission?.ward,
    bedNo: admission?.bedNo,
    attendingDoctorName: admission?.attendingDoctor,
    chiefDoctorId: admission?.chiefDoctor,
    allergyText: admission?.allergyText,
    isSevere: admission?.severeFlag,
    diagnoses: hisContext.diagnoses,
    raw: {
      source: 'inpatient-emr-ai-context',
      admission,
      patient,
    },
  };
}

function uniqueOrders(orders: HisInpatientOrder[]): HisInpatientOrder[] {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = order.orderId || `${formatOrderDisplayText(order)}-${order.startTime || ''}-${order.status || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatOrderDisplayText(order: HisInpatientOrder): string {
  if (order.displayText?.trim()) {
    return order.displayText.trim();
  }
  const text = (order.fullText || order.name || '').trim();
  if (!text) return '';

  const hasDose = order.dose && text.includes(order.dose);
  const hasRoute = order.route && text.includes(order.route);
  const hasFreq = order.frequency && text.includes(order.frequency);

  const suffixParts: string[] = [];
  if (order.dose && !hasDose) {
    suffixParts.push(order.dose);
  }
  if (order.route && !hasRoute) {
    suffixParts.push(order.route);
  }
  if (order.frequency && !hasFreq) {
    suffixParts.push(order.frequency);
  }

  if (suffixParts.length > 0) {
    return `${text} ${suffixParts.join(' ')}`.trim();
  }
  return text;
}

function buildOrdersFromAiContext(
  hisContext: HisInpatientEmrContextPackage | undefined,
): HisInpatientOrder[] {
  if (!hisContext?.orders) return [];
  return uniqueOrders([
    ...(hisContext.orders.active || []),
    ...(hisContext.orders.changedNearRecordDate || []),
  ]);
}

function buildTemperatureChartFromAiContext(
  hisContext: HisInpatientEmrContextPackage | undefined,
  query: HisInpatientQuery,
): HisInpatientTemperatureChart | null {
  const vitals = hisContext?.vitals;
  if (!vitals) return null;
  const recordDateItems = vitals.recordDateItems || [];
  const latestBefore = vitals.latestBeforeRecordDate ? [vitals.latestBeforeRecordDate] : [];
  const records = [...recordDateItems, ...latestBefore].filter(Boolean);
  if (records.length === 0) return null;
  return {
    patientId: hisContext?.patient?.patientId || query.patientId || query.admissionId || '',
    inpatientVisitId: query.inpatientVisitId || query.admissionId,
    records,
    todayRecords: recordDateItems,
    historyRecords: latestBefore,
    raw: {
      source: 'inpatient-emr-ai-context',
      summary: vitals.summary,
      raw: vitals.raw,
    },
  };
}

function formatOrderSummary(orders: HisInpatientOrder[]): string {
  if (orders.length === 0) return '暂无当日医嘱数据';
  return orders.map(formatOrderDisplayText).filter(Boolean).slice(0, 12).join('；');
}

function buildFallbackEmrContent(context: InpatientEmrContext): string {
  const registration = context.registration;
  const documentContext = context.documentContext;
  const doctorSupplement = context.doctorSupplement?.trim();
  const patientLine = [
    registration?.name || '患者',
    registration?.gender,
    registration?.ageText || registration?.inHospitalAgeText,
  ].filter(Boolean).join('，');
  const admissionTime = registration?.admissionTime ? `患者于${registration.admissionTime}入院。` : '';
  const allergyText = registration?.allergyText ? `过敏史：${registration.allergyText}。` : '过敏史未见明确记录。';
  const diagnosisText = formatDiagnosis(registration);
  const vitalsText = context.aiContext?.vitals?.summary
    || formatTemperatureNarrative(context.temperatureChart, documentContext.recordDate);
  const orderText = context.aiContext?.orders?.summary || formatOrderSummary(context.orders);
  const labText = context.aiContext?.labs?.summary;
  const previousRecordText = context.aiContext?.previousRecords?.recentNotes
    ?.map((note: { summary?: string }) => note.summary)
    .filter(Boolean)
    .slice(0, 2)
    .join('；');

  return [
    `${documentContext.recordDate}查房，${patientLine || '患者'}，入院诊断为${diagnosisText}。`,
    `${admissionTime}${allergyText}`,
    `${vitalsText}。`,
    `当前医嘱/检查信息包括：${orderText}。`,
    labText ? `近期检验检查摘要：${labText}。` : '',
    previousRecordText ? `前序病程摘要：${previousRecordText}。` : '',
    doctorSupplement ? `医生补充要点：${doctorSupplement}。` : '',
    doctorSupplement
      ? '综合 HIS 资料与医生补充要点，建议主管医生结合本次查体进一步审核病情判断和诊疗计划。本段为 AI 辅助草稿，需主管医生审核后签署。'
      : '综合现有住院登记、诊断、医嘱及生命体征资料，建议继续观察病情变化，关注体温、呼吸、血氧及血压趋势，按医嘱完善相关检查并根据结果调整诊疗计划。本段为 AI 辅助草稿，需主管医生结合查体和病情实际审核后签署。',
  ].filter(Boolean).join('\n');
}

function mergeGeneratedValues(
  fields: InpatientEmrTemplateField[],
  context: InpatientEmrContext,
  generatedValues: Record<string, unknown>,
): Record<string, string> {
  const values = buildDefaultFieldValues(fields, context);
  const aiFields = fields.filter((field) => field.aiSuitable);
  aiFields.forEach((field) => {
    const value = generatedValues[field.id];
    if (typeof value === 'string' && value.trim()) {
      values[field.id] = value.trim();
    }
  });

  const fallbackTarget = aiFields.find((field) => field.id === '病程记录文本') || aiFields[0];
  if (fallbackTarget && !values[fallbackTarget.id]?.trim()) {
    values[fallbackTarget.id] = buildFallbackEmrContent(context);
  }
  return values;
}

function buildGeneratedEmrText(
  fields: InpatientEmrTemplateField[],
  values: Record<string, string>,
  context: InpatientEmrContext,
): string {
  const aiFields = fields.filter((field) => field.aiSuitable);
  const progressText = values.病程记录文本;
  if (progressText?.trim()) return progressText.trim();
  const generated = aiFields
    .map((field) => values[field.id])
    .filter((value) => value?.trim())
    .join('\n\n');
  return generated || buildFallbackEmrContent(context);
}

interface RemoteInpatientEmrTemplateCache {
  templateHash?: string;
  cacheHit?: boolean;
  fields?: InpatientEmrTemplateField[];
}

function normalizeTemplateField(field: InpatientEmrTemplateField): InpatientEmrTemplateField {
  const rule = (field.rule || {}) as Partial<InpatientEmrTemplateField['rule']>;
  return {
    ...field,
    readonly: Boolean(field.readonly),
    key: Boolean(field.key),
    aiSuitable: Boolean(field.aiSuitable),
    rule: {
      ...rule,
      source: rule.source || 'manual_or_his',
      constraints: Array.isArray(rule.constraints) ? rule.constraints : [],
      dependencies: Array.isArray(rule.dependencies) ? rule.dependencies : [],
    },
  };
}

const defaultAiConstraints = [
  '仅依据已提供 HIS 数据生成，不补充未出现的检查结果或症状',
  '围绕字段含义生成对应段落，不跨字段混写其他模板项',
  '合理引用住院登记、诊断、医嘱和体温单中的客观信息',
  '保留医生最终审核空间，避免给出绝对疗效判断',
];

async function classifyUnknownFieldsWithLLM(
  unknownFields: InpatientEmrTemplateField[],
  recordType?: string,
  deptName?: string,
): Promise<Array<{ id: string; aiSuitable: boolean; meaning: string; source: string }>> {
  const prompt = [
    '你是一名严谨的住院电子病历模板字段分析专家。',
    '任务：分析以下未确定规则的病历字段，判断其是否适合由 AI 生成，并进行分类。',
    deptName ? `当前病区专科：${deptName}` : '',
    recordType ? `当前病历文书类型：${recordType}` : '',
    '判定标准：',
    '1. 适合由 AI 依据 HIS 住院诊疗数据书写大段正文、病程分析、诊疗经过或诊疗计划的，判定 aiSuitable 为 true，source 为 "ai"。',
    '2. 页眉、页脚、签名、纯客观系统/HIS 字段（如住院号、日期、时间等），判定 aiSuitable 为 false，source 为 "his_or_system"。',
    '3. 其他纯手动输入或带入不确定字段判定 aiSuitable 为 false，source 为 "manual_or_his"。',
    '输出格式：必须是严格的 JSON 数组，每一项结构如下：',
    '[{ "id": "字段ID", "aiSuitable": true, "meaning": "医疗含义详细说明", "source": "ai" }]',
    '请勿输出任何 Markdown 标记、JSON 外的解释说明或免责申明。',
    `待分析字段列表：\n${JSON.stringify(unknownFields.map(f => ({ id: f.id, name: f.name, defaultValue: f.defaultValue || '' })), null, 2)}`
  ].filter(Boolean).join('\n');

  try {
    const response = await chatFast([
      { role: 'system', content: '你只输出 JSON 数组，不包含 markdown 格式标记。' },
      { role: 'user', content: prompt }
    ], undefined, undefined, undefined, {
      configProfile: 'fast',
      traceContext: {
        scene: 'inpatient-emr-template-resolve',
        sourceModule: 'inpatient-emr',
        operationModule: 'inpatient-emr',
        operationAction: 'classify_unknown_fields',
        title: '分析病历模板未知字段',
      }
    });
    return parseLLMJson<any[]>(response);
  } catch (error) {
    console.warn('[InpatientEmr] LLM failed to classify unknown fields, using default manual fallback', error);
    return [];
  }
}

async function resolveInpatientEmrTemplate(
  request: InpatientEmrGenerationRequest,
  registration?: HisInpatientRegistrationInfo | null,
): Promise<InpatientEmrTemplateParseResult> {
  const localTemplate = parseInpatientEmrTemplate(request.htmlContent);

  const unknownFields = localTemplate.fields.filter((field) => field.presetStatus === 'unknown');
  if (unknownFields.length > 0) {
    console.log(`[InpatientEmr] 发现 ${unknownFields.length} 个未匹配预设字段，正在调用 LLM 进行智能特征分析...`);
    const classified = await classifyUnknownFieldsWithLLM(
      unknownFields,
      request.templateName,
      registration?.deptName || registration?.wardName,
    );
    const classifiedMap = new Map(classified.map((item) => [item.id, item]));

    localTemplate.fields = localTemplate.fields.map((field) => {
      if (field.presetStatus === 'unknown' && classifiedMap.has(field.id)) {
        const aiInfo = classifiedMap.get(field.id)!;
        const aiSuitable = Boolean(aiInfo.aiSuitable);
        return {
          ...field,
          aiSuitable,
          meaning: aiInfo.meaning || field.meaning,
          rule: {
            source: (aiInfo.source || (aiSuitable ? 'ai' : 'manual_or_his')) as any,
            dependencies: aiSuitable ? ['registration', 'registration.diagnoses', 'orders', 'temperatureChart'] : field.rule.dependencies,
            promptIntent: aiSuitable ? (field.id.toLowerCase().includes('cy') ? 'inpatientDischargeRecordSection' : 'inpatientRecordSection') : undefined,
            constraints: aiSuitable ? defaultAiConstraints : ['按系统事实填充或手工录入，AI不自由改写'],
          }
        };
      }
      return field;
    });
  }

  if (!isRegionalMode()) {
    return localTemplate;
  }

  try {
    const remote = await regionalPost<RemoteInpatientEmrTemplateCache>(
      '/v1/client/inpatient-emr/templates/resolve',
      {
        templateId: request.templateId,
        templateHash: localTemplate.cacheKey,
        templateName: request.templateName || '',
        htmlContent: request.htmlContent,
        fields: localTemplate.fields,
      },
    );
    const remoteFields = Array.isArray(remote.fields) ? remote.fields : [];
    if (remoteFields.length > 0) {
      return {
        cacheKey: remote.templateHash || localTemplate.cacheKey,
        cacheHit: Boolean(remote.cacheHit),
        fields: remoteFields.map(normalizeTemplateField),
      };
    }
  } catch (error) {
    console.warn('[InpatientEmr] remote template cache unavailable, using local parse result (LLM-enhanced)', error);
  }

  return localTemplate;
}

async function generateFieldValuesWithAi(
  fields: InpatientEmrTemplateField[],
  context: InpatientEmrContext,
): Promise<Record<string, unknown>> {
  const prompt = buildInpatientEmrGeneratePrompt(fields, context);
  const response = await chatFast([
    { role: 'system', content: '你是严谨的住院病历辅助书写助手，只输出 JSON。' },
    { role: 'user', content: `${INPATIENT_EMR_TEMPLATE_PARSE_PROMPT}\n\n${prompt}` },
  ], undefined, undefined, undefined, {
    configProfile: 'fast',
    traceContext: {
      scene: 'inpatient-emr-generate',
      sourceModule: 'inpatient-emr',
      operationModule: 'inpatient-emr',
      operationAction: 'generate_record',
      title: '住院病历辅助生成',
    },
  });
  return parseLLMJson<Record<string, unknown>>(response);
}

interface LoadedInpatientHisContext {
  registration: HisInpatientRegistrationInfo | null;
  orders: HisInpatientOrder[];
  temperatureChart: HisInpatientTemperatureChart | null;
  aiContext: HisInpatientEmrContextPackage;
}

function getArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function buildClinicalSummaryProgressDetail(
  aiContext: HisInpatientEmrContextPackage,
  orders: HisInpatientOrder[],
): string {
  const labCount = getArrayCount(aiContext.labs?.abnormal) + getArrayCount(aiContext.labs?.recentKeyResults);
  const examCount = getArrayCount(aiContext.exams);
  return [
    `诊断 ${aiContext.diagnoses?.length || 0} 条`,
    `医嘱 ${orders.length} 条`,
    labCount > 0 ? `检验 ${labCount} 项` : '',
    examCount > 0 ? `检查 ${examCount} 项` : '',
  ].filter(Boolean).join(' / ') || '已整理诊疗摘要';
}

function buildEvidenceProgressDetail(
  aiContext: HisInpatientEmrContextPackage,
  temperatureChart: HisInpatientTemperatureChart | null,
): string {
  const previousRecordCount = getArrayCount(aiContext.previousRecords?.recentNotes);
  const consultationCount = getArrayCount(aiContext.consultations);
  const operations = (aiContext.operations || []) as unknown;
  const operationCount = Array.isArray(operations)
    ? operations.length
    : getArrayCount((operations as { applications?: unknown[] })?.applications);
  const vitalsText = aiContext.vitals?.summary
    ? '生命体征已整理'
    : `生命体征 ${temperatureChart?.records.length || 0} 条`;
  return [
    vitalsText,
    previousRecordCount > 0 ? `历史病历 ${previousRecordCount} 份` : '',
    consultationCount > 0 ? `会诊 ${consultationCount} 条` : '',
    operationCount > 0 ? `手术 ${operationCount} 条` : '',
  ].filter(Boolean).join(' / ') || '已整理病历依据';
}

function reportLoadedContextProgress(
  onProgress: InpatientEmrProgressHandler | undefined,
  aiContext: HisInpatientEmrContextPackage,
  registration: HisInpatientRegistrationInfo | null,
  orders: HisInpatientOrder[],
  temperatureChart: HisInpatientTemperatureChart | null,
  admissionId: string,
  sourceLabel: string,
): void {
  report(onProgress, {
    key: 'patient',
    status: 'done',
    detail: registration?.name
      ? `${sourceLabel}：${registration.name} / ${registration.inpatientNo || admissionId}`
      : `${sourceLabel}：已获取住院上下文`,
  });
  report(onProgress, { key: 'orders', status: 'running', detail: '正在整理诊断、医嘱、检验检查摘要' });
  report(onProgress, {
    key: 'orders',
    status: 'done',
    detail: buildClinicalSummaryProgressDetail(aiContext, orders),
  });
  report(onProgress, { key: 'temperature', status: 'running', detail: '正在整理生命体征、历史病历和会诊手术资料' });
  report(onProgress, {
    key: 'temperature',
    status: 'done',
    detail: buildEvidenceProgressDetail(aiContext, temperatureChart),
  });
}

async function loadInpatientEmrHisContext(
  request: InpatientEmrGenerationRequest,
  documentContext: InpatientEmrDocumentContext,
  onProgress?: InpatientEmrProgressHandler,
): Promise<LoadedInpatientHisContext> {
  const adapter = getHisAdapter();
  const query: HisInpatientQuery = { admissionId: request.admissionId };

  const requestContext = mergeDocumentContextIntoHisContext(request.hisContext, documentContext, request.admissionId);
  if (requestContext) {
    const registration = buildRegistrationFromAiContext(requestContext, query);
    const orders = buildOrdersFromAiContext(requestContext);
    const temperatureChart = buildTemperatureChartFromAiContext(requestContext, query);
    report(onProgress, { key: 'patient', status: 'running', detail: '正在读取 HIS 住院上下文包' });
    reportLoadedContextProgress(
      onProgress,
      requestContext,
      registration,
      orders,
      temperatureChart,
      request.admissionId,
      '已使用 HIS 上下文包',
    );
    return {
      registration,
      orders,
      temperatureChart,
      aiContext: requestContext,
    };
  }

  if (!adapter) {
    throw new Error('HIS 适配器未就绪，请先完成 SDK 握手后再生成住院病历');
  }

  report(onProgress, { key: 'patient', status: 'running', detail: '正在获取 HIS 住院上下文' });
  const packageContext = await adapter.fetchInpatientEmrContext({
    ...query,
    templateId: request.templateId,
    templateName: request.templateName,
    recordTime: documentContext.recordTime,
    recordDate: documentContext.recordDate,
    contextPolicy: request.contextPolicy,
  });
  const aiContext = mergeDocumentContextIntoHisContext(packageContext || undefined, documentContext, request.admissionId);
  if (!aiContext) {
    throw new Error('HIS 聚合服务未返回有效住院病历上下文');
  }
  const registration = buildRegistrationFromAiContext(aiContext, query);
  const orders = buildOrdersFromAiContext(aiContext);
  const temperatureChart = buildTemperatureChartFromAiContext(aiContext, query);
  reportLoadedContextProgress(
    onProgress,
    aiContext,
    registration,
    orders,
    temperatureChart,
    request.admissionId,
    '患者信息',
  );
  return {
    registration,
    orders,
    temperatureChart,
    aiContext,
  };
}

export async function generateInpatientEmrPreview(
  request: InpatientEmrGenerationRequest,
  onProgress?: InpatientEmrProgressHandler,
): Promise<InpatientEmrGenerationResult> {
  const documentContext = buildDocumentContext(request);
  const {
    registration,
    orders,
    temperatureChart,
    aiContext,
  } = await loadInpatientEmrHisContext(request, documentContext, onProgress);

  report(onProgress, { key: 'template', status: 'running', detail: '正在解析病历模板字段' });
  const template = await resolveInpatientEmrTemplate(request, registration);
  report(onProgress, {
    key: 'template',
    status: 'done',
    detail: `${template.cacheHit ? '服务端缓存命中' : '模板已解析'}，字段 ${template.fields.length} 个`,
  });

  const context: InpatientEmrContext = {
    documentContext,
    doctorSupplement: request.doctorSupplement?.trim() || undefined,
    aiContext,
    registration,
    orders,
    temperatureChart,
  };

  report(onProgress, { key: 'generate', status: 'running', detail: '正在生成病历草稿' });
  let generatedValues: Record<string, unknown>;
  try {
    generatedValues = await generateFieldValuesWithAi(template.fields, context);
  } catch (error) {
    console.warn('[InpatientEmr] AI generation failed, using fallback draft', error);
    generatedValues = { 病程记录文本: buildFallbackEmrContent(context) };
  }

  const fieldValues = mergeGeneratedValues(template.fields, context, generatedValues);
  const htmlContent = fillInpatientEmrTemplateHtml(request.htmlContent, fieldValues);
  const preview: InpatientEmrGeneratedPreview = {
    emrContent: buildGeneratedEmrText(template.fields, fieldValues, context),
    htmlContent,
    fieldValues,
  };
  report(onProgress, { key: 'generate', status: 'done', detail: '病历草稿已生成' });

  return {
    ...preview,
    request,
    context,
    template,
    generatedAt: Date.now(),
  };
}

/**
 * 简易的流式不完整 JSON 提取器。
 * 能够从正在生成的 JSON 字符串片段中，流式解析提取出 fieldKeys 对应字段当前累加的值。
 */
export function parsePartialJson(jsonStr: string, fieldKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  fieldKeys.forEach((key) => {
    // 匹配: "key"\s*:\s*"
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`"${escapedKey}"\\s*:\\s*"`);
    const match = jsonStr.match(prefixRegex);
    if (match && match.index !== undefined) {
      const startIdx = match.index + match[0].length;
      let val = '';
      let i = startIdx;
      let escaped = false;
      while (i < jsonStr.length) {
        const char = jsonStr[i];
        if (escaped) {
          if (char === 'n') val += '\n';
          else if (char === 't') val += '\t';
          else if (char === 'r') val += '\r';
          else val += char;
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          // 遇到合法的非转义闭合引号，表明该字段已全部生成完
          break;
        } else {
          val += char;
        }
        i++;
      }
      result[key] = val;
    }
  });
  return result;
}

/**
 * 流式住院病历生成服务。
 * 解析病历后，先通过 onStreamResult 返回一个包含默认值的空白模板，然后流式读取 AI 生成的段落并同步推送到前端中。
 */
export async function generateInpatientEmrPreviewStream(
  request: InpatientEmrGenerationRequest,
  onProgress?: InpatientEmrProgressHandler,
  onStreamResult?: (partialResult: InpatientEmrGenerationResult) => void,
): Promise<InpatientEmrGenerationResult> {
  const documentContext = buildDocumentContext(request);
  const {
    registration,
    orders,
    temperatureChart,
    aiContext,
  } = await loadInpatientEmrHisContext(request, documentContext, onProgress);

  report(onProgress, { key: 'template', status: 'running', detail: '正在解析病历模板字段' });
  const template = await resolveInpatientEmrTemplate(request, registration);
  report(onProgress, {
    key: 'template',
    status: 'done',
    detail: `${template.cacheHit ? '服务端缓存命中' : '模板已解析'}，字段 ${template.fields.length} 个`,
  });

  const context: InpatientEmrContext = {
    documentContext,
    doctorSupplement: request.doctorSupplement?.trim() || undefined,
    aiContext,
    registration,
    orders,
    temperatureChart,
  };

  // 1. 在 AI 生成前，先渲染出病历框架和基础信息，实现“秒开”预览模板的效果
  const initialFieldValues = buildDefaultFieldValues(template.fields, context);
  const initialHtml = fillInpatientEmrTemplateHtml(request.htmlContent, initialFieldValues);
  const initialResult: InpatientEmrGenerationResult = {
    emrContent: buildGeneratedEmrText(template.fields, initialFieldValues, context),
    htmlContent: initialHtml,
    fieldValues: initialFieldValues,
    request,
    context,
    template,
    generatedAt: Date.now(),
  };
  onStreamResult?.(initialResult);

  // 2. 启动 AI 生成，采用流式调用并在每次 chunk 到达时，提取局部 JSON 键值注入
  report(onProgress, { key: 'generate', status: 'running', detail: '正在生成病历草稿' });
  
  let accumulatedResponse = '';
  const aiFieldKeys = template.fields.filter((field) => field.aiSuitable).map((field) => field.id);

  try {
    const prompt = buildInpatientEmrGeneratePrompt(template.fields, context);
    await chatStreamWithFallback(
      [
        { role: 'system', content: '你是严谨的住院病历辅助书写助手，只输出 JSON。' },
        { role: 'user', content: `${INPATIENT_EMR_TEMPLATE_PARSE_PROMPT}\n\n${prompt}` },
      ],
      (chunk) => {
        accumulatedResponse += chunk;
        const partialValues = parsePartialJson(accumulatedResponse, aiFieldKeys);
        const currentFieldValues = mergeGeneratedValues(template.fields, context, partialValues);
        const currentHtml = fillInpatientEmrTemplateHtml(request.htmlContent, currentFieldValues);
        const partialResult: InpatientEmrGenerationResult = {
          emrContent: buildGeneratedEmrText(template.fields, currentFieldValues, context),
          htmlContent: currentHtml,
          fieldValues: currentFieldValues,
          request,
          context,
          template,
          generatedAt: Date.now(),
        };
        onStreamResult?.(partialResult);
      },
      undefined,
      undefined,
      undefined,
      {
        configProfile: 'fast',
        traceContext: {
          scene: 'inpatient-emr-generate',
          sourceModule: 'inpatient-emr',
          operationModule: 'inpatient-emr',
          operationAction: 'generate_record_stream',
          title: '住院病历流式辅助生成',
        },
      }
    );
  } catch (error) {
    console.warn('[InpatientEmr] AI generation stream failed, using fallback draft', error);
    const fallbackValues = { 病程记录文本: buildFallbackEmrContent(context) };
    const currentFieldValues = mergeGeneratedValues(template.fields, context, fallbackValues);
    const currentHtml = fillInpatientEmrTemplateHtml(request.htmlContent, currentFieldValues);
    const partialResult: InpatientEmrGenerationResult = {
      emrContent: buildGeneratedEmrText(template.fields, currentFieldValues, context),
      htmlContent: currentHtml,
      fieldValues: currentFieldValues,
      request,
      context,
      template,
      generatedAt: Date.now(),
    };
    onStreamResult?.(partialResult);
    accumulatedResponse = JSON.stringify(fallbackValues);
  }

  // 3. 流式结束后做一次最终校验与状态确认
  let finalGeneratedValues: Record<string, unknown>;
  try {
    finalGeneratedValues = parseLLMJson<Record<string, unknown>>(accumulatedResponse);
  } catch (error) {
    console.warn('[InpatientEmr] Final JSON parse failed, using partial values', error);
    finalGeneratedValues = parsePartialJson(accumulatedResponse, aiFieldKeys);
  }

  const finalFieldValues = mergeGeneratedValues(template.fields, context, finalGeneratedValues);
  const finalHtml = fillInpatientEmrTemplateHtml(request.htmlContent, finalFieldValues);
  const finalPreview: InpatientEmrGeneratedPreview = {
    emrContent: buildGeneratedEmrText(template.fields, finalFieldValues, context),
    htmlContent: finalHtml,
    fieldValues: finalFieldValues,
  };

  report(onProgress, { key: 'generate', status: 'done', detail: '病历草稿已生成' });

  const finalResult: InpatientEmrGenerationResult = {
    ...finalPreview,
    request,
    context,
    template,
    generatedAt: Date.now(),
  };

  onStreamResult?.(finalResult);
  return finalResult;
}

export function getLatestTemperatureRecord(
  chart: HisInpatientTemperatureChart | null,
): HisInpatientTemperatureRecord | null {
  return chart?.records?.[0] || null;
}
