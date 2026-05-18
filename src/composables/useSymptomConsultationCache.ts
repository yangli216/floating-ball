import type { Diagnosis, Patient, TreatmentRecommendation, FinalRecord } from '../types/consultation';

export type SymptomConsultationInnerView = 'consultation' | 'record' | 'final_report';
export type SymptomConsultationMode = 'western' | 'tcm';
export type SymptomSelectionMode = 'common' | 'bodyPart' | 'system';

export interface SymptomReferenceStatusSnapshot {
  status: 'pending' | 'success' | 'failed';
  requestId: string;
  message?: string;
  updatedAt: number;
}

export interface SymptomReferenceRequestSnapshot {
  consultationId?: string;
  requestId: string;
  referenceType?: string;
  action: string;
  status: 'pending' | 'success' | 'failed';
  message?: string;
  items?: Array<{
    name: string;
    code?: string;
    type: 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure';
    isTCM?: boolean;
    idCli?: string;
  }>;
  timestamp?: number;
}

export interface SymptomConsultationSnapshot {
  consultationId: string;
  currentView: SymptomConsultationInnerView;
  consultationMode: SymptomConsultationMode;
  selectionMode: SymptomSelectionMode;
  patientInfo: Patient;
  selectedSymptoms: unknown[];
  formData: Record<string, unknown>;
  searchQuery: string;
  selectedCategories: string[];
  companionSymptoms: string[];
  generatedRecord: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    tcmFourExaminations?: string;
    familyHistory?: string;
  };
  finalRecord: FinalRecord | null;
  aiDiagnoses: Diagnosis[];
  selectedDiagnosis: Diagnosis | null;
  relatedDiagnoses: unknown[];
  treatmentRecommendations: TreatmentRecommendation[];
  examRecommendations: TreatmentRecommendation[];
  labTestRecommendations: TreatmentRecommendation[];
  procedureRecommendations: TreatmentRecommendation[];
  referenceStatusMap: Record<string, SymptomReferenceStatusSnapshot>;
  activeReferenceRequest: SymptomReferenceRequestSnapshot | null;
  lastReferenceFeedback: SymptomReferenceRequestSnapshot | null;
  knowledgeSearchKeyword: string;
  knowledgeSearchType: string;
  hasKnowledgeResults: boolean;
  showKnowledgePanel: boolean;
  savedAt: number;
}

const SYMPTOM_CONSULTATION_CACHE_PREFIX = 'SYMPTOM_CONSULTATION_CACHE_V1';

function getCacheKey(consultationId: string): string {
  return `${SYMPTOM_CONSULTATION_CACHE_PREFIX}:${consultationId}`;
}

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function cloneForStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function readSymptomConsultationCache(consultationId: string): SymptomConsultationSnapshot | null {
  if (!consultationId || consultationId === 'unknown') {
    return null;
  }

  try {
    const raw = localStorage.getItem(getCacheKey(consultationId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SymptomConsultationSnapshot;
    if (!parsed?.consultationId || parsed.consultationId !== consultationId) {
      return null;
    }

    if (typeof parsed.savedAt === 'number' && !isSameLocalDay(parsed.savedAt, Date.now())) {
      clearSymptomConsultationCache(consultationId);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('[SymptomConsultationCache] Failed to read cache:', consultationId, error);
    return null;
  }
}

export function writeSymptomConsultationCache(snapshot: SymptomConsultationSnapshot): void {
  if (!snapshot.consultationId || snapshot.consultationId === 'unknown') {
    return;
  }

  try {
    localStorage.setItem(
      getCacheKey(snapshot.consultationId),
      JSON.stringify(cloneForStorage({
        ...snapshot,
        savedAt: Date.now(),
      })),
    );
  } catch (error) {
    console.warn('[SymptomConsultationCache] Failed to write cache:', snapshot.consultationId, error);
  }
}

export function clearSymptomConsultationCache(consultationId: string): void {
  if (!consultationId || consultationId === 'unknown') {
    return;
  }

  try {
    localStorage.removeItem(getCacheKey(consultationId));
  } catch (error) {
    console.warn('[SymptomConsultationCache] Failed to clear cache:', consultationId, error);
  }
}
