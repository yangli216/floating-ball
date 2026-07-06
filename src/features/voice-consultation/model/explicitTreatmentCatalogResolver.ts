import { chatFast } from '@/services/llm';
import { medicalDataService, type MedicalItem, type MedicineItem } from '@/services/medicalData';
import {
  explicitlyRequestsRestrictedMedicalItem,
  isRestrictedMedicalCatalogItem,
} from '@/services/medicalCatalogPolicy';
import type { TreatmentHint } from '@/prompts';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  assessTreatmentCatalogMatch,
  buildMedicalItemMatchedItem,
  buildMedicineMatchedItem,
} from '@features/clinical-result/recommendationHelpers';
import { extractLLMJsonCandidate } from '@features/clinical-result/clinicalResultLlmJsonParser';
import type { ClinicalResultMatchedTreatment } from '@features/clinical-result/clinicalResultContract';

interface ResolverCandidate {
  ref: string;
  item: MedicalItem | MedicineItem;
}

interface ResolverTask {
  index: number;
  hint: TreatmentHint;
  type: TreatmentRecommendation['type'];
  candidates: ResolverCandidate[];
}

interface ResolverResponseItem {
  index?: number;
  catalogRef?: string | null;
}

function mapHintType(type: TreatmentHint['type']): TreatmentRecommendation['type'] {
  if (type === 'examination') return 'exam';
  if (type === 'labTest') return 'lab_test';
  return type;
}

function collectCandidates(
  hint: TreatmentHint,
  type: TreatmentRecommendation['type'],
  useFullCatalog: boolean,
  auxiliaryItems: MedicalItem[],
): Array<MedicalItem | MedicineItem> {
  if (type === 'medicine') return medicalDataService.searchMedicines(hint.name, hint.aliases, 5);
  if (type === 'exam') {
    return useFullCatalog
      ? auxiliaryItems.filter((item) => item.category === '检查')
      : medicalDataService.searchExamItems(hint.name, hint.aliases, 5);
  }
  if (type === 'lab_test') {
    return useFullCatalog
      ? auxiliaryItems.filter((item) => item.category === '检验')
      : medicalDataService.searchLabTestItems(hint.name, hint.aliases, 5);
  }
  if (type === 'procedure') {
    return useFullCatalog
      ? medicalDataService.getAllItems().filter((item) => item.category === '治疗')
      : medicalDataService.searchProcedureItems(hint.name, hint.aliases, 5);
  }
  return [];
}

function filterRestrictedCandidates(
  hint: TreatmentHint,
  type: TreatmentRecommendation['type'],
  candidates: Array<MedicalItem | MedicineItem>,
): Array<MedicalItem | MedicineItem> {
  if (type !== 'exam' && type !== 'lab_test') return candidates;
  const explicitText = [hint.name, ...(hint.aliases || []), hint.evidenceText || '', hint.text || ''].join(' ');
  if (explicitlyRequestsRestrictedMedicalItem(explicitText)) return candidates;
  return candidates.filter((item) => !('spec' in item) && !isRestrictedMedicalCatalogItem(item));
}

function toMatchedItem(type: TreatmentRecommendation['type'], item: MedicalItem | MedicineItem) {
  return type === 'medicine' && 'spec' in item
    ? buildMedicineMatchedItem(item)
    : buildMedicalItemMatchedItem(item as MedicalItem);
}

function buildResolverPrompt(tasks: ResolverTask[]): string {
  const blocks = tasks.map((task) => [
    `项目 ${task.index}：类型=${task.type}；原始表达=${task.hint.name}；对话依据=${task.hint.evidenceText || task.hint.text || '无'}`,
    ...task.candidates.map((candidate) => `${candidate.ref}|${candidate.item.name}`),
  ].join('\n'));
  return `请把医生明确表达的医嘱映射到对应的院内标准目录。

规则：
1. 只能从每个项目自己的候选列表中选择 catalogRef。
2. 名称相近但临床含义不一致时返回 null，禁止强行选择。
3. 不得新增项目，不做临床方案推荐。
4. 严格返回 JSON 数组，例如：[{"index":0,"catalogRef":"I0C1"},{"index":1,"catalogRef":null}]。

${blocks.join('\n\n')}`;
}

export async function resolveExplicitTreatmentCatalogHints(
  hints: TreatmentHint[],
  consultationId?: string,
): Promise<ClinicalResultMatchedTreatment[]> {
  const results: ClinicalResultMatchedTreatment[] = hints.map((hint) => ({ ...hint, matchedItem: null }));
  const tasks: ResolverTask[] = [];
  let auxiliaryItems: MedicalItem[] = [];
  if (hints.some((hint) => hint.type === 'examination' || hint.type === 'labTest')) {
    try {
      auxiliaryItems = await medicalDataService.fetchAvailableExamLabItems();
    } catch (error) {
      console.warn('[VoiceIntent] Failed to query available exam/lab items; keep manual confirmation fallback', error);
    }
  }

  hints.forEach((hint, index) => {
    const type = mapHintType(hint.type);
    const assessment = assessTreatmentCatalogMatch(type, hint.name, hint.aliases, hint.spec);
    if (assessment.matchedItem) {
      results[index].matchedItem = assessment.matchedItem;
      return;
    }
    const useFullCatalog = assessment.matchStatus === 'unmatched' && type !== 'medicine';
    const candidates = filterRestrictedCandidates(
      hint,
      type,
      collectCandidates(hint, type, useFullCatalog, auxiliaryItems),
    )
      .map((item, candidateIndex) => ({ ref: `I${index}C${candidateIndex + 1}`, item }));
    if (candidates.length > 0) tasks.push({ index, hint, type, candidates });
  });

  if (tasks.length === 0) return results;

  try {
    const response = await chatFast([
      {
        role: 'system',
        content: '你是医疗标准目录映射助手，只做候选确认，不生成新的诊疗建议。',
      },
      { role: 'user', content: buildResolverPrompt(tasks) },
    ], undefined, undefined, undefined, {
      traceContext: {
        scene: 'voice-explicit-treatment-catalog-resolution',
        sourceModule: 'voice_intent',
        operationModule: 'voice_consultation',
        operationAction: 'resolve_explicit_treatment_catalog',
        title: '语音明确医嘱标准目录确认',
        consultationId,
      },
    });
    const parsed = JSON.parse(extractLLMJsonCandidate(response)) as ResolverResponseItem[];
    if (!Array.isArray(parsed)) return results;
    parsed.forEach((decision) => {
      if (!Number.isInteger(decision.index) || typeof decision.catalogRef !== 'string') return;
      const task = tasks.find((item) => item.index === decision.index);
      const candidate = task?.candidates.find((item) => item.ref === decision.catalogRef);
      if (!task || !candidate) return;
      results[task.index].matchedItem = toMatchedItem(task.type, candidate.item);
    });
  } catch (error) {
    console.warn('[VoiceIntent] Explicit treatment catalog resolution failed; keep manual confirmation fallback', error);
  }

  return results;
}
