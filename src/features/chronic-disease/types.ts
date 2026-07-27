import type { PatientMemoryBrief } from '@entities/patient-memory';
import type { AppPatient } from '@/types/appState';

export type {
  TcdVisitDrugItem,
  TcdVisitForm,
  TcdVisitKind,
  TcdVisitStatus,
} from '@/services/his';

export type ChronicDiseaseType = 'hypertension' | 'type2_diabetes';
export type ChronicDiseaseWindowKind = 'follow-up' | 'path' | 'prescription' | 'assessment';
export type ChronicMetricKind = 'blood-pressure' | 'blood-glucose';
export type ChronicFactSource = 'public-health' | 'clinical' | 'unavailable';

export interface ChronicDiseaseTag {
  diseaseType: ChronicDiseaseType;
  label: string;
  source: ChronicFactSource;
  sourceLabel: string;
  evidenceText?: string;
}

export interface BloodPressurePoint {
  measuredAt: string;
  systolic: number;
  diastolic: number;
  sourceLabel: string;
}

export interface BloodGlucosePoint {
  measuredAt: string;
  value: number;
  measurementType: 'fasting' | 'postprandial' | 'random' | 'unknown';
  sourceLabel: string;
}

export interface ChronicMedicationFact {
  name: string;
  idDrug?: string;
  regimenText?: string;
  sdDrugFreq?: string;
  perDose?: string;
  doseUnit?: string;
  insulin?: '1' | '2';
  observedAt?: string;
  sourceLabel: string;
}

export interface ChronicDiseasePatientSummary {
  idPhr: string;
  idRecord: string;
  name: string;
  gender: string;
  ageText: string;
  avatarGender: 'M' | 'F';
  organizationId?: string;
  organizationName?: string;
  doctorId?: string;
  doctorName?: string;
  contractLabel: string;
  contractSource: ChronicFactSource;
  diseaseTags: ChronicDiseaseTag[];
  managedDiseaseTypes: ChronicDiseaseType[];
  hasSupportedDisease: boolean;
  isChronicManaged: boolean;
  diagnosisText: string;
  lastVisitAt?: string;
  lastVisitLabel: string;
  latestDataAt?: string;
  latestHeightCm?: number;
  latestWeightKg?: number;
  latestWaistCm?: number;
  latestHeartRate?: number;
  bloodPressurePoints: BloodPressurePoint[];
  bloodGlucosePoints: BloodGlucosePoint[];
  recentMedicationFacts: ChronicMedicationFact[];
  recentMedicationNames: string[];
  recentMedicationSummaries?: string[];
  sourceQuality: 'ready' | 'partial' | 'unavailable';
}

export interface ChronicDiseaseSummaryInput {
  patient: AppPatient | null | undefined;
  patientMemoryBrief?: PatientMemoryBrief | null;
}

export interface ChronicDiseaseWindowPayload {
  requestId: string;
  kind: ChronicDiseaseWindowKind;
  diseaseType?: ChronicDiseaseType;
  patientAnchor: string;
  summary: ChronicDiseasePatientSummary;
  openedAt: string;
}

export type ClinicalPathNodeState = 'satisfied' | 'verify' | 'not-applicable';

export interface ClinicalPathNodeDefinition {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  evidenceHints: string[];
  verificationPrompt: string;
  safetyNote?: string;
}

export interface PublishedClinicalPath {
  diseaseType: ChronicDiseaseType;
  title: string;
  pathVersion: string;
  evidenceVersion: string;
  publishedAt: string;
  reviewStatus: 'published';
  contentHash: string;
  nodes: ClinicalPathNodeDefinition[];
  edges: Array<{ source: string; target: string }>;
}

export interface PublishedFollowUpTemplate {
  diseaseType: ChronicDiseaseType;
  templateVersion: string;
  ruleVersion: string;
  evidenceVersion: string;
  pathVersion: string;
  publishedAt: string;
  reviewStatus: 'published';
  symptomOptions: Array<{ code: string; label: string }>;
}

export type PrescriptionSuggestionCategory = 'test' | 'medicine-review' | 'lifestyle';

export interface HealthPrescriptionSuggestion {
  id: string;
  category: PrescriptionSuggestionCategory;
  title: string;
  detail: string;
  reason: string;
  accepted: boolean;
}

export interface HealthPrescriptionDraft {
  generatedAt: string;
  source: 'ai' | 'controlled-fallback';
  summary: string;
  suggestions: HealthPrescriptionSuggestion[];
  safetyNote: string;
}
