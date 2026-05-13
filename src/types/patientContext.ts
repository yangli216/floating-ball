import type { HisPatientHistory } from '../services/his/types';

export interface PatientContextIdentity {
  patientId: string;
  visitId?: string;
  mpiId?: string;
  tetId?: string;
}

export interface PatientContextDemographics {
  patientName: string;
  genderCode?: 'M' | 'F' | 'O' | string;
  genderText?: string;
  ageText?: string;
  ageYears?: number;
  idCard?: string;
  mobilePhone?: string;
  insuranceType?: string;
}

export interface PatientContextClinical {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  allergyHistory?: string;
  currentMedicationHistory?: string;
  familyHistory?: string;
  diagnosis?: string;
  hisHistory?: HisPatientHistory | null;
}

export interface PatientContext {
  identity: PatientContextIdentity;
  demographics: PatientContextDemographics;
  clinical: PatientContextClinical;
  receptionEnsured?: boolean;
  source?: string;
  raw?: Record<string, unknown>;

  // Transitional flat fields for existing modules.
  patientId: string;
  visitId?: string;
  patientName: string;
  genderCode?: 'M' | 'F' | 'O' | string;
  genderText?: string;
  ageText?: string;
  ageYears?: number;
  idCard?: string;
  mobilePhone?: string;
  insuranceType?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  allergyHistory?: string;
  currentMedicationHistory?: string;
  familyHistory?: string;
  diagnosis?: string;
  hisHistory?: HisPatientHistory | null;

  // Legacy aliases to keep current call sites compiling during migration.
  id?: string;
  idTet?: string;
  idPi?: string;
  idMpi?: string;
  idVis?: string;
  piOi?: string;
  name?: string;
  naPi?: string;
  gender?: 'M' | 'F' | 'O' | string;
  sdSexText?: string;
  age?: number | string;
  patientHistory?: HisPatientHistory | null;
  _receptionEnsured?: boolean;
  [key: string]: unknown;
}