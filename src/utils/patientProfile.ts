import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextGenderText,
  getPatientContextName,
  getPatientContextPastMedicalHistory,
} from './patientContext';

interface PatientLike {
  naPi?: string;
  na_pi?: string;
  name?: string;
  patientName?: string;
  patient_name?: string;
  sdSexText?: string;
  sdSex?: string;
  gender?: string;
  sex?: string;
  ageText?: string;
  age?: string | number;
  ageNum?: string | number;
  ageUnit?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  allergyHistory?: string;
  diagnosis?: string;
  [key: string]: unknown;
}

function readTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function readFirstText(patient: PatientLike | null | undefined, keys: string[]): string {
  if (!patient) {
    return '';
  }

  for (const key of keys) {
    const value = readTextValue(patient[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

export function normalizePatientGender(raw: unknown): string {
  const value = readTextValue(raw);
  if (!value) {
    return '';
  }

  if (value === '1' || /^M$/i.test(value) || /^male$/i.test(value) || value.startsWith('男')) {
    return '男性';
  }

  if (value === '2' || /^F$/i.test(value) || /^female$/i.test(value) || value.startsWith('女')) {
    return '女性';
  }

  return value;
}

export function resolvePatientName(patient: PatientLike | null | undefined): string {
  return getPatientContextName(patient as any) || readFirstText(patient, ['naPi', 'na_pi', 'name', 'patientName', 'patient_name']);
}

export function resolvePatientGender(patient: PatientLike | null | undefined): string {
  return getPatientContextGenderText(patient as any)
    || normalizePatientGender(readFirstText(patient, ['sdSexText', 'sdSex', 'gender', 'sex']));
}

export function resolvePatientAge(patient: PatientLike | null | undefined): string {
  const contextAge = getPatientContextAgeText(patient as any);
  if (contextAge) {
    return contextAge;
  }

  const ageText = readFirstText(patient, ['ageText']);
  if (ageText) {
    return ageText;
  }

  const ageNum = readTextValue(patient?.ageNum);
  if (ageNum) {
    return `${ageNum}${readFirstText(patient, ['ageUnit']) || '岁'}`;
  }

  if (typeof patient?.age === 'number' && Number.isFinite(patient.age)) {
    return `${patient.age}岁`;
  }

  return readTextValue(patient?.age);
}

export interface RiskAnalysisPatientContext {
  patientName: string;
  gender: string;
  age: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  allergyHistory?: string;
  diagnosis?: string;
}

function filterVisitHistorySummary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^既往门诊记录[：:]/.test(trimmed)) return undefined;
  return trimmed || undefined;
}

export function normalizeRiskAnalysisPatientContext(
  patient: PatientLike | null | undefined,
): RiskAnalysisPatientContext {
  return {
    patientName: resolvePatientName(patient),
    gender: resolvePatientGender(patient),
    age: resolvePatientAge(patient),
    chiefComplaint: readFirstText(patient, ['chiefComplaint']),
    historyOfPresentIllness: readFirstText(patient, ['historyOfPresentIllness']),
    pastMedicalHistory: filterVisitHistorySummary(getPatientContextPastMedicalHistory(patient as any) || readFirstText(patient, ['pastMedicalHistory'])),
    allergyHistory: getPatientContextAllergyHistory(patient as any) || readFirstText(patient, ['allergyHistory']),
    diagnosis: readFirstText(patient, ['diagnosis']),
  };
}