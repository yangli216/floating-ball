export type PatientMemoryFactType =
  | 'allergy'
  | 'chronic_condition'
  | 'diagnosis'
  | 'medication'
  | 'procedure'
  | 'lab_result'
  | 'exam_result'
  | 'vital'
  | 'history'
  | 'reminder';

export type PatientMemoryFactStatus = 'active' | 'historical' | 'inactive' | 'unknown' | 'disputed';
export type PatientMemoryConfidence = 'confirmed' | 'structured' | 'extracted' | 'low';
export type PatientMemoryQualityStatus = 'fresh' | 'partial' | 'conflicted';

export interface PatientMemoryFactItem {
  factId: string;
  factType: PatientMemoryFactType;
  code?: string | null;
  name?: string | null;
  valueText?: string | null;
  status: PatientMemoryFactStatus;
  confidence: PatientMemoryConfidence;
  evidenceText?: string | null;
  sourceType?: string | null;
  origin?: 'his' | 'doctor' | 'admin' | string | null;
  lastObservedAt?: string | null;
}

export interface PatientMemoryBrief {
  memoryId: string;
  memoryVersion: number;
  patientId: string;
  patientName?: string | null;
  patientGender?: string | null;
  patientAge?: string | null;
  qualityStatus: PatientMemoryQualityStatus;
  conflictCount: number;
  lastSyncTime?: string | null;
  lastSourceTime?: string | null;
  allergies: PatientMemoryFactItem[];
  chronicConditions: PatientMemoryFactItem[];
  recentDiagnoses: PatientMemoryFactItem[];
  recentMedications: PatientMemoryFactItem[];
  otherFacts: PatientMemoryFactItem[];
}

export interface PatientMemoryClinicalFact {
  factKey: string;
  factType: PatientMemoryFactType;
  code?: string;
  name?: string;
  valueText?: string;
  status?: PatientMemoryFactStatus;
  confidence?: PatientMemoryConfidence;
  evidenceText?: string;
}

export interface PatientMemoryObservation {
  sourceKey: string;
  sourceType:
    | 'patient_profile'
    | 'allergy_snapshot'
    | 'visit_summary'
    | 'outpatient_record'
    | 'lab_report'
    | 'exam_report'
    | 'doctor_confirmation';
  sourceVersion?: string;
  operation: 'upsert' | 'tombstone';
  occurredAt?: number;
  visitId?: string;
  payload: Record<string, unknown>;
  facts: PatientMemoryClinicalFact[];
}

export interface PatientMemorySyncRequest {
  schemaVersion: '1.0';
  syncId: string;
  knownMemoryVersion?: number;
  patient: {
    patientId: string;
    hisOrgId?: string;
    name?: string;
    gender?: string;
    ageText?: string;
    birthDate?: string;
  };
  observations: PatientMemoryObservation[];
}

export interface PatientMemorySyncResponse {
  memoryId: string;
  memoryVersion: number;
  nextCursor: string;
  accepted: number;
  skipped: number;
  rejected: Array<{ index: number; sourceKey?: string | null; reason: string }>;
  changedFactTypes: PatientMemoryFactType[];
  brief: PatientMemoryBrief;
}

export interface PatientMemoryResolveResponse {
  found: boolean;
  notModified: boolean;
  memoryVersion?: number | null;
  brief?: PatientMemoryBrief | null;
}
