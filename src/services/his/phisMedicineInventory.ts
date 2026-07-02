import type { HisAvailableMedicineInventoryBatch } from '../hisService';
import type { AvailableMedicineInventoryItem } from './types';

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function toExpiryTimestamp(value: unknown): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/u.test(text) ? `${text}T23:59:59` : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveAvailableQuantity(batch: HisAvailableMedicineInventoryBatch): number {
  const current = toFiniteNumber(batch.amountCur);
  if (current !== undefined) return Math.max(0, current);

  const total = toFiniteNumber(batch.amount) ?? 0;
  const frozen = toFiniteNumber(batch.amtFrz) ?? 0;
  return Math.max(0, total - frozen);
}

export function mergePhisAvailableMedicineInventory(
  batches: HisAvailableMedicineInventoryBatch[],
  storeId: string,
  now = Date.now(),
): AvailableMedicineInventoryItem[] {
  type MergedInventoryItem = AvailableMedicineInventoryItem & {
    batchCount: number;
    nearestExpiryTimestamp?: number;
    unitPriceExpiryTimestamp?: number;
  };
  const merged = new Map<string, MergedInventoryItem>();

  for (const batch of batches) {
    const productId = cleanText(batch.idMedPro);
    const productName = cleanText(batch.naMedPro);
    const batchStoreId = cleanText(batch.idSto) || storeId.trim();
    const expiryTimestamp = toExpiryTimestamp(batch.dtEffect);
    const availableQuantity = resolveAvailableQuantity(batch);

    if (!productId || !productName || !batchStoreId) continue;
    if (cleanText(batch.fgActive) === '0') continue;
    if (expiryTimestamp !== undefined && expiryTimestamp < now) continue;
    if (availableQuantity <= 0) continue;

    const expiryDate = cleanText(batch.dtEffect);
    const batchUnitPrice = toFiniteNumber(batch.priceSale);
    const validUnitPrice = batchUnitPrice !== undefined && batchUnitPrice >= 0
      ? batchUnitPrice
      : undefined;
    const unitPriceExpiryTimestamp = expiryTimestamp ?? Number.POSITIVE_INFINITY;
    const existing = merged.get(productId);
    if (existing) {
      existing.availableQuantity += availableQuantity;
      existing.batchCount += 1;
      if (
        expiryDate
        && expiryTimestamp !== undefined
        && (
          existing.nearestExpiryTimestamp === undefined
          || expiryTimestamp < existing.nearestExpiryTimestamp
        )
      ) {
        existing.nearestExpiryDate = expiryDate;
        existing.nearestExpiryTimestamp = expiryTimestamp;
      }
      if (
        validUnitPrice !== undefined
        && (
          existing.unitPrice === undefined
          || existing.unitPriceExpiryTimestamp === undefined
          || unitPriceExpiryTimestamp < existing.unitPriceExpiryTimestamp
        )
      ) {
        existing.unitPrice = validUnitPrice;
        existing.unitPriceExpiryTimestamp = unitPriceExpiryTimestamp;
      }
      continue;
    }

    merged.set(productId, {
      productId,
      productName,
      spec: cleanText(batch.specSale),
      unit: cleanText(batch.unitSale),
      manufacturer: cleanText(batch.naFac),
      storeId: batchStoreId,
      storeName: cleanText(batch.idStoText),
      availableQuantity,
      nearestExpiryDate: expiryDate,
      nearestExpiryTimestamp: expiryTimestamp,
      unitPrice: validUnitPrice,
      unitPriceExpiryTimestamp: validUnitPrice === undefined
        ? undefined
        : unitPriceExpiryTimestamp,
      batchCount: 1,
      raw: {
        idOrg: cleanText(batch.idOrg),
      },
    });
  }

  return Array.from(merged.values())
    .map(({
      batchCount,
      nearestExpiryTimestamp: _nearestExpiryTimestamp,
      unitPriceExpiryTimestamp: _unitPriceExpiryTimestamp,
      ...item
    }) => ({
      ...item,
      raw: { ...item.raw, batchCount },
    }))
    .sort((left, right) => left.productName.localeCompare(right.productName, 'zh-CN'));
}
