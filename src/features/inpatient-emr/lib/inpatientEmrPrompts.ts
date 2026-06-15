import type { InpatientEmrContext, InpatientEmrTemplateField } from '../types';
import type { HisOutpatientMedicalRecord } from '@/services/his';
import { isAdmissionTemplate } from './inpatientEmrTemplate';

export const INPATIENT_EMR_TEMPLATE_PARSE_PROMPT = [
  '你是一名住院电子病历模板解析助手。',
  '任务：解析输入的 EMR HTML 模板，提取可由 AI 生成或应由 HIS/系统填充的字段。',
  '输出 JSON 数组，每项包含 dataId、meaning、aiSuitable、source、dependencies、constraints。',
  '判定规则：患者身份、页眉、住院号、床号、记录时间、医生签名不得由 AI 自由生成；病历正文（如主诉、现病史、病程记录正文、诊疗计划等）可由 AI 基于 HIS 住院数据生成。',
].join('\n');

export function formatOutpatientRecordForAi(record: HisOutpatientMedicalRecord | null | undefined): string {
  if (!record) return '';
  const parts: string[] = [];
  if (record.documentTitle) parts.push(`【门诊病历标题】${record.documentTitle}`);
  if (record.chiefComplaint) parts.push(`【门诊主诉】${record.chiefComplaint}`);
  if (record.historyOfPresentIllness) parts.push(`【门诊现病史】${record.historyOfPresentIllness}`);
  if (record.pastHistory) parts.push(`【门诊既往史】${record.pastHistory}`);
  if (record.physicalExamination) parts.push(`【门诊体格检查】${record.physicalExamination}`);
  if (record.auxiliaryExamination) parts.push(`【门诊辅助检查】${record.auxiliaryExamination}`);
  if (record.diagnosis) parts.push(`【门诊诊断】${record.diagnosis}`);
  if (record.treatmentPlan) parts.push(`【门诊处置/医嘱】${record.treatmentPlan}`);
  if (record.plainText) parts.push(`【门诊病历正文】${record.plainText}`);
  if (record.documents?.length) {
    parts.push(`【门诊病历文书列表】${record.documents.map((doc) => [
      doc.title,
      doc.titleTime || doc.createdAt,
      doc.documentId,
    ].filter(Boolean).join(' / ')).join('；')}`);
  }
  if (record.contentPending) {
    parts.push('【门诊病历正文状态】已获取文书列表，但正文内容暂不可用；禁止仅根据文书标题推断主诉、现病史、查体或诊疗事实。');
  }
  return parts.join('\n');
}

export function inferPromptIntentByRecordType(recordType: string, baseIntent: string): string {
  const type = (recordType || '').trim();
  if (type.includes('出院') || type.includes('cy')) {
    return 'inpatientDischargeRecordSection';
  }
  if (type.includes('交接') || type.includes('交班') || type.includes('接班')) {
    return 'inpatientHandoverRecordSection';
  }
  if (type.includes('转科') || type.includes('转入') || type.includes('转出')) {
    return 'inpatientTransferRecordSection';
  }
  if (type.includes('抢救') || type.includes('qj')) {
    return 'inpatientRescueRecordSection';
  }
  if (type.includes('术前') || type.includes('sq')) {
    return 'inpatientPreoperativeRecordSection';
  }
  if (type.includes('术后') || type.includes('sh')) {
    return 'inpatientPostoperativeRecordSection';
  }
  if (type.includes('阶段小结') || type.includes('小结')) {
    return 'inpatientStageSummarySection';
  }
  return baseIntent || 'inpatientRecordSection';
}

export function buildInpatientEmrFieldPrompt(
  field: InpatientEmrTemplateField,
  context?: InpatientEmrContext,
): string {
  if (field.rule.prompt?.trim()) {
    return field.rule.prompt.trim();
  }
  const documentContext = context?.documentContext;
  const rawIntent = field.rule.promptIntent || 'inpatientRecordSection';
  const inferredIntent = inferPromptIntentByRecordType(documentContext?.recordType || '', rawIntent);
  const fieldText = `${field.id} ${field.name} ${field.meaning}`.toLowerCase();
  const isAdmissionRecord = isAdmissionTemplate(documentContext?.templateName || '')
    || isAdmissionTemplate(documentContext?.recordType || '');
  const admissionFieldGuidance = isAdmissionRecord
    ? [
        '入院记录书写要求：门诊病历和医生补充要点都是来源材料，必须从本次入院记录角度综合重写，不得把门诊病历原文直接粘贴为本字段内容。',
        fieldText.includes('主诉')
          ? '主诉字段：围绕本次入院原因，归纳主要症状/体征及持续时间；可参考门诊主诉和补充要点，但需按入院记录主诉格式重新表述。'
          : '',
        fieldText.includes('现病史') || fieldText.includes('xbs')
          ? '现病史字段：按入院记录现病史逻辑组织起病、演变、门诊诊疗经过、入院原因及当前情况；门诊病历仅作为病史来源，需结合医生补充信息重写。'
          : '',
      ].filter(Boolean)
    : [];

  return [
    `模板名称：${documentContext?.templateName || '住院病历模板'}`,
    `记录类型：${documentContext?.recordType || '住院病程记录'}`,
    `目标书写时间：${documentContext?.recordTime || '当前业务时间'}`,
    `目标书写日期：${documentContext?.recordDate || '当前业务日期'}`,
    `字段名称：${field.name || field.id}`,
    `字段含义：${field.meaning}`,
    `生成意图：${inferredIntent}`,
    `依赖数据：${(field.rule.dependencies || []).join('、') || '住院上下文'}`,
    `约束：${field.rule.constraints.join('；')}`,
    ...admissionFieldGuidance,
    `请为字段标识为“${field.id}”的项仅生成应回填的正文内容，切勿输出字段名、JSON 结构、任何说明或免责声明。`,
  ].join('\n');
}

