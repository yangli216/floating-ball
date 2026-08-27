import { parseLLMJson } from '@features/clinical-result/clinicalResultLlmJsonParser';
import { chatFast } from '@/services/llm';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';
import {
  normalizeChronicRefillMedicationAttributions,
  type ChronicRefillMedicationAttributionItem,
} from '../lib/chronicRefillMedicationAttribution';

interface RawMedicationAttributionResponse {
  assignments?: unknown;
}

function buildAttributionPrompt(candidate: ChronicRefillCandidate): string {
  const conditions = (candidate.conditions || []).map((condition) => ({
    id: condition.id,
    diagnosis: condition.diagnosis,
    diagnosisGroup: condition.diagnosisGroup,
  }));
  const medications = (candidate.medicationAttributions || []).map((item) => ({
    itemId: item.id,
    name: item.medication.name,
    spec: item.medication.spec || '',
    candidateConditionIds: item.candidateConditionIds,
  }));
  return JSON.stringify({ conditions, medications });
}

/**
 * 对同次多慢病的无归属处方做后台归类。
 * 模型输出仍需经过本地白名单和置信度门禁，最终由 scoped candidate 纯规则采用。
 */
export async function suggestChronicRefillMedicationAttributions(
  candidate: ChronicRefillCandidate,
): Promise<ChronicRefillMedicationAttributionItem[]> {
  const items = candidate.medicationAttributions || [];
  if (items.length === 0) return [];

  const response = await chatFast([
    {
      role: 'system',
      content: [
        '你是基层门诊历史处方归类助手。任务是判断同一次多慢病就诊中的每个药品最可能归属哪个既有慢病。',
        '只能从每个药品提供的 candidateConditionIds 中选择一个 conditionId；不得新增药品、诊断或修改 itemId。',
        '只有药品与某个慢病存在明确、常见且直接的治疗或长期管理关系时才归类。若多个诊断都合理、仅凭现有信息无法判断，conditionId 返回 null。',
        '医生已在胶囊确认本次慢病范围，归类结果会用于筛选历史续方候选，但不等于最终回写。confidence 只允许 high、medium、low；只有明确可归属时使用 high 或 medium，低置信或存在歧义时 conditionId 返回 null。reason 使用不超过30字的中文简短依据。',
        '只输出 JSON，不要输出 markdown、代码块或解释。格式：',
        '{"assignments":[{"itemId":"原样返回","conditionId":"候选ID或null","confidence":"high|medium|low","reason":"简短依据"}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: buildAttributionPrompt(candidate),
    },
  ], undefined, undefined, undefined, {
    configProfile: 'fast',
    traceContext: {
      scene: 'reception-chronic-refill-medication-attribution',
      sourceModule: 'reception_risk',
      operationModule: 'reception',
      operationAction: 'classify_historical_medication',
      title: '接诊辅助归类慢病历史药品',
    },
  });

  const parsed = parseLLMJson<RawMedicationAttributionResponse>(response);
  return normalizeChronicRefillMedicationAttributions(items, parsed);
}
