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
  requiresClinicalInference: boolean;
}

interface ResolverResponseItem {
  index?: number;
  catalogRef?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  goal?: string;
  goalGroup?: string;
  goalGroupPurpose?: string;
  necessity?: 'core' | 'supplementary';
  reason?: string;
}

type CatalogIdentityItem = {
  id: string;
  name: string;
  idSrv?: string;
  code?: string;
};

export interface ExplicitTreatmentResolutionContext {
  transcript?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  physicalExam?: string;
  diagnosisNames?: string[];
  treatmentPlan?: string;
}

const AMBIGUOUS_AUXILIARY_EXPRESSION = /^(?:(?:做|查|检查|复查)(?:个|一下)?)?(?:腹部)?(?:b超|彩超|超声|ct|核磁|磁共振|mri|x线|x光|拍片)(?:检查)?$/iu;
const GENERIC_LAB_EXPRESSION = /^(?:抽血|验血|化验|血检|尿检|便检|检查|检验)$/u;
const AMBIGUOUS_EXAM_EVIDENCE = /(?:做|查|检查|复查|安排|开)(?:个|一下)?(?:腹部)?(?:b超|彩超|超声|ct|核磁|磁共振|mri|x线|x光|拍片)(?:检查)?/iu;
const GENERIC_LAB_EVIDENCE = /(?:抽血|验血|化验|血检|尿检|便检|做个检验|做个检查)/u;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

function isAuxiliaryType(type: TreatmentRecommendation['type']): boolean {
  return type === 'exam' || type === 'lab_test';
}

function requiresClinicalInference(
  hint: TreatmentHint,
  type: TreatmentRecommendation['type'],
): boolean {
  const name = normalizeText(hint.name).replace(/[，。！？、,.!?：:；;\s]/gu, '');
  const evidence = normalizeText([hint.evidenceText, hint.text].filter(Boolean).join(' '));
  const evidenceCompact = evidence.replace(/[，。！？、,.!?：:；;\s]/gu, '');
  const evidenceNamesResolvedItem = Boolean(name) && evidenceCompact.includes(name);
  if (type === 'exam') {
    return AMBIGUOUS_AUXILIARY_EXPRESSION.test(name)
      || (!evidenceNamesResolvedItem && AMBIGUOUS_EXAM_EVIDENCE.test(evidence));
  }
  if (type === 'lab_test') {
    return GENERIC_LAB_EXPRESSION.test(name)
      || (!evidenceNamesResolvedItem && GENERIC_LAB_EVIDENCE.test(evidence));
  }
  return false;
}

function getCatalogIdentity(item: CatalogIdentityItem): string[] {
  return [item.id, item.idSrv || '', item.code || '', item.name]
    .map((value) => normalizeText(value).toLocaleLowerCase('zh-CN'))
    .filter(Boolean);
}

