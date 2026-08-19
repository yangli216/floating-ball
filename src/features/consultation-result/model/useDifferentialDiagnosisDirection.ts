import { ref } from 'vue';

export interface DifferentialDiagnosisDirectionSnapshot {
  includedKeys: string[];
  promotedKeys: string[];
}

function normalizeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

export function useDifferentialDiagnosisDirection() {
  const includedKeys = ref<Set<string>>(new Set());
  const promotedKeys = ref<Set<string>>(new Set());

  function include(key: string): void {
    const normalized = key.trim();
    if (!normalized || promotedKeys.value.has(normalized)) return;
    includedKeys.value = new Set([...includedKeys.value, normalized]);
  }

  function remove(key: string): void {
    const normalized = key.trim();
    if (!normalized || !includedKeys.value.has(normalized)) return;
    const next = new Set(includedKeys.value);
    next.delete(normalized);
    includedKeys.value = next;
  }

  function promote(currentKey: string, promotedKey = currentKey): void {
    const current = currentKey.trim();
    const promoted = promotedKey.trim();
    if (!promoted) return;

    const nextIncluded = new Set(includedKeys.value);
    if (current) nextIncluded.delete(current);
    nextIncluded.delete(promoted);
    includedKeys.value = nextIncluded;
    promotedKeys.value = new Set([...promotedKeys.value, promoted]);
  }

  function isIncluded(key: string): boolean {
    return includedKeys.value.has(key.trim());
  }

  function isPromoted(key: string): boolean {
    return promotedKeys.value.has(key.trim());
  }

  function serialize(): DifferentialDiagnosisDirectionSnapshot {
    return {
      includedKeys: Array.from(includedKeys.value),
      promotedKeys: Array.from(promotedKeys.value),
    };
  }

  function restore(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const snapshot = value as Partial<DifferentialDiagnosisDirectionSnapshot>;
    const promoted = new Set(normalizeKeys(snapshot.promotedKeys));
    promotedKeys.value = promoted;
    includedKeys.value = new Set(
      normalizeKeys(snapshot.includedKeys).filter((key) => !promoted.has(key)),
    );
  }

  function reset(): void {
    includedKeys.value = new Set();
    promotedKeys.value = new Set();
  }

  return {
    includedKeys,
    promotedKeys,
    include,
    remove,
    promote,
    isIncluded,
    isPromoted,
    reset,
    restore,
    serialize,
  };
}

export type DifferentialDiagnosisDirection = ReturnType<typeof useDifferentialDiagnosisDirection>;