export function buildInpatientEmrGeneratePrompt(
  fields: InpatientEmrTemplateField[],
  context: InpatientEmrContext,
): string {
  const aiFields = fields.filter((field) => field.aiSuitable);
  const doctorSupplement = context.doctorSupplement?.trim();
  const outpatientReferenceText = formatOutpatientRecordForAi(context.outpatientRecord);
  const isAdmissionRecord = isAdmissionTemplate(context.documentContext.templateName || '')
    || isAdmissionTemplate(context.documentContext.recordType || '');
  return [
    '你是一名住院电子病历辅助书写助手。',
    '任务：根据 AI 生成字段、HIS 住院数据和字段规则，生成字段取值 JSON。',
    '输出必须是 JSON 对象，key 为 AI 字段 data-id，value 为该字段应回填的文本。',
    `当前模板：${context.documentContext.templateName || '住院病历模板'}`,
    `当前记录类型：${context.documentContext.recordType || '日常病历记录'}`,
    `本次病历记录书写时间：${context.documentContext.recordTime}`,
    `本次病历记录书写日期：${context.documentContext.recordDate}`,
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
    '10. 医嘱描述直接使用 HIS 提供的已规范格式化文本，无需自行重复拼接剂量、频次与用法。',
    '11. previousRecords 中 medType=0 表示入院记录，已结构化抽取 chiefComplaint、presentIllness 和 structuredSections；生成病程时优先把主诉、现病史作为病史背景，不要复述整篇入院记录。',
    '12. 针对长期住院且病情平稳无明显变化的患者，病程记录应重点概括今日生命体征与继续原治疗方案，行文保持精炼，避免无意义地机械重复既往病理事实。',
    '13. 书写逻辑链指引（隐式CoT思维）：在生成日常病程内容时，按照以下思维顺序逐步组织：① 概括今日患者的主观自觉症状与生命体征趋势；② 引用并分析最新检验检查数据（如有新出阳性/异常结果）与目前已执行的核心医嘱；③ 评估病情演变并给出后续明确的诊疗与随访计划。',
    '14. 严格保证各 AI 字段生成的正文边界独立。例如生成“诊疗经过”时切勿混写“入院情况”或“诊疗计划”等其他字段的内容，各字段应根据其特定的含义 and 约束精准独立作答，禁止内容交叉粘连。',
    '15. 若 HIS 诊疗数据中缺少本次记录日期当天的某些关键客观体征、检验检查数据，且医生未在补充要点中提及，AI 应当在对应字段正文中如实说明“本日体温单暂无记录”或“近期未做此项检查”，严禁以“患者病情好转/无异常”等主观臆断进行粉饰或忽略。',
    '16. 在生成主诉、现病史、既往史、查房记录等正文字段时，禁止在正文开头或段落中重复输出患者的基本身份信息（如患者姓名、性别、年龄、住院号等基本信息描述，因病历页眉中已有展示），应当直接开始书写对应的临床正文内容（如查房记录直接从今日病情写起，主诉直接书写主要症状与持续时间）。',
    isAdmissionRecord
      ? '17. 当前为入院记录/首次记录时，必须以“本次入院病历书写”为目标重组材料：门诊病历用于提供入院前病史、门诊诊疗经过和初步诊断，医生补充要点用于补充或校正最新事实；两者可以同时引用并综合判断，不是互斥来源。'
      : '',
    isAdmissionRecord
      ? '18. 严禁把门诊主诉、门诊现病史或门诊病历正文原样复制到入院记录字段。应结合住院登记、门诊病历和医生补充要点，按入院记录的主诉、现病史、入院情况等字段要求重新组织语言。'
      : '',
    doctorSupplement
      ? '19. 医生补充要点优先级高于 HIS 摘要和门诊病历中的模糊或较旧信息；可作为本次入院/查房的主观症状、查体发现、诊疗判断或计划依据，但不得扩展成补充要点之外的事实。'
      : '',
    outpatientReferenceText
      ? '20. 检测到医生引用了门诊病历（OUTPATIENT_RECORD_REFERENCE）。若引用中包含门诊主诉、现病史、诊断或“门诊病历正文”等事实，只能作为入院记录病史来源参考；若引用只包含文书列表且标记正文暂不可用，禁止根据文书标题扩展病史事实。'
      : '',
    doctorSupplement ? `DOCTOR_SUPPLEMENT=${doctorSupplement}` : '',
    outpatientReferenceText ? `OUTPATIENT_RECORD_REFERENCE=${outpatientReferenceText}` : '',
    `AI_FIELDS=${JSON.stringify(aiFields, null, 2)}`,
    `FIELD_PROMPTS=${aiFields.map((field) => buildInpatientEmrFieldPrompt(field, context)).join('\n\n---\n\n')}`,
    `HIS_AI_CONTEXT=${JSON.stringify(context.aiContext || null, null, 2)}`,
    `PATIENT_INFO=${JSON.stringify({
      name: context.registration?.name || '',
      gender: context.registration?.gender || '',
      age: context.registration?.ageText || context.registration?.inHospitalAgeText || '',
      inpatientNo: context.registration?.inpatientNo || '',
      bedNo: context.registration?.bedNo || '',
      admissionTime: context.registration?.admissionTime || '',
      allergyText: context.registration?.allergyText || '',
    }, null, 2)}`,
  ].join('\n');
}
