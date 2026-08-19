import type { TreatmentRecommendation } from '@/types/consultation';

export interface AuxiliaryRecommendationGroup {
  key: string;
  title: string;
  purpose: string;
  showHeader: boolean;
  items: TreatmentRecommendation[];
}

const AUXILIARY_TYPES = new Set<TreatmentRecommendation['type']>(['exam', 'lab_test']);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

function getFallbackGroupTitle(type: TreatmentRecommendation['type']): string {
  return type === 'exam' ? '综合检查评估' : '综合检验评估';
}

function getFallbackGroupPurpose(type: TreatmentRecommendation['type']): string {
  return type === 'exam'
    ? '辅助当前诊断、鉴别与风险评估'
    : '辅助当前诊断、病情评估与治疗决策';
}

function extractConciseReason(reason: string): string {
  const firstClause = reason
    .replace(/^(?:推荐依据|开立依据|依据)[:：]?\s*/u, '')
    .split(/[。；;\n]/u)
    .map((part) => part.trim())
    .find(Boolean) || '';
  return firstClause.length > 28 ? '' : firstClause;
}

export function isAuxiliaryRecommendation(item: TreatmentRecommendation): boolean {
  return AUXILIARY_TYPES.has(item.type);
}

export function getAuxiliaryRecommendationPurpose(item: TreatmentRecommendation): string {
  if (!isAuxiliaryRecommendation(item)) return '';
  return normalizeText(item.goal)
    || extractConciseReason(normalizeText(item.reason))
    || (item.type === 'exam' ? '辅助当前病情检查评估' : '辅助当前病情检验评估');
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
    const title = normalizeText(item.goalGroup) || getFallbackGroupTitle(type);
    const key = title.toLocaleLowerCase('zh-CN');
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (!existing.purpose) {
        existing.purpose = normalizeText(item.goalGroupPurpose);
      }
      continue;
    }
    groups.set(key, {
      key,
      title,
      purpose: normalizeText(item.goalGroupPurpose) || getFallbackGroupPurpose(type),
      showHeader: true,
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
