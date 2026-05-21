import { ref, shallowRef } from 'vue';
import type { Diagnosis } from '@/types/consultation';

export interface RelatedDiagnosisCandidate {
  id?: string;
  code: string;
  name: string;
}

export interface RelatedDiagnosisDropdownOptions<TCandidate extends RelatedDiagnosisCandidate> {
  getDiagnosisKey: (diagnosis: Diagnosis) => string;
  getCandidates: (diagnosis: Diagnosis) => TCandidate[];
}

export function useRelatedDiagnosisDropdown<TCandidate extends RelatedDiagnosisCandidate>(
  options: RelatedDiagnosisDropdownOptions<TCandidate>,
) {
  const openRelatedId = ref<string | null>(null);
  const inlineRelatedDiagnoses = shallowRef<TCandidate[]>([]);

  function closeRelatedDropdown(): void {
    openRelatedId.value = null;
    inlineRelatedDiagnoses.value = [];
  }

  function toggleRelatedDropdown(diag: Diagnosis, event?: Event): void {
    if (!event) {
      return;
    }
    event.stopPropagation();

    const targetId = options.getDiagnosisKey(diag);
    if (openRelatedId.value === targetId) {
      closeRelatedDropdown();
      return;
    }

    openRelatedId.value = targetId;
    inlineRelatedDiagnoses.value = options.getCandidates(diag);
  }

  function isRelatedDropdownOpen(diag: Diagnosis): boolean {
    return openRelatedId.value === options.getDiagnosisKey(diag);
  }

  function getRelatedDropdownCandidates(diag: Diagnosis): TCandidate[] {
    return isRelatedDropdownOpen(diag) ? inlineRelatedDiagnoses.value : [];
  }

  function completeRelatedSwap(): void {
    closeRelatedDropdown();
  }

  return {
    closeRelatedDropdown,
    completeRelatedSwap,
    getRelatedDropdownCandidates,
    inlineRelatedDiagnoses,
    isRelatedDropdownOpen,
    openRelatedId,
    toggleRelatedDropdown,
  };
}
