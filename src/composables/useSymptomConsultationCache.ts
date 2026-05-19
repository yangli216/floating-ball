import { nextTick, watch, type Ref, type ShallowRef } from 'vue';
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

type ReactiveValue<T> = Ref<T> | ShallowRef<T>;

export interface SymptomConsultationCacheRuntimeOptions {
  consultationId: () => string;
  currentView: Ref<SymptomConsultationInnerView>;
  consultationMode: Ref<SymptomConsultationMode>;
  selectionMode: Ref<SymptomSelectionMode>;
  symptoms: ReactiveValue<unknown[]>;
  patientInfo: Ref<Patient>;
  selectedSymptoms: Ref<unknown[]>;
  formData: Ref<Record<string, unknown>>;
  searchQuery: Ref<string>;
  selectedCategories: Ref<string[]>;
  companionSymptoms: Ref<Set<string>>;
  generatedRecord: Ref<SymptomConsultationSnapshot['generatedRecord']>;
  finalRecord: Ref<FinalRecord | null>;
  aiDiagnoses: Ref<Diagnosis[]>;
  selectedDiagnosis: Ref<Diagnosis | null>;
  relatedDiagnoses: Ref<unknown[]>;
  treatmentRecommendations: Ref<TreatmentRecommendation[]>;
  examRecommendations: Ref<TreatmentRecommendation[]>;
  labTestRecommendations: Ref<TreatmentRecommendation[]>;
  procedureRecommendations: Ref<TreatmentRecommendation[]>;
  referenceStatusMap: Ref<Record<string, SymptomReferenceStatusSnapshot>>;
  activeReferenceRequest: Ref<SymptomReferenceRequestSnapshot | null>;
  lastReferenceFeedback: Ref<SymptomReferenceRequestSnapshot | null>;
  knowledgeSearchKeyword: Ref<string>;
  knowledgeSearchType: Ref<string>;
  hasKnowledgeResults: Ref<boolean>;
  showKnowledgePanel: Ref<boolean>;
  createEmptyGeneratedRecord: () => SymptomConsultationSnapshot['generatedRecord'];
  getTemplates: (mode: SymptomConsultationMode) => unknown[];
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

function cloneSnapshotValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
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

export function useSymptomConsultationCacheSession(options: SymptomConsultationCacheRuntimeOptions) {
  let isRestoringSnapshot = false;
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  const hasRecoverableState = (): boolean => {
    return options.currentView.value !== 'consultation'
      || options.selectedSymptoms.value.length > 0
      || options.generatedRecord.value.chiefComplaint.trim() !== ''
      || options.generatedRecord.value.historyOfPresentIllness.trim() !== ''
      || options.aiDiagnoses.value.length > 0
      || options.treatmentRecommendations.value.length > 0
      || options.examRecommendations.value.length > 0
      || options.labTestRecommendations.value.length > 0
      || options.procedureRecommendations.value.length > 0
      || options.selectedDiagnosis.value !== null;
  };

  const buildSnapshot = (): SymptomConsultationSnapshot | null => {
    const consultationId = options.consultationId();
    if (!consultationId || consultationId === 'unknown' || !hasRecoverableState()) {
      return null;
    }

    return {
      consultationId,
      currentView: options.currentView.value,
      consultationMode: options.consultationMode.value,
      selectionMode: options.selectionMode.value,
      patientInfo: cloneSnapshotValue(options.patientInfo.value),
      selectedSymptoms: cloneSnapshotValue(options.selectedSymptoms.value),
      formData: cloneSnapshotValue(options.formData.value),
      searchQuery: options.searchQuery.value,
      selectedCategories: cloneSnapshotValue(options.selectedCategories.value),
      companionSymptoms: Array.from(options.companionSymptoms.value),
      generatedRecord: cloneSnapshotValue(options.generatedRecord.value),
      finalRecord: cloneSnapshotValue(options.finalRecord.value),
      aiDiagnoses: cloneSnapshotValue(options.aiDiagnoses.value),
      selectedDiagnosis: cloneSnapshotValue(options.selectedDiagnosis.value),
      relatedDiagnoses: cloneSnapshotValue(options.relatedDiagnoses.value),
      treatmentRecommendations: cloneSnapshotValue(options.treatmentRecommendations.value),
      examRecommendations: cloneSnapshotValue(options.examRecommendations.value),
      labTestRecommendations: cloneSnapshotValue(options.labTestRecommendations.value),
      procedureRecommendations: cloneSnapshotValue(options.procedureRecommendations.value),
      referenceStatusMap: cloneSnapshotValue(options.referenceStatusMap.value),
      activeReferenceRequest: cloneSnapshotValue(options.activeReferenceRequest.value),
      lastReferenceFeedback: cloneSnapshotValue(options.lastReferenceFeedback.value),
      knowledgeSearchKeyword: options.knowledgeSearchKeyword.value,
      knowledgeSearchType: options.knowledgeSearchType.value,
      hasKnowledgeResults: options.hasKnowledgeResults.value,
      showKnowledgePanel: options.showKnowledgePanel.value,
      savedAt: Date.now(),
    };
  };

  const persistSnapshot = (): void => {
    if (isRestoringSnapshot) return;
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    writeSymptomConsultationCache(snapshot);
  };

  const schedulePersistSnapshot = (): void => {
    if (isRestoringSnapshot) return;
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
    }
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      persistSnapshot();
    }, 300);
  };

  const restoreSnapshot = (snapshot: SymptomConsultationSnapshot): void => {
    isRestoringSnapshot = true;
    try {
      const mode = snapshot.consultationMode || 'western';
      options.consultationMode.value = mode;
      options.selectionMode.value = snapshot.selectionMode || 'common';
      options.symptoms.value = options.getTemplates(mode);
      options.patientInfo.value = {
        ...options.patientInfo.value,
        ...cloneSnapshotValue(snapshot.patientInfo),
      };
      options.selectedSymptoms.value = cloneSnapshotValue(snapshot.selectedSymptoms || []);
      options.formData.value = cloneSnapshotValue(snapshot.formData || {});
      options.searchQuery.value = snapshot.searchQuery || '';
      options.selectedCategories.value = cloneSnapshotValue(snapshot.selectedCategories || []);
      options.companionSymptoms.value = new Set(snapshot.companionSymptoms || []);
      options.generatedRecord.value = {
        ...options.createEmptyGeneratedRecord(),
        ...cloneSnapshotValue(snapshot.generatedRecord || {}),
      };
      options.finalRecord.value = cloneSnapshotValue(snapshot.finalRecord || null);
      options.aiDiagnoses.value = cloneSnapshotValue(snapshot.aiDiagnoses || []);
      options.selectedDiagnosis.value = cloneSnapshotValue(snapshot.selectedDiagnosis || null);
      options.relatedDiagnoses.value = cloneSnapshotValue(snapshot.relatedDiagnoses || []);
      options.treatmentRecommendations.value = cloneSnapshotValue(snapshot.treatmentRecommendations || []);
      options.examRecommendations.value = cloneSnapshotValue(snapshot.examRecommendations || []);
      options.labTestRecommendations.value = cloneSnapshotValue(snapshot.labTestRecommendations || []);
      options.procedureRecommendations.value = cloneSnapshotValue(snapshot.procedureRecommendations || []);
      options.referenceStatusMap.value = cloneSnapshotValue(snapshot.referenceStatusMap || {});
      options.activeReferenceRequest.value = cloneSnapshotValue(snapshot.activeReferenceRequest || null);
      options.lastReferenceFeedback.value = cloneSnapshotValue(snapshot.lastReferenceFeedback || null);
      options.knowledgeSearchKeyword.value = snapshot.knowledgeSearchKeyword || '';
      options.knowledgeSearchType.value = snapshot.knowledgeSearchType || 'diagnosis';
      options.hasKnowledgeResults.value = Boolean(snapshot.hasKnowledgeResults);
      options.showKnowledgePanel.value = Boolean(snapshot.showKnowledgePanel);
      options.currentView.value = snapshot.currentView || 'consultation';
    } finally {
      nextTick(() => {
        isRestoringSnapshot = false;
      });
    }
  };

  const restoreCachedSnapshot = (): boolean => {
    const consultationId = options.consultationId();
    if (!consultationId || consultationId === 'unknown') {
      return false;
    }

    const snapshot = readSymptomConsultationCache(consultationId);
    if (!snapshot) {
      return false;
    }

    restoreSnapshot(snapshot);
    return true;
  };

  const clearSnapshot = (): void => {
    clearSymptomConsultationCache(options.consultationId());
  };

  const stopPersistWatch = watch(
    [
      options.currentView,
      options.consultationMode,
      options.selectionMode,
      options.selectedSymptoms,
      options.formData,
      options.searchQuery,
      options.selectedCategories,
      options.companionSymptoms,
      options.generatedRecord,
      options.finalRecord,
      options.aiDiagnoses,
      options.selectedDiagnosis,
      options.relatedDiagnoses,
      options.treatmentRecommendations,
      options.examRecommendations,
      options.labTestRecommendations,
      options.procedureRecommendations,
      options.referenceStatusMap,
      options.activeReferenceRequest,
      options.lastReferenceFeedback,
      options.knowledgeSearchKeyword,
      options.knowledgeSearchType,
      options.hasKnowledgeResults,
      options.showKnowledgePanel,
    ],
    schedulePersistSnapshot,
    { deep: true },
  );

  const stop = (): void => {
    stopPersistWatch();
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
  };

  return {
    restoreCachedSnapshot,
    persistSnapshot,
    clearSnapshot,
    stop,
  };
}
