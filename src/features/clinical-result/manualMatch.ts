import type { TreatmentRecommendation } from '../../types/consultation';
import {
  medicalDataService,
  type MedicalItem,
  type MedicineItem,
} from '../../services/medicalData';
import {
  buildMedicalItemMatchedItem,
  buildMedicineMatchedItem,
} from './recommendationHelpers';

export interface ManualMatchCandidateView {
  id: string;
  name: string;
  meta?: string;
}

export type ManualMatchRawCandidate = MedicineItem | MedicalItem;

export function getManualMatchKey(rec: TreatmentRecommendation): string {
  return `manual-match:${rec.type}:${rec.name}`;
}

export function getManualMatchSearchKey(rec: TreatmentRecommendation): string {
  return `${getManualMatchKey(rec)}:search`;
}

export function isMedicineManualMatchCandidate(candidate: ManualMatchRawCandidate): candidate is MedicineItem {
  return 'spec' in candidate;
}

export function findManualMatchCandidates(
  rec: TreatmentRecommendation,
  keyword: string,
  limit = 8
): ManualMatchRawCandidate[] {
  const query = keyword.trim();
  if (!query) {
    return [];
  }

  switch (rec.type) {
    case 'medicine':
      return medicalDataService.searchMedicines(query, undefined, limit);
    case 'exam':
      return medicalDataService.searchExamItems(query, undefined, limit);
    case 'lab_test':
      return medicalDataService.searchLabTestItems(query, undefined, limit);
    case 'procedure':
      return medicalDataService.searchProcedureItems(query, undefined, limit);
    default:
      return [];
  }
}

export function toManualMatchCandidateView(candidate: ManualMatchRawCandidate): ManualMatchCandidateView {
  return {
    id: candidate.id,
    name: candidate.name,
    meta: isMedicineManualMatchCandidate(candidate)
      ? candidate.spec || ''
      : candidate.code || '',
  };
}

export function applyManualMatchCandidate(
  rec: TreatmentRecommendation,
  candidate: ManualMatchRawCandidate
): boolean {
  if (rec.type === 'medicine' && isMedicineManualMatchCandidate(candidate)) {
    rec.matchedItem = buildMedicineMatchedItem(candidate);
    rec.spec = candidate.spec || rec.spec || '';
  } else if (rec.type !== 'medicine' && !isMedicineManualMatchCandidate(candidate)) {
    rec.matchedItem = buildMedicalItemMatchedItem(candidate);
  } else {
    return false;
  }

  rec.originalName = rec.originalName || rec.name;
  rec.name = candidate.name;
  rec.manualMatched = true;
  rec.matchStatus = 'manual';
  rec.selected = false;
  rec.suggestedMatchItem = undefined;
  return true;
}