function isCurrentAuxiliaryItem(
  item: CatalogIdentityItem,
  auxiliaryItems: MedicalItem[],
): boolean {
  const identities = new Set(getCatalogIdentity(item));
  return auxiliaryItems.some((candidate) => (
    getCatalogIdentity(candidate).some((identity) => identities.has(identity))
  ));
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
    const candidates = useFullCatalog
      ? auxiliaryItems.filter((item) => item.category === '检查')
      : medicalDataService.searchExamItems(hint.name, hint.aliases, 5);
    return candidates.filter((item) => isCurrentAuxiliaryItem(item, auxiliaryItems));
  }
  if (type === 'lab_test') {
    const candidates = useFullCatalog
      ? auxiliaryItems.filter((item) => item.category === '检验')
      : medicalDataService.searchLabTestItems(hint.name, hint.aliases, 5);
    return candidates.filter((item) => isCurrentAuxiliaryItem(item, auxiliaryItems));
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

function buildClinicalContext(context: ExplicitTreatmentResolutionContext): string {
  const lines = [
    ['医患完整对话', context.transcript],
    ['主诉', context.chiefComplaint],
    ['现病史', context.historyOfPresentIllness],
    ['既往史', context.pastMedicalHistory],
    ['体格检查', context.physicalExam],
    ['正式诊断/诊断线索', context.diagnosisNames?.map(normalizeText).filter(Boolean).join('、')],
    ['已有处理计划', context.treatmentPlan],
  ]
    .map(([label, value]) => [label, normalizeText(value)] as const)
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}：${value}`);
  return lines.length > 0 ? lines.join('\n') : '未提供额外临床上下文';
}

function formatCandidate(candidate: ResolverCandidate): string {
  const keywords = 'keywords' in candidate.item
    ? candidate.item.keywords?.map(normalizeText).filter(Boolean).slice(0, 5).join('、')
    : '';
  return `${candidate.ref}|${candidate.item.name}${keywords ? `|目录关键词=${keywords}` : ''}`;
}

function buildResolverPrompt(
  tasks: ResolverTask[],
  context: ExplicitTreatmentResolutionContext,
): string {
  const blocks = tasks.map((task) => [
    `项目 ${task.index}：类型=${task.type}；原始表达=${task.hint.name}；局部对话依据=${task.hint.evidenceText || task.hint.text || '无'}；需要结合上下文补全=${task.requiresClinicalInference ? '是' : '否'}`,
    ...task.candidates.map(formatCandidate),
  ].join('\n'));
  return `请把医生已经明确提出、但可能只说了上位名称的医嘱，结合本次医患对话映射到对应的院内标准目录。这里只补全医生已提出的项目，不新增诊疗建议。

【本次临床上下文】
${buildClinicalContext(context)}

规则：
1. 只能从每个项目自己的候选列表中选择 catalogRef。
2. “B超、CT、化验”等上位表达必须综合原始对话、主诉、现病史、体格检查和诊断线索，推测医生最可能指向的标准项目；不能形成唯一合理映射时返回 null，禁止强行选择。
3. 检查/检验映射必须返回 confidence、goal、goalGroup、goalGroupPurpose、necessity、reason。goal 是项目卡片的一句话目的；goalGroup 是临床目标短标题；goalGroupPurpose 是该目标的一句话用途；reason 要说明“对话事实 + 补全判断”，不得把推测写成医生原话。
4. confidence 只能是 high、medium、low；只有证据足够的 high / medium 才可返回 catalogRef，low 必须返回 null。
5. 不得新增目录项目，不得借此自主增加医生没有提出的检查、检验、药品或处置。
6. 严格返回 JSON 数组，不要 Markdown。示例：[{"index":0,"catalogRef":"I0C1","confidence":"medium","goal":"评估上腹部不适相关脏器情况","goalGroup":"腹部影像评估","goalGroupPurpose":"结合症状定位腹部病变线索","necessity":"core","reason":"医生提出B超；结合上腹部症状补全为对应腹部超声"},{"index":1,"catalogRef":null,"confidence":"low","goal":"","goalGroup":"","goalGroupPurpose":"","necessity":"core","reason":"现有信息无法唯一确定项目"}]。

${blocks.join('\n\n')}`;
}

function hasCompleteAuxiliaryResolution(decision: ResolverResponseItem): boolean {
  return (decision.confidence === 'high' || decision.confidence === 'medium')
    && Boolean(normalizeText(decision.goal))
    && Boolean(normalizeText(decision.goalGroup))
    && Boolean(normalizeText(decision.goalGroupPurpose))
    && (decision.necessity === 'core' || decision.necessity === 'supplementary')
    && Boolean(normalizeText(decision.reason));
}

export async function resolveExplicitTreatmentCatalogHints(
  hints: TreatmentHint[],
  consultationId?: string,
  context: ExplicitTreatmentResolutionContext = {},
): Promise<ClinicalResultMatchedTreatment[]> {
  const results: ClinicalResultMatchedTreatment[] = hints.map((hint) => ({
    ...hint,
    matchedItem: null,
    matchStatus: 'unmatched',
    selected: false,
  }));
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
    const needsInference = requiresClinicalInference(hint, type);
    const assessment = assessTreatmentCatalogMatch(type, hint.name, hint.aliases, hint.spec);
    const isCurrentMatch = !isAuxiliaryType(type)
      || (assessment.matchedItem && isCurrentAuxiliaryItem(
        assessment.matchedItem as CatalogIdentityItem,
        auxiliaryItems,
      ));
    if (assessment.matchedItem && isCurrentMatch && !needsInference) {
      results[index] = {
        ...results[index],
        matchedItem: assessment.matchedItem,
        matchStatus: assessment.matchStatus || 'exact',
        selected: false,
      };
      return;
    }
    const useFullCatalog = needsInference
      || (assessment.matchStatus === 'unmatched' && type !== 'medicine');
    const candidates = filterRestrictedCandidates(
      hint,
      type,
      collectCandidates(hint, type, useFullCatalog, auxiliaryItems),
    )
      .map((item, candidateIndex) => ({ ref: `I${index}C${candidateIndex + 1}`, item }));
    if (candidates.length > 0) {
      tasks.push({ index, hint, type, candidates, requiresClinicalInference: needsInference });
    }
  });

  if (tasks.length === 0) return results;

  try {
    const response = await chatFast([
      {
        role: 'system',
        content: '你是基层门诊医疗标准目录映射助手。你只把医生已提出的上位医嘱结合对话补全到候选目录，并给出可审计的临床目标；禁止新增诊疗项目。',
      },
      { role: 'user', content: buildResolverPrompt(tasks, context) },
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
      if (isAuxiliaryType(task.type) && !hasCompleteAuxiliaryResolution(decision)) return;
      results[task.index] = {
        ...results[task.index],
        matchedItem: toMatchedItem(task.type, candidate.item),
        matchStatus: 'exact',
        selected: false,
        ...(isAuxiliaryType(task.type) ? {
          goal: normalizeText(decision.goal),
          goalGroup: normalizeText(decision.goalGroup),
          goalGroupPurpose: normalizeText(decision.goalGroupPurpose),
          necessity: decision.necessity,
          reason: normalizeText(decision.reason),
        } : {}),
      };
    });
  } catch (error) {
    console.warn('[VoiceIntent] Explicit treatment catalog resolution failed; keep manual confirmation fallback', error);
  }

  return results;
}
