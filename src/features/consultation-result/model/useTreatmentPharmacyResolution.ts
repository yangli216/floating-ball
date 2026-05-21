import type { PharmacyOption } from '@/services/his';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getMatchedItemRaw,
  readFirstString,
} from '@features/clinical-result';
import type { TreatmentGates } from './useTreatmentGates';

export interface TreatmentPharmacyResolutionOptions {
  pharmacyOptions: () => PharmacyOption[];
  treatmentGates: TreatmentGates;
  warn?: (message: string, payload?: Record<string, unknown>) => void;
}

function dedupePharmacyOptions(options: PharmacyOption[]): PharmacyOption[] {
  const seen = new Set<string>();
  return options.filter((pharmacy) => {
    const idSto = (pharmacy.idSto || '').trim();
    if (!idSto || seen.has(idSto)) {
      return false;
    }
    seen.add(idSto);
    return true;
  });
}

export function useTreatmentPharmacyResolution(options: TreatmentPharmacyResolutionOptions) {
  const { treatmentGates } = options;

  function getMatchedMedicineStoreIds(rec: TreatmentRecommendation): string[] {
    return treatmentGates.getMatchedMedicineStoreIds(rec);
  }

  function getCandidatePharmaciesForMedicine(rec?: TreatmentRecommendation): PharmacyOption[] {
    const allPharmacies = options.pharmacyOptions();
    if (!rec) {
      return dedupePharmacyOptions(allPharmacies);
    }

    const scoped = treatmentGates.pharmacyCandidatesFor(rec);
    const matchedStoreIds = getMatchedMedicineStoreIds(rec);
    if (scoped.length === 0 && matchedStoreIds.length > 0) {
      options.warn?.('Matched medicine storeIds do not intersect current available pharmacies', {
        name: rec.name,
        matchedStoreIds,
        availableStoreIds: allPharmacies.map((pharmacy) => pharmacy.idSto).filter(Boolean),
      });
    }
    return scoped;
  }

  function getDefaultPharmacyOption(rec?: TreatmentRecommendation): PharmacyOption | undefined {
    if (rec) {
      const candidates = getCandidatePharmaciesForMedicine(rec);
      if (candidates.length > 0) {
        return candidates[0];
      }
    }
    return options.pharmacyOptions()[0];
  }

  function ensureMedicineDefaultPharmacy(rec: TreatmentRecommendation): void {
    if (rec.type !== 'medicine' || (rec.pharmacy || '').trim()) {
      return;
    }

    const raw = getMatchedItemRaw(rec);
    if (raw?.__medicineDetailLoaded !== true) {
      return;
    }

    const allowed = getCandidatePharmaciesForMedicine(rec);
    const detailStoreId = readFirstString(raw, ['idSto']);
    const matchedPharmacy = allowed.find((option) => option.idSto === detailStoreId) || allowed[0];
    if (matchedPharmacy?.name) {
      rec.pharmacy = matchedPharmacy.name;
    }
  }

  function findMatchedPharmacyOption(
    rec: TreatmentRecommendation,
    currentValue?: string,
  ): PharmacyOption | undefined {
    const normalizedValue = (currentValue || '').trim();
    if (!normalizedValue) {
      return undefined;
    }

    const allPharmacies = options.pharmacyOptions();
    const allowed = rec.type === 'medicine'
      ? getCandidatePharmaciesForMedicine(rec)
      : allPharmacies;

    return allowed.find((option) => option.name === normalizedValue || option.idSto === normalizedValue)
      || allPharmacies.find((option) => option.name === normalizedValue || option.idSto === normalizedValue);
  }

  function getNormalizedPharmacyValue(rec: TreatmentRecommendation): string {
    const currentValue = (rec.pharmacy || '').trim();
    if (!currentValue) {
      return '';
    }

    return findMatchedPharmacyOption(rec, currentValue)?.name || currentValue;
  }

  function normalizeMedicinePharmacyValue(rec: TreatmentRecommendation): void {
    if (rec.type !== 'medicine') {
      return;
    }

    const currentValue = (rec.pharmacy || '').trim();
    if (!currentValue) {
      return;
    }

    const normalizedValue = getNormalizedPharmacyValue(rec);
    if (normalizedValue && normalizedValue !== currentValue) {
      rec.pharmacy = normalizedValue;
    }
  }

  function normalizeMedicinePharmacyValues(items: TreatmentRecommendation[]): void {
    items.forEach((item) => {
      normalizeMedicinePharmacyValue(item);
    });
  }

  return {
    getMatchedMedicineStoreIds,
    getCandidatePharmaciesForMedicine,
    getDefaultPharmacyOption,
    ensureMedicineDefaultPharmacy,
    findMatchedPharmacyOption,
    getNormalizedPharmacyValue,
    normalizeMedicinePharmacyValue,
    normalizeMedicinePharmacyValues,
  };
}

export type TreatmentPharmacyResolution = ReturnType<typeof useTreatmentPharmacyResolution>;
