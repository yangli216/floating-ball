import { chat, type ChatMessage } from '@/services/llm';
import type {
  ChronicDiseasePatientSummary,
  HealthPrescriptionDraft,
  HealthPrescriptionSuggestion,
  PrescriptionSuggestionCategory,
} from '../types';

interface AiSuggestion {
  category?: string;
  title?: string;
  detail?: string;
  reason?: string;
}

interface AiDraft {
  summary?: string;
  suggestions?: AiSuggestion[];
  safetyNote?: string;
}

const ALLOWED_CATEGORIES = new Set<PrescriptionSuggestionCategory>([
  'test',
  'medicine-review',
  'lifestyle',
]);

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function parseJsonObject<T>(text: string): T {
  const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match?.[0] || cleaned) as T;
}

function controlledFallback(summary: ChronicDiseasePatientSummary): HealthPrescriptionDraft {
  const diseaseLabels = summary.diseaseTags.map((item) => item.label).join('、') || '当前慢病';
  const suggestions: HealthPrescriptionSuggestion[] = [];

  if (summary.diseaseTags.some((item) => item.diseaseType === 'hypertension')) {
    suggestions.push({
      id: 'fallback-bp-monitoring',
      category: 'lifestyle',
      title: '家庭血压监测',
      detail: '按医生确认的时间段记录早晚血压，并在复诊时携带完整记录。',
      reason: summary.bloodPressurePoints.length > 0
        ? `当前可追溯到 ${summary.bloodPressurePoints.length} 条血压记录。`
        : '当前缺少连续血压记录，需要先补充真实监测数据。',
      accepted: false,
    });
  }

  if (summary.diseaseTags.some((item) => item.diseaseType === 'type2_diabetes')) {
    suggestions.push({
      id: 'fallback-glucose-review',
      category: 'test',
      title: '复核糖代谢与并发症筛查记录',
      detail: '由医生结合近期空腹/餐后血糖、糖化血红蛋白及肾脏、眼底、足部筛查记录决定是否补充检查。',
      reason: summary.bloodGlucosePoints.length > 0
        ? `当前可追溯到 ${summary.bloodGlucosePoints.length} 条血糖记录。`
        : '当前未取得可解析的结构化血糖记录。',
      accepted: false,
    });
  }

  if (summary.recentMedicationNames.length > 0) {
    suggestions.push({
      id: 'fallback-medicine-review',
      category: 'medicine-review',
      title: '复核当前用药与依从性',
      detail: `核对当前记录中的 ${summary.recentMedicationNames.slice(0, 3).join('、')}，确认真实用法、不良反应和依从性。`,
      reason: '仅提示复核，不自动新增、停用或调整药物。',
      accepted: false,
    });
  }

  suggestions.push({
    id: 'fallback-lifestyle',
    category: 'lifestyle',
    title: '个体化生活方式目标',
    detail: '由医生结合饮食、运动能力、体重和既往习惯，确认可执行的小目标与复核日期。',
    reason: '生活方式建议需要结合患者实际能力，不能由系统自动套用固定目标。',
    accepted: false,
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'controlled-fallback',
    summary: `已基于${diseaseLabels}的正式规则生成受控复核草稿。`,
    suggestions,
    safetyNote: '草稿仅供医生确认，不能替代正式药品处方、急诊处置或转诊判断。',
  };
}

function sanitizeAiDraft(
  raw: AiDraft,
  fallback: HealthPrescriptionDraft,
): HealthPrescriptionDraft {
  const suggestions = (raw.suggestions || [])
    .map((item, index): HealthPrescriptionSuggestion | null => {
      const category = cleanText(item.category, 32) as PrescriptionSuggestionCategory;
      const title = cleanText(item.title, 80);
      const detail = cleanText(item.detail, 300);
      const reason = cleanText(item.reason, 200);
      if (!ALLOWED_CATEGORIES.has(category) || !title || !detail || !reason) return null;
      return {
        id: `ai-${category}-${index}`,
        category,
        title,
        detail,
        reason,
        accepted: false,
      };
    })
    .filter((item): item is HealthPrescriptionSuggestion => Boolean(item))
    .slice(0, 8);

  if (suggestions.length === 0) return fallback;
  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    summary: cleanText(raw.summary, 240) || fallback.summary,
    suggestions,
    safetyNote: cleanText(raw.safetyNote, 240) || fallback.safetyNote,
  };
}

export async function generateHealthPrescriptionDraft(
  summary: ChronicDiseasePatientSummary,
): Promise<HealthPrescriptionDraft> {
  const fallback = controlledFallback(summary);
  const evidence = {
    diseaseTags: summary.diseaseTags,
    diagnosisText: summary.diagnosisText,
    bloodPressure: summary.bloodPressurePoints.slice(-6),
    bloodGlucose: summary.bloodGlucosePoints.slice(-6),
    recentMedicationNames: summary.recentMedicationNames,
    latestDataAt: summary.latestDataAt,
  };
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        '你是基层医生的慢病健康处方草稿助手。',
        '只能基于输入事实和已发布规则生成医生确认前草稿，不能修改正式规则或患者事实。',
        '不得直接下达新药处方、停药或调药；涉及药物时只能提出复核点。',
        '检查检验建议必须说明目的，生活方式建议必须可执行且避免绝对承诺。',
        '仅返回 JSON：{"summary":"","suggestions":[{"category":"test|medicine-review|lifestyle","title":"","detail":"","reason":""}],"safetyNote":""}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `患者证据：${JSON.stringify(evidence)}\n请生成不超过 8 项的个体化健康处方草稿。`,
    },
  ];

  try {
    const response = await chat(messages, undefined, undefined, undefined, {
      traceContext: {
        scene: 'chronic-health-prescription',
        sourceModule: 'chronic_disease',
        operationModule: 'chronic_disease',
        operationAction: 'generate_health_prescription',
        title: '生成慢病健康处方草稿',
        consultationId: summary.visitId || summary.patientId,
      },
    });
    return sanitizeAiDraft(parseJsonObject<AiDraft>(response), fallback);
  } catch (error) {
    console.warn('[HealthPrescription] AI draft generation failed, using controlled fallback:', error);
    return fallback;
  }
}
