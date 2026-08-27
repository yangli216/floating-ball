import type { TreatmentRecommendation } from '@/types/consultation';

export interface AuxiliaryRecommendationGroup {
  key: string;
  title: string;
  purpose: string;
  showHeader: boolean;
  items: TreatmentRecommendation[];
}

const AUXILIARY_TYPES = new Set<TreatmentRecommendation['type']>(['exam', 'lab_test']);
const PURPOSE_PREVIEW_LENGTH = 32;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

function truncatePreview(value: string): string {
  if (value.length <= PURPOSE_PREVIEW_LENGTH) return value;
  return `${value.slice(0, PURPOSE_PREVIEW_LENGTH).replace(/[，,:：\s]+$/u, '')}…`;
}

function extractConciseText(value: string): string {
  const firstClause = value
    .replace(/^(?:推荐依据|开立依据|依据)[:：]?\s*/u, '')
    .split(/[。；;\n]/u)
    .map((part) => part.trim())
    .find(Boolean) || '';
  return truncatePreview(firstClause);
}

export function isAuxiliaryRecommendation(item: TreatmentRecommendation): boolean {
  return AUXILIARY_TYPES.has(item.type);
}

export function getAuxiliaryRecommendationPurpose(item: TreatmentRecommendation): string {
  if (!isAuxiliaryRecommendation(item)) return '';
  const goal = normalizeText(item.goal);
  if (goal) return goal;

  const evidence = extractConciseText(normalizeText(item.evidenceText));
  if (evidence) {
    return item.sourceType === 'explicit' ? `对话明确：${evidence}` : evidence;
  }
  return extractConciseText(normalizeText(item.reason));
}

export function getAuxiliaryNecessityLabel(item: TreatmentRecommendation): string {
  if (!isAuxiliaryRecommendation(item)) return '';
  if (item.necessity === 'supplementary') return '可选';
  return item.necessity === 'core' ? '优先' : '';
}

export function buildAuxiliaryRecommendationGroups(
  type: TreatmentRecommendation['type'] | undefined,
  items: TreatmentRecommendation[],
): AuxiliaryRecommendationGroup[] {
  if (!type || !AUXILIARY_TYPES.has(type)) {
    return [{ key: 'all', title: '', purpose: '', showHeader: false, items }];
  }

  const groups = new Map<string, AuxiliaryRecommendationGroup>();
  for (const item of items) {
    const isExplicit = item.sourceType === 'explicit';
    const isMatchedExplicit = isExplicit && Boolean(item.matchedItem);
    const explicitGoalGroup = isMatchedExplicit ? normalizeText(item.goalGroup) : '';
    const title = isExplicit
      ? explicitGoalGroup
        ? `对话明确 · ${explicitGoalGroup}`
        : isMatchedExplicit ? '对话明确项目' : '对话明确项目（待匹配）'
      : normalizeText(item.goalGroup);
    const purpose = isExplicit
      ? explicitGoalGroup
        ? normalizeText(item.goalGroupPurpose)
        : isMatchedExplicit
        ? '本次问诊中已明确提出，已匹配当前可用目录'
        : '本次问诊中已明确提出，当前可用目录尚未匹配，匹配后方可回写'
      : normalizeText(item.goalGroupPurpose);
    const key = isExplicit
      ? `explicit:${type}:${isMatchedExplicit ? 'matched' : 'unmatched'}${explicitGoalGroup ? `:${explicitGoalGroup.toLocaleLowerCase('zh-CN')}` : ''}`
      : title ? title.toLocaleLowerCase('zh-CN') : `ungrouped:${type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (!existing.purpose) {
        existing.purpose = purpose;
      }
      continue;
    }
    groups.set(key, {
      key,
      title,
      purpose,
      showHeader: isExplicit || Boolean(title),
      items: [item],
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items
      .map((item, index) => ({ item, index }))
      .sort((left, right) => (
        Number(left.item.necessity === 'supplementary')
        - Number(right.item.necessity === 'supplementary')
        || left.index - right.index
      ))
      .map(({ item }) => item),
  }));
}
