import type { InpatientEmrContext, InpatientEmrTemplateField } from '../types';

export const INPATIENT_EMR_TEMPLATE_PARSE_PROMPT = [
  '你是一名住院电子病历模板解析助手。',
  '任务：解析输入的 EMR HTML 模板，提取可由 AI 生成或应由 HIS/系统填充的字段。',
  '输出 JSON 数组，每项包含 dataId、meaning、aiSuitable、source、dependencies、constraints。',
  '判定规则：患者身份、页眉、住院号、床号、记录时间、医生签名不得由 AI 自由生成；病程记录正文可由 AI 基于 HIS 住院数据生成。',
].join('\n');

export function buildInpatientEmrFieldPrompt(field: InpatientEmrTemplateField): string {
  if (field.rule.prompt?.trim()) {
    return field.rule.prompt.trim();
  }
  return [
    `字段 data-id：${field.id}`,
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
    '生成约束：',
    '1. 只能使用输入数据，不编造未提供的症状、查体、检查结果或治疗效果。',
    '2. 严格围绕字段含义生成，不跨字段混写其他模板项。',
    '3. 非 AI 字段由 HIS 或系统填充，不要输出。',
    '4. 输出为医生可审核草稿，不替代医生签署。',
    `AI_FIELDS=${JSON.stringify(aiFields, null, 2)}`,
    `FIELD_PROMPTS=${aiFields.map(buildInpatientEmrFieldPrompt).join('\n\n---\n\n')}`,
    `INPATIENT_CONTEXT=${JSON.stringify(context, null, 2)}`,
  ].join('\n');
}
