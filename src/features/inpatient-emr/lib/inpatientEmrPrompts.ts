import type { InpatientEmrContext, InpatientEmrTemplateField } from '../types';

export const INPATIENT_EMR_TEMPLATE_PARSE_PROMPT = [
  '你是一名住院电子病历模板解析助手。',
  '任务：解析输入的 EMR HTML 模板，提取可由 AI 生成或应由 HIS/系统填充的字段。',
  '输出 JSON 数组，每项包含 dataId、meaning、aiSuitable、source、dependencies、constraints。',
  '判定规则：患者身份、页眉、住院号、床号、记录时间、医生签名不得由 AI 自由生成；病程记录正文可由 AI 基于 HIS 住院数据生成。',
].join('\n');

export function buildInpatientEmrFieldPrompt(
  field: InpatientEmrTemplateField,
  context?: InpatientEmrContext,
): string {
  if (field.rule.prompt?.trim()) {
    return field.rule.prompt.trim();
  }
  const documentContext = context?.documentContext;
  return [
    `模板名称：${documentContext?.templateName || '住院病历模板'}`,
    `记录类型：${documentContext?.recordType || '住院病程记录'}`,
    `目标书写时间：${documentContext?.recordTime || '当前业务时间'}`,
    `目标书写日期：${documentContext?.recordDate || '当前业务日期'}`,
    `字段 data-id：${field.id}`,
    `字段名称：${field.name || field.id}`,
    `字段所属段落：${field.article || '未标注段落'}`,
    `字段含义：${field.meaning}`,
    `生成意图：${field.rule.promptIntent || 'inpatientRecordSection'}`,
    `依赖数据：${(field.rule.dependencies || []).join('、') || '住院上下文'}`,
    `约束：${field.rule.constraints.join('；')}`,
    '输出要求：只生成该字段应回填的正文，不输出字段名、JSON、解释或免责声明。',
  ].join('\n');
}

export function buildInpatientEmrGeneratePrompt(
  fields: InpatientEmrTemplateField[],
  context: InpatientEmrContext,
): string {
  const aiFields = fields.filter((field) => field.aiSuitable);
  return [
    '你是一名住院电子病历辅助书写助手。',
    '任务：根据 AI 生成字段、HIS 住院数据和字段规则，生成字段取值 JSON。',
    '输出必须是 JSON 对象，key 为 AI 字段 data-id，value 为该字段应回填的文本。',
    `当前模板：${context.documentContext.templateName || '住院病历模板'}`,
    `当前记录类型：${context.documentContext.recordType || '住院病程记录'}`,
    `本次病程记录书写时间：${context.documentContext.recordTime}`,
    `本次病程记录书写日期：${context.documentContext.recordDate}`,
    '生成约束：',
    '1. 只能使用输入数据，不编造未提供的症状、查体、检查结果或治疗效果。',
    '2. 严格围绕字段含义生成，不跨字段混写其他模板项。',
    '3. 非 AI 字段由 HIS 或系统填充，不要输出。',
    '4. 输出为医生可审核草稿，不替代医生签署。',
    `5. 以 ${context.documentContext.recordDate} 作为“今日”和本次查房/记录日期；不得把体温单历史记录日期写成本次查房日期。`,
    '6. 若体温单存在本次书写日期同日数据，可写“今日体温单显示”；若最新体温单早于书写日期，必须写“最近一次体温单记录（YYYY-MM-DD）显示”，或说明本日体温单暂无记录。',
    '7. 优先使用 HIS_AI_CONTEXT 中的 summary、recentNotes、longStaySummary 等摘要；明细仅用于必要事实补充，避免把长住院全量历史逐条复述。',
    '8. 检验检查结果必须区分“异常结果/阳性结论/历史摘要”，没有提供结果时不要编造检查发现。',
    '9. 既往病程用于保持连续性，不要把前序记录的日期、体征或治疗效果误写成本次 recordDate 当天事实。',
    '10. 医嘱描述优先使用 orders.summary 或医嘱条目的 displayText；fullText 是 HIS 原始完整医嘱，name 通常是基础项目名。若 displayText/fullText 已包含剂量、用法、频次，不得再把 dose、route、frequency 重复拼接。',
    '11. previousRecords 中 medType=0 表示入院记录，已结构化抽取 chiefComplaint、presentIllness 和 structuredSections；生成病程时优先把主诉、现病史作为病史背景，不要复述整篇入院记录。medType=2 病案首页不应作为生成依据。',
    `AI_FIELDS=${JSON.stringify(aiFields, null, 2)}`,
    `FIELD_PROMPTS=${aiFields.map((field) => buildInpatientEmrFieldPrompt(field, context)).join('\n\n---\n\n')}`,
    `HIS_AI_CONTEXT=${JSON.stringify(context.aiContext || null, null, 2)}`,
    `INPATIENT_CONTEXT=${JSON.stringify(context, null, 2)}`,
  ].join('\n');
}
