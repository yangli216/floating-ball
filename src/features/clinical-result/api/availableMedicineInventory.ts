import type {
  AvailableMedicineInventoryItem,
  HisAdapter,
  PharmacyOption,
} from '@/services/his';
import { getHisAdapter } from '@/services/his';
import {
  readPersistentString,
  writePersistentString,
} from '@/services/persistentStore';

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'AVAILABLE_MEDICINE_INVENTORY_V1';
const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_FALLBACK_TTL_MS = 30 * 60 * 1000;

interface InventoryCacheEntry {
  version: number;
  cachedAt: number;
  items: AvailableMedicineInventoryItem[];
}

export interface AvailableMedicineInventoryCatalogItem {
  productId: string;
  productName: string;
  spec?: string;
  unit?: string;
  manufacturer?: string;
  availableQuantity: number;
  storeIds: string[];
  storeNames: string[];
}

export interface AvailableMedicineInventoryContext {
  items: AvailableMedicineInventoryCatalogItem[];
  promptContext: string;
  pharmacyCount: number;
  staleStoreCount: number;
}

export interface MedicineRecommendationLike {
  type?: string;
  name?: string;
  aliases?: string[];
  spec?: string;
}

export interface LoadAvailableMedicineInventoryOptions {
  adapter?: HisAdapter | null;
  pharmacies?: PharmacyOption[];
  forceRefresh?: boolean;
  now?: number;
}

const memoryCache = new Map<string, InventoryCacheEntry>();
const inFlightRequests = new Map<string, Promise<{ items: AvailableMedicineInventoryItem[]; stale: boolean }>>();
let persistentWriteQueue: Promise<void> = Promise.resolve();

function buildCacheKey(adapter: HisAdapter, storeId: string): string {
  const scope = adapter.getContextScope();
  return [
    CACHE_PREFIX,
    adapter.vendor || 'unknown-vendor',
    encodeURIComponent(scope.orgCode || 'unknown-org'),
    encodeURIComponent(scope.tenantId || 'unknown-tenant'),
    encodeURIComponent(storeId),
  ].join(':');
}

function parseCacheEntry(raw: string | null): InventoryCacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InventoryCacheEntry>;
    if (
      parsed.version !== CACHE_VERSION
      || typeof parsed.cachedAt !== 'number'
      || !Array.isArray(parsed.items)
    ) {
      return null;
    }
    return {
      version: CACHE_VERSION,
      cachedAt: parsed.cachedAt,
      items: parsed.items as AvailableMedicineInventoryItem[],
    };
  } catch {
    return null;
  }
}

async function readCache(key: string): Promise<InventoryCacheEntry | null> {
  const memory = memoryCache.get(key);
  if (memory) return memory;

  try {
    const persisted = parseCacheEntry(await readPersistentString(key));
    if (persisted) memoryCache.set(key, persisted);
    return persisted;
  } catch (error) {
    console.warn('[AvailableMedicineInventory] Failed to read persistent cache', { key, error });
    return null;
  }
}

async function writeCache(key: string, entry: InventoryCacheEntry): Promise<void> {
  memoryCache.set(key, entry);
  persistentWriteQueue = persistentWriteQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await writePersistentString(key, JSON.stringify(entry));
      } catch (error) {
        console.warn('[AvailableMedicineInventory] Failed to persist cache', { key, error });
      }
    });
  await persistentWriteQueue;
}

