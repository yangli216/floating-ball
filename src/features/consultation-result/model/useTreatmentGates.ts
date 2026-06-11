import { computed, type ComputedRef, type Ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { ExecDeptOption } from '@/utils/medicalDictionaryHelpers';
import type { PharmacyOption } from '@/services/his';
import { readFirstString } from '@features/clinical-result';

interface Deps {
  pharmacyOptions: Ref<PharmacyOption[]>;
  execDeptOptions: Ref<ExecDeptOption[]>;
}

function getMatchedMedicineStoreIds(rec: TreatmentRecommendation): string[] {
  if (!rec.matchedItem) return [];
  const direct = Array.isArray(rec.matchedItem.storeIds) ? rec.matchedItem.storeIds : [];
  const fromRaw = (() => {
    const raw = rec.matchedItem.raw as Record<string, unknown> | undefined;
    if (!raw) return [];
    const ids = raw.storeIds;
    if (Array.isArray(ids)) {
      return ids.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
    }
    return [];
  })();
  return Array.from(
    new Set(
      [...direct, ...fromRaw]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  );
}

export function useTreatmentGates(deps: Deps) {
  const { pharmacyOptions, execDeptOptions } = deps;

  function isPharmacyRequired(rec: TreatmentRecommendation): boolean {
    return rec.type === 'medicine';
  }

  function isExecDeptRequired(rec: TreatmentRecommendation): boolean {
    return rec.type === 'exam' || rec.type === 'lab_test' || rec.type === 'procedure';
  }

  function getBodySiteDisplay(rec: TreatmentRecommendation): string {
    const currentId = ((rec.bodySiteId || rec.matchedItem?.idPart || '').trim()
      || readFirstString(rec.matchedItem?.raw as Record<string, unknown> | undefined, ['idPart'])).trim();
    const currentText = (rec.bodySite || '').trim();
    if (currentText) return currentText;

    const matchedOption = (rec.bodySiteOptions || []).find((option) => option.partId === currentId);
    if (matchedOption?.name) {
      return matchedOption.name;
    }

    return currentId;
  }

  function isBodySiteRequired(rec: TreatmentRecommendation): boolean {
    return rec.type === 'exam';
  }

  function hasRequiredBodySite(rec: TreatmentRecommendation): boolean {
    return !isBodySiteRequired(rec) || !!getBodySiteDisplay(rec);
  }

  function getCandidatePharmaciesForMedicine(rec?: TreatmentRecommendation): PharmacyOption[] {
    const seen = new Set<string>();
    const allowedStoreIds = rec ? new Set(getMatchedMedicineStoreIds(rec)) : null;
    const uniquePharmacies = pharmacyOptions.value.filter((pharmacy) => {
      const idSto = (pharmacy.idSto || '').trim();
      if (!idSto || seen.has(idSto)) return false;
      seen.add(idSto);
      return true;
    });

    if (!allowedStoreIds || allowedStoreIds.size === 0) {
      return uniquePharmacies;
    }

    return uniquePharmacies.filter((pharmacy) => allowedStoreIds.has((pharmacy.idSto || '').trim()));
  }

  function getPharmacyDisplay(rec: TreatmentRecommendation): string {
    const currentValue = (rec.pharmacy || '').trim();
    if (!currentValue) return '';

    const allowed = isPharmacyRequired(rec)
      ? getCandidatePharmaciesForMedicine(rec)
      : pharmacyOptions.value;
    const matched = allowed.find((option) => option.name === currentValue || option.idSto === currentValue);
    return matched?.name || '';
  }

  function hasRequiredPharmacy(rec: TreatmentRecommendation): boolean {
    return !isPharmacyRequired(rec) || !!getPharmacyDisplay(rec);
  }

  function getExecDeptDisplay(rec: TreatmentRecommendation): string {
    const currentValue = (rec.execDept || '').trim();
    if (!currentValue) return '';

    const matched = execDeptOptions.value.find((option) => option.key === currentValue || option.text === currentValue);
    return matched?.text || currentValue;
  }

  function hasRequiredExecDept(rec: TreatmentRecommendation): boolean {
    return !isExecDeptRequired(rec) || !!getExecDeptDisplay(rec);
  }

  function ensurePharmacy(rec: TreatmentRecommendation): void {
    if (!isPharmacyRequired(rec)) return;
    if ((rec.pharmacy || '').trim()) return;
    const candidates = getCandidatePharmaciesForMedicine(rec);
    if (candidates.length === 0) return;
    rec.pharmacy = candidates[0].name;
  }

  const isExecDeptSatisfied = (rec: TreatmentRecommendation) => hasRequiredExecDept(rec);

  function pharmacyCandidatesFor(rec: TreatmentRecommendation): PharmacyOption[] {
    return getCandidatePharmaciesForMedicine(rec);
  }

  const execDeptCandidates: ComputedRef<ExecDeptOption[]> = computed(() => execDeptOptions.value);

  return {
    isPharmacyRequired,
    isExecDeptRequired,
    isBodySiteRequired,
    hasRequiredPharmacy,
    hasRequiredExecDept,
    hasRequiredBodySite,
    getPharmacyDisplay,
    getExecDeptDisplay,
    getBodySiteDisplay,
    ensurePharmacy,
    isExecDeptSatisfied,
    pharmacyCandidatesFor,
    execDeptCandidates,
    getMatchedMedicineStoreIds,
  };
}

export type TreatmentGates = ReturnType<typeof useTreatmentGates>;
