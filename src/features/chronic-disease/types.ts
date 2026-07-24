import type { PatientMemoryBrief } from '@entities/patient-memory';
import type { AppPatient } from '@/types/appState';

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
  patientId: string;
  visitId?: string;
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

export type TcdVisitKind = '1' | '2';
export type TcdVisitStatus = '1' | '2' | '3';

export interface TcdVisitDrugItem {
  id: string;
  idDrug: string;
  idPherec: string;
  naDrug: string;
  sdDrugFreq: string;
  perDose: string;
  doseUnit: string;
  insulin: string;
}

/**
 * 对接系统原始 TcdVisitForm.getFormData() 的网络结构。
 * 原页面中的多选数组在提交前被 join(',')，因此这里必须是字符串。
 */
export interface ChronicDiseaseFollowUpRequest {
  idPhr: string;
  idRecord: string;
  id: string;
  status: TcdVisitStatus;
  sdVisitKind: string;
  dtHyPlan: string;
  dtDbsPlan: string;
  sdDataWay: string;
  stature: string;
  avoirdupois: string;
  advAdp: string;
  bmi: string;
  waistline: string;
  advWaistline: string;
  pressureH: string;
  pressureL: string;
  heartRate: string;
  glu: string;
  fbgMeal: string;
  isGlu: string;
  inputUser: string;
  idUser: string;
  sdHySymptom: string;
  sdDbsSymptom: string;
  desOther: string;
  sdArteriopalmus: string;
  sdProAct: string;
  sdPsychicAdj: string;
  fgCardiovascular: string;
  lowEffects: string;
  otherDisease: string;
  note: string;
  sdWehtherSmoke: string;
  daySmoke: string;
  advDaySmoke: string;
  sdWhetherDrink: string;
  dayDrink: string;
  advDayDrink: string;
  sdMainDrinking: string;
  sportWeek: string;
  advSportWeek: string;
  sportMinute: string;
  advSportMinute: string;
  sdSalt: string;
  sdAdvSalt: string;
  rice: string;
  targRice: string;
  fgDrugChange: string;
  sdDrugPro: string;
  sdSideEffects: string;
  desSideEffects: string;
  drugList: TcdVisitDrugItem[];
  fgRef: string;
  sdRefStatus: string;
  desRef: string;
  refDep: string;
  desNoRef: string;
  desAdr: string;
  sdComplications: string;
  desComplications: string;
  desComor: string;
  sdComorbidity: string;
  desComorbidity: string;
  sdMajorCc: string;
  targetOrganDamage: string;
  desPresAdvice: string;
}

export interface ChronicDiseaseFollowUpResponse {
  followUpId: string;
  requestId: string;
  status: 'saved';
  savedAt: string;
  idPhr: string;
  idRecord: string;
  sdVisitKind: string;
}

export type ChronicArtifactType = 'health_prescription' | 'annual_assessment';

export interface ChronicArtifactAcceptedItem {
  itemId: string;
  category: PrescriptionSuggestionCategory;
  title: string;
  detail: string;
  reason: string;
}

export interface ChronicArtifactSnapshotRequest {
  requestId: string;
  artifactType: ChronicArtifactType;
  hisOrgId?: string;
  hisOrgName?: string;
  patientId: string;
  visitId?: string;
  patientName: string;
  diseaseTypes: ChronicDiseaseType[];
  dataAsOf: string;
  assessmentYear?: number;
  templateVersions: string[];
  pathVersions: string[];
  evidenceVersions: string[];
  ruleVersion: string;
  summaryText: string;
  systolicPressure?: number;
  diastolicPressure?: number;
  bloodGlucose?: number;
  bloodPressureRecordCount: number;
  bloodGlucoseRecordCount: number;
  acceptedItems: ChronicArtifactAcceptedItem[];
  doctorNotes?: string;
  doctorId?: string;
  doctorName: string;
}

export interface ChronicArtifactSnapshotResponse {
  snapshotId: string;
  requestId: string;
  status: 'saved';
  savedAt: string;
  artifactType: ChronicArtifactType;
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
