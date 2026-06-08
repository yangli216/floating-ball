import { chatFast } from '@/services/llm';
import { getHisAdapter } from '@/services/his';
import { isRegionalMode, regionalPost } from '@/services/regionalClient';
import type {
  HisInpatientOrder,
  HisInpatientRegistrationInfo,
  HisInpatientTemperatureChart,
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
  parseInpatientEmrTemplate,
} from '../lib/inpatientEmrTemplate';
import type {
  InpatientEmrContext,
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

function formatLatestVitals(chart: HisInpatientTemperatureChart | null): string {
  const record = chart?.todayRecords?.[0] || chart?.records?.[0];
  if (!record) return '暂无体温单数据';
  const fragments: string[] = [];
  if (typeof record.temperature === 'number') {
    fragments.push(`${record.temperatureType || '体温'}${record.temperature}℃`);
  }
  if (typeof record.bloodPressureSystolic === 'number' || typeof record.bloodPressureDiastolic === 'number') {
    fragments.push(`血压${record.bloodPressureSystolic ?? '-'}/${record.bloodPressureDiastolic ?? '-'}mmHg`);
  }
  if (typeof record.respiration === 'number') {
    fragments.push(`呼吸${record.respiration}次/分`);
  }
  if (typeof record.spo2 === 'number') {
    fragments.push(`血氧饱和度${record.spo2}%`);
  }
  return fragments.length > 0 ? fragments.join('，') : record.detailText || '暂无结构化生命体征';
}

function formatOrderSummary(orders: HisInpatientOrder[]): string {
  if (orders.length === 0) return '暂无当日医嘱数据';
  return orders.map((item) => item.name).filter(Boolean).slice(0, 12).join('；');
}

function buildFallbackEmrContent(context: InpatientEmrContext): string {
  const registration = context.registration;
  const patientLine = [
    registration?.name || '患者',
    registration?.gender,
    registration?.ageText || registration?.inHospitalAgeText,
  ].filter(Boolean).join('，');
  const admissionTime = registration?.admissionTime ? `患者于${registration.admissionTime}入院。` : '';
  const allergyText = registration?.allergyText ? `过敏史：${registration.allergyText}。` : '过敏史未见明确记录。';
  const diagnosisText = formatDiagnosis(registration);
  const vitalsText = formatLatestVitals(context.temperatureChart);
  const orderText = formatOrderSummary(context.orders);

  return [
    `今日查房，${patientLine || '患者'}，入院诊断为${diagnosisText}。`,
    `${admissionTime}${allergyText}`,
    `体温单及生命体征资料显示：${vitalsText}。`,
    `当前医嘱/检查信息包括：${orderText}。`,
    '综合现有住院登记、诊断、医嘱及生命体征资料，建议继续观察病情变化，关注体温、呼吸、血氧及血压趋势，按医嘱完善相关检查并根据结果调整诊疗计划。本段为 AI 辅助草稿，需主管医生结合查体和病情实际审核后签署。',
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

async function resolveInpatientEmrTemplate(
  request: InpatientEmrGenerationRequest,
): Promise<InpatientEmrTemplateParseResult> {
  const localTemplate = parseInpatientEmrTemplate(request.htmlContent);
  if (!isRegionalMode()) {
    return localTemplate;
  }

  try {
    const remote = await regionalPost<RemoteInpatientEmrTemplateCache>(
      '/v1/client/inpatient-emr/templates/resolve',
      {
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
    console.warn('[InpatientEmr] remote template cache unavailable, using local parse result', error);
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

export async function generateInpatientEmrPreview(
  request: InpatientEmrGenerationRequest,
  onProgress?: InpatientEmrProgressHandler,
): Promise<InpatientEmrGenerationResult> {
  const adapter = getHisAdapter();
  if (!adapter) {
    throw new Error('HIS 适配器未就绪，请先完成 SDK 握手后再生成住院病历');
  }

  const query = { admissionId: request.admissionId };

  report(onProgress, { key: 'patient', status: 'running', detail: '正在读取住院登记与诊断' });
  const registration = await adapter.fetchInpatientRegistration(query);
  report(onProgress, {
    key: 'patient',
    status: 'done',
    detail: registration?.name ? `${registration.name} / ${registration.inpatientNo || request.admissionId}` : '已读取住院登记',
  });

  report(onProgress, { key: 'orders', status: 'running', detail: '正在读取住院医嘱' });
  const orders = await adapter.fetchInpatientOrders(query);
  report(onProgress, { key: 'orders', status: 'done', detail: `医嘱 ${orders.length} 条` });

  report(onProgress, { key: 'temperature', status: 'running', detail: '正在读取体温单数据' });
  const temperatureChart = await adapter.fetchInpatientTemperatureChart(query);
  report(onProgress, {
    key: 'temperature',
    status: 'done',
    detail: `体温单 ${temperatureChart?.records.length || 0} 条`,
  });

  report(onProgress, { key: 'template', status: 'running', detail: '正在解析病历模板字段' });
  const template = await resolveInpatientEmrTemplate(request);
  report(onProgress, {
    key: 'template',
    status: 'done',
    detail: `${template.cacheHit ? '服务端缓存命中' : '模板已解析'}，字段 ${template.fields.length} 个`,
  });

  const context: InpatientEmrContext = { registration, orders, temperatureChart };

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

export function getLatestTemperatureRecord(
  chart: HisInpatientTemperatureChart | null,
): HisInpatientTemperatureRecord | null {
  return chart?.records?.[0] || null;
}
