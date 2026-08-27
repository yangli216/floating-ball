import { medicalDataService, type MedicalItem, type MedicineItem } from '@/services/medicalData';
import type { TreatmentRecommendation } from '@/types/consultation';

const STORAGE_KEY = 'CLINICAL_RESULT_MANUAL_MATCH_CACHE_V1';
const MAX_ENTRIES = 1000;

interface ManualMatchCacheEntry {
  orgCode: string;
  tenantId: string;
  type: TreatmentRecommendation['type'];
  sourceKey: string;
  targetId: string;
  targetName: string;
  confirmCount: number;
  lastConfirmedAt: number;
}

function normalizeScope(value: string | null | undefined): string {
  return (value || '').trim();
}

function normalizeSource(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s（）()\[\]【】,，、/／+＋\-—_]/gu, '');
}

function readEntries(): ManualMatchCacheEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed as ManualMatchCacheEntry[] : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: ManualMatchCacheEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      entries.sort((a, b) => b.lastConfirmedAt - a.lastConfirmedAt).slice(0, MAX_ENTRIES),
    ));
  } catch (error) {
    console.warn('[ManualMatchCache] Failed to persist mapping cache', error);
  }
}

function isReceptionScopedAuxiliaryType(type: TreatmentRecommendation['type']): boolean {
  return type === 'exam' || type === 'lab_test';
}

function readPersistentEntries(): ManualMatchCacheEntry[] {
  const entries = readEntries();
  const persistentEntries = entries.filter((entry) => !isReceptionScopedAuxiliaryType(entry.type));
  if (persistentEntries.length !== entries.length) {
    writeEntries(persistentEntries);
  }
  return persistentEntries;
}

function getCurrentScope(): { orgCode: string; tenantId: string } | null {
  const context = medicalDataService.getCatalogContext();
  const orgCode = normalizeScope(context.orgCode);
  const tenantId = normalizeScope(context.tenantId);
  if (!orgCode || !tenantId) return null;
  return { orgCode, tenantId };
}

function findCurrentTarget(
  type: TreatmentRecommendation['type'],
  targetId: string,
): MedicalItem | MedicineItem | null {
  if (type === 'medicine') {
    return medicalDataService.getMatchableMedicines().find((item) => item.id === targetId) || null;
  }
  const expectedCategory = type === 'exam' ? '检查' : type === 'lab_test' ? '检验' : type === 'procedure' ? '治疗' : '';
  if (!expectedCategory) return null;
  return medicalDataService.getAllItems().find(
    (item) => item.id === targetId && item.category === expectedCategory,
  ) || null;
}

export function rememberManualCatalogMatch(
  type: TreatmentRecommendation['type'],
  sourceName: string,
  target: Pick<MedicalItem | MedicineItem, 'id' | 'name'>,
): void {
  const entries = readPersistentEntries();
  if (isReceptionScopedAuxiliaryType(type)) return;

  const scope = getCurrentScope();
  const sourceKey = normalizeSource(sourceName);
  if (!scope || !sourceKey || !target.id) return;

  const index = entries.findIndex((entry) => (
    entry.orgCode === scope.orgCode
    && entry.tenantId === scope.tenantId
    && entry.type === type
    && entry.sourceKey === sourceKey
  ));
  const current = index >= 0 ? entries[index] : null;
  const next: ManualMatchCacheEntry = {
    ...scope,
    type,
    sourceKey,
    targetId: target.id,
    targetName: target.name,
    confirmCount: (current?.targetId === target.id ? current.confirmCount : 0) + 1,
    lastConfirmedAt: Date.now(),
  };
  if (index >= 0) entries.splice(index, 1);
  entries.push(next);
  writeEntries(entries);
}

export function resolveRememberedCatalogTarget(
  type: TreatmentRecommendation['type'],
  sourceName: string,
): MedicalItem | MedicineItem | undefined {
  const entries = readPersistentEntries();
  if (isReceptionScopedAuxiliaryType(type)) return undefined;

  const scope = getCurrentScope();
  const sourceKey = normalizeSource(sourceName);
  if (!scope || !sourceKey) return undefined;

  const entry = entries.find((candidate) => (
    candidate.orgCode === scope.orgCode
    && candidate.tenantId === scope.tenantId
    && candidate.type === type
    && candidate.sourceKey === sourceKey
  ));
  if (!entry) return undefined;

  const target = findCurrentTarget(type, entry.targetId);
  if (!target) {
    writeEntries(entries.filter((candidate) => candidate !== entry));
    return undefined;
  }
  return target;
}
