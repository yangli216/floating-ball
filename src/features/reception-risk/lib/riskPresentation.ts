import type { RiskItem } from '../types';

export const RISK_CAPSULE_CONTENT_MAX_LENGTH = 24;

interface RiskClause {
  index: number;
  priority: number;
  text: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[。；，、]+$/g, '')
    .trim();
}

function truncateRiskContent(content: string): string {
  if (content.length <= RISK_CAPSULE_CONTENT_MAX_LENGTH) {
    return content;
  }

  const boundary = content.slice(0, RISK_CAPSULE_CONTENT_MAX_LENGTH + 1)
    .search(/[，；。]/);
  if (boundary >= 8) {
    return content.slice(0, boundary);
  }

  return `${content.slice(0, RISK_CAPSULE_CONTENT_MAX_LENGTH - 1)}…`;
}

function isDefinitionClause(clause: string): boolean {
  return /(?:疾病|病)$/.test(clause)
    && !/(关注|监测|控制|复查|随访|治疗|管理|警惕|防范|风险)/.test(clause);
}

function normalizeChronicClause(rawClause: string, index: number): RiskClause | null {
  let text = cleanText(rawClause)
    .replace(/^(?:需要|需)/, '')
    .replace(/^(?:注意|防范|警惕)/, '关注')
    .replace(/风险$/, '');

  if (!text || isDefinitionClause(text)) {
    return null;
  }

  if (/^(?:持续|定期)血糖监测(?:与管理)?$/.test(text)) {
    text = '关注血糖控制';
  } else if (/^长期随访及.+治疗$/.test(text)) {
    text = '规范随访治疗';
  }

  const priority = /^关注/.test(text)
    ? 3
    : /(监测|控制|复查|警惕|防范)/.test(text)
      ? 2
      : 1;

  return { index, priority, text };
}

function mergeAttentionClauses(clauses: string[]): string {
  if (clauses.length < 2 || !clauses.every((clause) => clause.startsWith('关注'))) {
    return clauses.join('，');
  }

  return `关注${clauses.map((clause) => clause.slice(2)).join('及')}`;
}

function compactChronicRiskContent(content: string): string {
  const match = content.match(/^(.{1,18}?)[：:](.+)$/);
  if (!match) {
    return truncateRiskContent(content);
  }

  const diseaseName = cleanText(match[1]);
  const availableLength = RISK_CAPSULE_CONTENT_MAX_LENGTH - diseaseName.length - 1;
  if (!diseaseName || availableLength < 4) {
    return truncateRiskContent(content);
  }

  const clauses = match[2]
    .split(/[，；。]/)
    .map(normalizeChronicClause)
    .filter((clause): clause is RiskClause => Boolean(clause));

  if (clauses.length === 0) {
    return truncateRiskContent(diseaseName);
  }

  const highestPriority = Math.max(...clauses.map((clause) => clause.priority));
  const selected: RiskClause[] = [];
  for (const clause of clauses.filter((item) => item.priority === highestPriority)) {
    const candidate = mergeAttentionClauses([...selected, clause]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.text));
    if (candidate.length <= availableLength) {
      selected.push(clause);
    }
  }

  const detail = mergeAttentionClauses(selected
    .sort((left, right) => left.index - right.index)
    .map((clause) => clause.text));
  const compactDetail = detail || clauses[0].text;
  return `${diseaseName}：${truncateRiskContent(compactDetail).slice(0, availableLength)}`;
}

export function normalizeRiskPresentationItem(item: RiskItem): RiskItem {
  const content = cleanText(item.content || '');
  return {
    ...item,
    content: item.category === 'chronic'
      ? compactChronicRiskContent(content)
      : truncateRiskContent(content),
  };
}

export function normalizeRiskPresentationItems(items: RiskItem[]): RiskItem[] {
  return items.map(normalizeRiskPresentationItem);
}
