import type { HisHistoricalMedication, HisVisitRecord } from '@/services/his/types';
import type {
  RecentPrescriptionHistory,
  RecentPrescriptionHistoryEntry,
} from '@/types/consultation';
import { CHRONIC_REFILL_HISTORY_LOOKBACK_DAYS } from './chronicRefillHistoryWindow';

interface MedicationHistoryTarget {
  name: string;
  productId?: string;
}

interface MedicationHistorySource {
  visit: HisVisitRecord;
  medication: HisHistoricalMedication;
}

function normalizeMedicineName(value: string): string {
  return value
    .replace(/^[\s☆★*·•]+/u, '')
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/\d+(?:\.\d+)?\s*(?:μg|ug|mg|g|ml|片|粒|支|盒|瓶|袋)/giu, '')
    .replace(/[\s,，、;；:：\-_/]/gu, '')
    .toLowerCase();
}

function collectMedicationSources(visits: HisVisitRecord[]): MedicationHistorySource[] {
  return visits.flatMap((visit) => (
    (visit.medicationOrders || []).map((medication) => ({ visit, medication }))
  ));
}

function toEntry(source: MedicationHistorySource): RecentPrescriptionHistoryEntry {
  const { visit, medication } = source;
  return {
    visitId: visit.visitId,
    prescribedAt: visit.visitTime,
    deptName: visit.deptName,
    orderId: medication.orderId,
    productId: medication.productId,
    name: medication.name,
    spec: medication.spec,
    dosage: medication.dose,
    dosageUnit: medication.doseUnit,
    frequency: medication.frequency,
    route: medication.route,
    days: medication.days,
    totalQty: medication.totalQty,
    totalUnit: medication.totalUnit,
  };
}

function deduplicateAndSortEntries(sources: MedicationHistorySource[]): RecentPrescriptionHistoryEntry[] {
  const seen = new Set<string>();
  return sources
    .map(toEntry)
    .filter((entry) => {
      const key = [
        entry.visitId || entry.prescribedAt,
        entry.orderId,
        entry.productId,
        normalizeMedicineName(entry.name),
        entry.totalQty,
        entry.totalUnit,
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.prescribedAt - left.prescribedAt);
}

/**
 * 从完整历史查询窗口中提取同药开立证据。
 * 商品 ID 优先；无 ID 命中时只允许规范药名精确匹配，不做包含式模糊匹配。
 */
export function buildRecentPrescriptionHistory(
  target: MedicationHistoryTarget,
  visits: HisVisitRecord[],
  lookbackDays = CHRONIC_REFILL_HISTORY_LOOKBACK_DAYS,
): RecentPrescriptionHistory {
  const sources = collectMedicationSources(visits);
  const productMatches = target.productId
    ? sources.filter(({ medication }) => medication.productId === target.productId)
    : [];

  if (productMatches.length > 0) {
    return {
      lookbackDays,
      matchedName: target.name,
      matchedProductId: target.productId,
      matchBasis: 'product-id',
      entries: deduplicateAndSortEntries(productMatches),
    };
  }

  const normalizedTargetName = normalizeMedicineName(target.name);
  const nameMatches = normalizedTargetName
    ? sources.filter(({ medication }) => normalizeMedicineName(medication.name) === normalizedTargetName)
    : [];
  const productIds = new Set(
    nameMatches
      .map(({ medication }) => medication.productId?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return {
    lookbackDays,
    matchedName: target.name,
    matchedProductId: target.productId,
    matchBasis: nameMatches.length === 0
      ? 'none'
      : (productIds.size > 1 ? 'ambiguous-name' : 'exact-name'),
    entries: deduplicateAndSortEntries(nameMatches),
  };
}
