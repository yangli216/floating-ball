export interface DiagnosisEntry {
  name: string;
  code?: string;
  matched?: boolean;
  isTCM?: boolean;
  syndrome?: string;
  syndromeCode?: string;
  syndromeMatched?: boolean;
  treatment?: string;
  treatmentCode?: string;
  treatmentMatched?: boolean;
}

export interface MedicationEntry {
  name: string;
  spec?: string;
  dosage?: string;
  frequency?: string;
  usage?: string;
  count?: string;
  matched?: boolean;
  idMedPro?: string;
}

export interface ExamEntry {
  name: string;
  goal?: string;
  matched?: boolean;
  idCli?: string;
}

export interface GeneratedRecord {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  diagnosisList: DiagnosisEntry[];
  medications: MedicationEntry[];
  examinations: ExamEntry[];
  labTests: ExamEntry[];
  procedures: ExamEntry[];
  treatmentPlan?: string;
  healthEducation?: string;
}

export interface PatientInfo {
  naPi?: string;
  name?: string;
  sdSexText?: string;
  sex?: string;
  ageText?: string;
  age?: string | number;
  idCard?: string;
  mobilePhone?: string;
  allergyHistory?: string;
  [key: string]: unknown;
}

export type VoiceSafetyIssueSeverity = 'high' | 'medium' | 'low';

export type VoiceSafetyIssueCategory =
  | 'drug_interaction'
  | 'contraindication'
  | 'red_flag'
  | 'allergy'
  | 'missing_check'
  | 'diagnosis_treatment_mismatch'
  | 'other';

export interface VoiceSafetyIssue {
  id: string;
  severity: VoiceSafetyIssueSeverity;
  category: VoiceSafetyIssueCategory;
  title: string;
  message: string;
  suggestion?: string;
  relatedItems?: string[];
  evidence?: string;
  acknowledged?: boolean;
  dismissed?: boolean;
}

export interface VoiceSafetyReviewContext {
  patientInfo?: PatientInfo | null;
  record: GeneratedRecord;
  recentMedications?: string[];
  allergyHistory?: string;
  checkedAt?: number;
}

export interface VoiceSafetyReviewResult {
  hasIssues: boolean;
  issues: VoiceSafetyIssue[];
  checkedAt: number;
}
