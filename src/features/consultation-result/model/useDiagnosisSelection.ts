import { computed, ref, type Ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import {
  getClinicalDiagnosisIdentity,
  getDiagnosisKey,
  getStandardDiagnosisKey,
} from '@features/clinical-result';

interface Options {
  diagnoses: Readonly<Ref<readonly Diagnosis[]>>;
}

export function useDiagnosisSelection(options: Options) {
  const selectedDiagnosis = ref<Diagnosis | null>(null);
  const selectedDiagnosisKeys = ref<Set<string>>(new Set());

  const selectedDiagnoses = computed(() =>
    options.diagnoses.value.filter((diag) => selectedDiagnosisKeys.value.has(getDiagnosisKey(diag))),
  );

  function getDiagnosisIdentity(diag: Diagnosis | null): string {
    return getClinicalDiagnosisIdentity(diag);
  }

  function isDiagnosisSelected(diag: Diagnosis): boolean {
    return selectedDiagnosisKeys.value.has(getDiagnosisKey(diag));
  }

  function isPrimaryDiagnosis(diag: Diagnosis): boolean {
    return getDiagnosisKey(selectedDiagnosis.value) === getDiagnosisKey(diag);
  }

  function setDiagnosisSelection(keys: Iterable<string>): void {
    selectedDiagnosisKeys.value = new Set(Array.from(keys).filter(Boolean));
  }

  function syncPrimaryDiagnosis(preferred?: Diagnosis | null): void {
    const preferredKey = getDiagnosisKey(preferred);
    if (preferred && selectedDiagnosisKeys.value.has(preferredKey)) {
      selectedDiagnosis.value = preferred;
      return;
    }

    const currentKey = getDiagnosisKey(selectedDiagnosis.value);
    if (currentKey && selectedDiagnosisKeys.value.has(currentKey)) {
      const matchedCurrent = options.diagnoses.value.find((diag) => getDiagnosisKey(diag) === currentKey);
      selectedDiagnosis.value = matchedCurrent || null;
      if (selectedDiagnosis.value) {
        return;
      }
    }

    selectedDiagnosis.value =
      options.diagnoses.value.find((diag) => selectedDiagnosisKeys.value.has(getDiagnosisKey(diag))) || null;
  }

  function replaceDiagnosisSelection(diags: Diagnosis[], primary?: Diagnosis | null): void {
    setDiagnosisSelection(diags.map((diag) => getDiagnosisKey(diag)));
    syncPrimaryDiagnosis(primary || diags[0] || null);
  }

  function resetDiagnosisSelection(): void {
    selectedDiagnosisKeys.value = new Set();
    selectedDiagnosis.value = null;
  }

  function toggleDiagnosis(diag: Diagnosis): void {
    if (isPrimaryDiagnosis(diag)) {
      return;
    }

    if (!isDiagnosisSelected(diag)) {
      const nextKeys = new Set(selectedDiagnosisKeys.value);
      nextKeys.add(getDiagnosisKey(diag));
      setDiagnosisSelection(nextKeys);
      selectedDiagnosis.value = diag;
      return;
    }

    if (!isPrimaryDiagnosis(diag)) {
      selectedDiagnosis.value = diag;
    }
  }

  function setPrimaryDiagnosis(diag: Diagnosis): void {
    if (!isDiagnosisSelected(diag)) {
      const nextKeys = new Set(selectedDiagnosisKeys.value);
      nextKeys.add(getDiagnosisKey(diag));
      setDiagnosisSelection(nextKeys);
    }
    selectedDiagnosis.value = diag;
  }

  function removeDiagnosis(diag: Diagnosis): void {
    const key = getDiagnosisKey(diag);
    if (!key || !selectedDiagnosisKeys.value.has(key)) {
      return;
    }

    const nextKeys = new Set(selectedDiagnosisKeys.value);
    nextKeys.delete(key);
    if (nextKeys.size === 0) {
      return;
    }

    setDiagnosisSelection(nextKeys);
    if (isPrimaryDiagnosis(diag)) {
      syncPrimaryDiagnosis();
    }
  }

  function replaceDiagnosisInSelection(originalDiag: Diagnosis, updatedDiag: Diagnosis): void {
    const originalKey = getDiagnosisKey(originalDiag);
    const updatedKey = getDiagnosisKey(updatedDiag);
    if (selectedDiagnosisKeys.value.has(originalKey)) {
      const nextKeys = new Set(selectedDiagnosisKeys.value);
      nextKeys.delete(originalKey);
      nextKeys.add(updatedKey);
      setDiagnosisSelection(nextKeys);
    }

    if (selectedDiagnosis.value && getStandardDiagnosisKey(selectedDiagnosis.value) === getStandardDiagnosisKey(originalDiag)) {
      selectedDiagnosis.value = updatedDiag;
    } else {
      syncPrimaryDiagnosis();
    }
  }

  return {
    selectedDiagnosis,
    selectedDiagnosisKeys,
    selectedDiagnoses,
    getDiagnosisIdentity,
    isDiagnosisSelected,
    isPrimaryDiagnosis,
    setDiagnosisSelection,
    syncPrimaryDiagnosis,
    replaceDiagnosisSelection,
    resetDiagnosisSelection,
    toggleDiagnosis,
    setPrimaryDiagnosis,
    removeDiagnosis,
    replaceDiagnosisInSelection,
  };
}

export type DiagnosisSelection = ReturnType<typeof useDiagnosisSelection>;