async function loadStoreInventory(
  adapter: HisAdapter,
  storeId: string,
  forceRefresh: boolean,
  now: number,
): Promise<{ items: AvailableMedicineInventoryItem[]; stale: boolean }> {
  const cacheKey = buildCacheKey(adapter, storeId);
  const cached = await readCache(cacheKey);
  if (!forceRefresh && cached && now - cached.cachedAt < FRESH_TTL_MS) {
    return { items: cached.items, stale: false };
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    try {
      const items = await adapter.fetchAvailableMedicineInventory(storeId);
      await writeCache(cacheKey, {
        version: CACHE_VERSION,
        cachedAt: now,
        items,
      });
      return { items, stale: false };
    } catch (error) {
      if (
        cached
        && cached.items.length > 0
        && now - cached.cachedAt < STALE_FALLBACK_TTL_MS
      ) {
        console.warn('[AvailableMedicineInventory] Refresh failed; using stale non-empty cache', {
          storeId,
          cachedAt: cached.cachedAt,
          error,
        });
        return { items: cached.items, stale: true };
      }
      throw error;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, request);
  return request;
}

export function mergeAvailableMedicineInventoryCatalog(
  items: AvailableMedicineInventoryItem[],
): AvailableMedicineInventoryCatalogItem[] {
  const merged = new Map<string, AvailableMedicineInventoryCatalogItem>();

  for (const item of items) {
    const productId = item.productId.trim();
    const productName = item.productName.trim();
    if (!productId || !productName || item.availableQuantity <= 0) continue;

    const existing = merged.get(productId);
    if (existing) {
      existing.availableQuantity += item.availableQuantity;
      if (!existing.storeIds.includes(item.storeId)) existing.storeIds.push(item.storeId);
      if (item.storeName && !existing.storeNames.includes(item.storeName)) {
        existing.storeNames.push(item.storeName);
      }
      continue;
    }

    merged.set(productId, {
      productId,
      productName,
      spec: item.spec?.trim() || undefined,
      unit: item.unit?.trim() || undefined,
      manufacturer: item.manufacturer?.trim() || undefined,
      availableQuantity: item.availableQuantity,
      storeIds: [item.storeId],
      storeNames: item.storeName ? [item.storeName] : [],
    });
  }

  return Array.from(merged.values())
    .sort((left, right) => left.productName.localeCompare(right.productName, 'zh-CN'));
}

function cleanMedicineNameForPrompt(value: string): string {
  return value.replace(/^[\s☆★*·•]+/u, '').trim();
}

function normalizeMedicineLookupText(value: string): string {
  return cleanMedicineNameForPrompt(value)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/\d+(?:\.\d+)?\s*(?:μg|ug|mg|g|ml|片|粒|支|盒|瓶|袋)/giu, '')
    .replace(/[\s,，、;；:：\-_/]/gu, '')
    .toLowerCase();
}

