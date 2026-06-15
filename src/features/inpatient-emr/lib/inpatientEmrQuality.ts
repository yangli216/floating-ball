import { isAdmissionTemplate } from './inpatientEmrTemplate';
import type {
  InpatientEmrGenerationResult,
  InpatientEmrQualityIssue,
  InpatientEmrTemplateField,
} from '../types';

const PLACEHOLDER_PATTERNS = [
  /请.{0,8}审核.{0,8}补充/,
  /请结合.{0,16}审核/,
  /待补充/,
  /待完善/,
  /暂无明确/,
  /未提供/,
];

const NARRATIVE_FIELD_KEYWORDS = [
  '文本',
  '记录',
  '病程',
  '主诉',
  '现病史',
  '入院情况',
  '诊疗计划',
  '治疗经过',
  '病情',
  '分析',
];

function normalizeText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function fieldLabel(field: InpatientEmrTemplateField): string {
  return field.name || field.id;
}

function isNarrativeField(field: InpatientEmrTemplateField): boolean {
  const text = `${field.id} ${field.name || ''} ${field.meaning || ''}`;
  return NARRATIVE_FIELD_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function pushIssue(
  issues: InpatientEmrQualityIssue[],
  issue: InpatientEmrQualityIssue,
): void {
  if (issues.some((item) => item.id === issue.id)) return;
  issues.push(issue);
}

export function buildInpatientEmrQualityIssues(
  result: InpatientEmrGenerationResult,
): InpatientEmrQualityIssue[] {
  const issues: InpatientEmrQualityIssue[] = [];
  const aiFields = result.template.fields.filter((field) => field.aiSuitable);
  const aiContext = result.context.aiContext;
  const dataQuality = aiContext?.dataQuality;

  if (aiFields.length === 0) {
    pushIssue(issues, {
      id: 'no-ai-fields',
      severity: 'high',
      title: '没有可回写的 AI 字段',
      description: '当前模板未识别到适合 AI 生成的字段，本次 fieldValues 可能为空，请确认模板 data-id 和字段配置。',
    });
  }

  aiFields.forEach((field) => {
    const value = normalizeText(result.fieldValues[field.id]);
    const label = fieldLabel(field);

    if (!value) {
      pushIssue(issues, {
        id: `empty-field:${field.id}`,
        severity: 'high',
        title: `${label} 为空`,
        description: '该字段会参与本次回写，但当前没有可回填内容，请返回预览补齐或确认 HIS 侧允许空值。',
        fieldId: field.id,
      });
      return;
    }

    if (isNarrativeField(field) && value.length < 20) {
      pushIssue(issues, {
        id: `short-field:${field.id}`,
        severity: 'medium',
        title: `${label} 内容偏短`,
        description: '正文类字段当前内容很短，可能不足以形成完整病历段落，请确认预览内容已经符合书写要求。',
        fieldId: field.id,
      });
    }

    if (hasPlaceholderText(value)) {
      pushIssue(issues, {
        id: `placeholder-field:${field.id}`,
        severity: 'medium',
        title: `${label} 含待确认表述`,
        description: '字段中仍存在“请审核补充 / 待补充 / 未提供”等占位或提示性文字，建议回到预览中改成正式病历内容。',
        fieldId: field.id,
      });
    }
  });

  if (!aiContext) {
    pushIssue(issues, {
      id: 'missing-his-context',
      severity: 'high',
      title: '住院上下文缺失',
      description: '本次生成未取得 HIS 住院聚合上下文，病历内容可能只来自模板或兜底草稿，请确认后再回写。',
    });
  }

  if (result.evidenceSummary.hisContext.status === 'failed' || result.evidenceSummary.hisContext.status === 'missing') {
    pushIssue(issues, {
      id: 'his-context-evidence-risk',
      severity: 'high',
      title: '生成依据中的住院上下文不可用',
      description: result.evidenceSummary.hisContext.detail || '住院上下文未参与生成，请确认病历依据是否充分。',
    });
  }

  if (result.evidenceSummary.aiGeneration.meta?.fallbackUsed) {
    pushIssue(issues, {
      id: 'ai-generation-fallback',
      severity: 'medium',
      title: 'AI 生成使用了兜底草稿',
      description: '生成过程中 AI 响应失败或解析异常，当前内容可能来自本地兜底，请重点检查预览正文。',
    });
  }

  if (result.evidenceSummary.aiGeneration.meta?.waitingForInput) {
    pushIssue(issues, {
      id: 'ai-generation-waiting-input',
      severity: 'high',
      title: '缺少入院记录书写依据',
      description: '当前生成仍处于等待补充要点或门诊病历依据状态，请补充材料后重新生成。',
    });
  }

  if (dataQuality?.truncated) {
    pushIssue(issues, {
      id: 'his-context-truncated',
      severity: 'medium',
      title: '住院上下文已被裁剪',
      description: dataQuality.truncatedReason || 'HIS 上下文因数据量较大被裁剪，建议确认关键病史、医嘱和检验检查是否已体现在预览中。',
    });
  }

  if (dataQuality?.hasRecordDateVitals === false) {
    pushIssue(issues, {
      id: 'record-date-vitals-missing',
      severity: 'medium',
      title: '本次书写日期缺少体温单记录',
      description: dataQuality.latestVitalsDate
        ? `未找到书写日期当天体温单，最近一次记录为 ${dataQuality.latestVitalsDate}，请确认正文未误写成今日体征。`
        : '未找到书写日期当天体温单，请确认正文中的生命体征日期表述准确。',
    });
  }

  if (result.context.outpatientRecord?.contentPending) {
    pushIssue(issues, {
      id: 'outpatient-record-content-pending',
      severity: 'medium',
      title: '门诊病历正文未成功读取',
      description: '已获取门诊文书列表但未取得正文，入院记录可能缺少门诊主诉和现病史依据。',
    });
  }

  if (
    isAdmissionTemplate(result.request.templateName || '')
    && !normalizeText(result.context.doctorSupplement)
    && !normalizeText(result.context.outpatientRecord?.plainText)
  ) {
    pushIssue(issues, {
      id: 'admission-missing-outpatient-and-supplement',
      severity: 'medium',
      title: '入院记录缺少门诊正文或补充要点',
      description: '入院记录通常需要结合门诊病历或医生补充要点重新组织病史，请确认当前住院上下文已足够支撑预览内容。',
    });
  }

  return issues;
}
