export interface RestrictionAwareMedicalCatalogItem {
  name: string;
  restricted?: boolean;
  restrictionReason?: string;
  raw?: Record<string, unknown>;
}

function readRawBoolean(item: RestrictionAwareMedicalCatalogItem, key: string): boolean {
  const value = item.raw?.[key];
  return value === true || value === '1' || value === 1;
}

function readRawText(item: RestrictionAwareMedicalCatalogItem, key: string): string {
  const value = item.raw?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function isRestrictedMedicalCatalogItem(item: RestrictionAwareMedicalCatalogItem): boolean {
  return item.restricted === true
    || readRawBoolean(item, 'restricted')
    || /免费/u.test(item.name);
}

export function getMedicalCatalogRestrictionReason(item: RestrictionAwareMedicalCatalogItem): string {
  if (!isRestrictedMedicalCatalogItem(item)) return '';
  return item.restrictionReason?.trim()
    || readRawText(item, 'restrictionReason')
    || '免费/专项项目，仅适用于符合条件的特定人群';
}

export function explicitlyRequestsRestrictedMedicalItem(query: string): boolean {
  return /免费|专项|特定人群|惠民/u.test(query);
}

export function adjustRestrictedMedicalItemScore(
  score: number,
  item: RestrictionAwareMedicalCatalogItem,
  query: string,
): number {
  if (!isRestrictedMedicalCatalogItem(item) || explicitlyRequestsRestrictedMedicalItem(query)) {
    return score;
  }
  // 受限项目仍保留在手动候选中，但不能因名称接近而自动成为 exact/probable 匹配。
  return score * 0.52;
}