function extractMedicineStrengthMg(value: string | undefined): number | null {
  const matched = (value || '').match(/(\d+(?:\.\d+)?)\s*(g|mg|ug|μg|毫克|克|微克)/iu);
  if (!matched) return null;
  const amount = Number(matched[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = matched[2].toLowerCase();
  if (unit === 'g' || unit === '克') return amount * 1000;
  if (unit === 'mg' || unit === '毫克') return amount;
  return amount / 1000;
}

function findInventoryMedicine(
  recommendation: MedicineRecommendationLike,
  inventory: AvailableMedicineInventoryCatalogItem[],
): AvailableMedicineInventoryCatalogItem | null {
  const candidates = [recommendation.name || '', ...(recommendation.aliases || [])]
    .map(normalizeMedicineLookupText)
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const nameMatches = inventory.filter((item) => {
    const inventoryName = normalizeMedicineLookupText(item.productName);
    return candidates.some((candidate) => (
      candidate === inventoryName
      || (
        candidate.length >= 4
        && inventoryName.length >= 4
        && (candidate.includes(inventoryName) || inventoryName.includes(candidate))
      )
    ));
  });
  if (nameMatches.length === 0) return null;

  const recommendationStrength = extractMedicineStrengthMg(recommendation.spec);
  if (recommendationStrength !== null) {
    const strengthMatches = nameMatches.filter((item) => {
      const inventoryStrength = extractMedicineStrengthMg(item.spec);
      return inventoryStrength !== null
        && Math.abs(inventoryStrength - recommendationStrength) < 0.01;
    });
    return strengthMatches
      .sort((left, right) => right.availableQuantity - left.availableQuantity)[0]
      || null;
  }

  return nameMatches.length === 1 ? nameMatches[0] : null;
}

export function alignMedicineRecommendationsToInventory<T>(
  recommendations: T[],
  inventory: AvailableMedicineInventoryCatalogItem[],
): T[] {
  return recommendations.map((recommendation) => {
    if (!recommendation || typeof recommendation !== 'object') return recommendation;
    const record = recommendation as T & Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : undefined;
    const name = typeof record.name === 'string' ? record.name : '';
    const aliases = Array.isArray(record.aliases)
      ? record.aliases.filter((item): item is string => typeof item === 'string')
      : undefined;
    const spec = typeof record.spec === 'string' ? record.spec : undefined;
    if (type && type !== 'medicine') return recommendation;
    if (!name.trim()) return recommendation;
    const matched = findInventoryMedicine({ type, name, aliases, spec }, inventory);
    if (!matched) {
      return {
        ...record,
        name: cleanMedicineNameForPrompt(name),
      } as T;
    }
    return {
      ...record,
      name: matched.productName,
      spec: matched.spec || spec,
    } as T;
  });
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

export function formatAvailableMedicineInventoryPrompt(
  items: AvailableMedicineInventoryCatalogItem[],
): string {
  const lines = items.map((item) => {
    const name = cleanMedicineNameForPrompt(item.productName);
    const spec = item.spec ? `｜${item.spec}` : '';
    const quantity = `｜可用库存${formatQuantity(item.availableQuantity)}${item.unit || ''}`;
    return `- ${name}${spec}${quantity}`;
  });

  return [
    '【当前可用发药药房有效库存目录】',
    ...(lines.length > 0 ? lines : ['- 当前未取得可用库存药品']),
    '药品推荐顺序必须是：①优先选择目录内同品同规格；②同品不可用时选择目录内临床等效药；③只有目录内既无同品也无合适等效药时，才返回规范通用名作为无库存参考。',
    '库存命中项必须保持目录中的药品名称和规格；无库存参考不得写商品名，不得声称院内有库存。',
  ].join('\n');
}

export async function loadAvailableMedicineInventoryContext(
  options: LoadAvailableMedicineInventoryOptions = {},
): Promise<AvailableMedicineInventoryContext> {
  const adapter = options.adapter === undefined ? getHisAdapter() : options.adapter;
  if (!adapter) {
    return {
      items: [],
      promptContext: formatAvailableMedicineInventoryPrompt([]),
      pharmacyCount: 0,
      staleStoreCount: 0,
    };
  }

  const pharmacies = options.pharmacies ?? await adapter.fetchAvailablePharmacies();
  const storeIds = Array.from(new Set(
    pharmacies
      .map((pharmacy) => pharmacy.idSto?.trim() || '')
      .filter(Boolean),
  ));
  if (storeIds.length === 0) {
    return {
      items: [],
      promptContext: formatAvailableMedicineInventoryPrompt([]),
      pharmacyCount: 0,
      staleStoreCount: 0,
    };
  }

  const now = options.now ?? Date.now();
  const results = await Promise.allSettled(storeIds.map((storeId) => (
    loadStoreInventory(adapter, storeId, Boolean(options.forceRefresh), now)
  )));
  const loadedItems: AvailableMedicineInventoryItem[] = [];
  let staleStoreCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      loadedItems.push(...result.value.items);
      if (result.value.stale) staleStoreCount += 1;
      return;
    }
    console.warn('[AvailableMedicineInventory] Failed to load store inventory', {
      storeId: storeIds[index],
      error: result.reason,
    });
  });

  const items = mergeAvailableMedicineInventoryCatalog(loadedItems);
  return {
    items,
    promptContext: formatAvailableMedicineInventoryPrompt(items),
    pharmacyCount: storeIds.length,
    staleStoreCount,
  };
}
