import type { HisPatientHistory, HisPatientInfo } from '../services/his/types';
import type { Patient } from '../types/consultation';
import type { AppPatient, PatientContext } from '../types/appState';

type PatientSourceRecord = Record<string, unknown>;

function text(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function pickFirstText(source: PatientSourceRecord | null | undefined, keys: string[]): string {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = text(source[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function toRecord(value: unknown): PatientSourceRecord | null {
  return value && typeof value === 'object' ? value as PatientSourceRecord : null;
}

export function normalizePatientGenderCode(raw: unknown): 'M' | 'F' | 'O' | string | undefined {
  const value = text(raw);
  if (!value) {
    return undefined;
  }

  if (value === '1' || /^M$/i.test(value) || /^male$/i.test(value) || value.startsWith('男')) {
    return 'M';
  }

  if (value === '2' || /^F$/i.test(value) || /^female$/i.test(value) || value.startsWith('女')) {
    return 'F';
  }

  if (/^O$/i.test(value) || /^other$/i.test(value) || value === '未知') {
    return 'O';
  }

  return value;
}

export function normalizePatientGenderText(raw: unknown): string {
  const code = normalizePatientGenderCode(raw);
  if (code === 'M') return '男性';
  if (code === 'F') return '女性';
  if (code === 'O') return '未知';
  return text(raw);
}

function parseAgeYears(ageText: string, fallbackAge?: number): number | undefined {
  if (typeof fallbackAge === 'number' && Number.isFinite(fallbackAge)) {
    return fallbackAge;
  }

  const match = ageText.match(/(\d+(?:\.\d+)?)\s*岁/u);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildAgeText(source: PatientSourceRecord | null, hisInfo?: HisPatientInfo | null): string {
  const sourceAgeText = pickFirstText(source, ['ageText']);
  if (sourceAgeText) {
    return sourceAgeText;
  }

  const ageNum = pickFirstText(source, ['ageNum']);
  if (ageNum) {
    return `${ageNum}${pickFirstText(source, ['ageUnit']) || '岁'}`;
  }

  if (hisInfo?.ageText) {
    return hisInfo.ageText;
  }

  if (typeof hisInfo?.age === 'number' && Number.isFinite(hisInfo.age)) {
    return `${hisInfo.age}岁`;
  }

  const age = pickFirstText(source, ['age']);
  if (!age) {
    return '';
  }

  return /岁|月|天/u.test(age) ? age : `${age}岁`;
}

export function getPatientContextId(patient: AppPatient | null | undefined): string {
  return patient?.patientId || patient?.identity?.patientId || patient?.idPi || patient?.id || '';
}

export function getPatientContextVisitId(patient: AppPatient | null | undefined): string {
  return patient?.visitId || patient?.identity?.visitId || patient?.idVis || '';
}

export function getPatientContextName(patient: AppPatient | null | undefined): string {
  return patient?.patientName || patient?.demographics?.patientName || patient?.naPi || patient?.name || '';
}

export function getPatientContextGenderCode(patient: AppPatient | null | undefined): string {
  return String(patient?.genderCode || patient?.demographics?.genderCode || patient?.gender || '');
}

export function getPatientContextGenderText(patient: AppPatient | null | undefined): string {
  return patient?.genderText || patient?.demographics?.genderText || patient?.sdSexText || normalizePatientGenderText(patient?.gender) || '';
}

export function getPatientContextAgeText(patient: AppPatient | null | undefined): string {
  if (patient?.ageText) {
    return patient.ageText;
  }

  if (patient?.demographics?.ageText) {
    return patient.demographics.ageText;
  }

  if (typeof patient?.age === 'number' && Number.isFinite(patient.age)) {
    return `${patient.age}岁`;
  }

  return text(patient?.age);
}

export function getPatientContextAnchorId(patient: AppPatient | null | undefined): string {
  return getPatientContextVisitId(patient) || getPatientContextId(patient);
}

export function getPatientContextPastMedicalHistory(patient: AppPatient | null | undefined): string {
  return patient?.pastMedicalHistory || patient?.clinical?.pastMedicalHistory || '';
}

export function getPatientContextAllergyHistory(patient: AppPatient | null | undefined): string {
  return patient?.allergyHistory || patient?.clinical?.allergyHistory || '';
}

export function getPatientContextCurrentMedicationHistory(patient: AppPatient | null | undefined): string {
  return patient?.currentMedicationHistory || patient?.clinical?.currentMedicationHistory || '';
}

export function getPatientContextHistory(patient: AppPatient | null | undefined): HisPatientHistory | null {
  return patient?.hisHistory || patient?.clinical?.hisHistory || patient?.patientHistory || null;
}

interface BuildPatientContextInput {
  existing?: AppPatient | null;
  payload?: Record<string, unknown> | null;
  hisInfo?: HisPatientInfo | null;
  hisHistory?: HisPatientHistory | null;
  overrides?: Partial<PatientContext>;
  source?: string;
  receptionEnsured?: boolean;
}

export function buildPatientContext(input: BuildPatientContextInput): AppPatient | null {
  const existing = input.existing || null;
  const payload = toRecord(input.payload);

  const patientId = input.hisInfo?.patientId
    || pickFirstText(payload, ['patientId', 'idPi', 'id'])
    || getPatientContextId(existing);

  if (!patientId) {
    return existing;
  }

  const visitId = pickFirstText(payload, ['visitId', 'idVis']) || getPatientContextVisitId(existing);
  const mpiId = pickFirstText(payload, ['idMpi']) || text(existing?.identity?.mpiId || existing?.idMpi);
  const tetId = pickFirstText(payload, ['idTet']) || text(existing?.identity?.tetId || existing?.idTet);
  const patientName = input.hisInfo?.name
    || pickFirstText(payload, ['patientName', 'naPi', 'name'])
    || getPatientContextName(existing);

  const genderCode = input.hisInfo?.gender
    || normalizePatientGenderCode(pickFirstText(payload, ['gender', 'sdSexText', 'sdSex']))
    || normalizePatientGenderCode(existing?.genderCode || existing?.gender || existing?.sdSexText);
  const genderText = normalizePatientGenderText(
    pickFirstText(payload, ['sdSexText', 'gender', 'sdSex']) || input.hisInfo?.gender || existing?.genderText || existing?.sdSexText,
  );
  const ageText = buildAgeText(payload, input.hisInfo) || getPatientContextAgeText(existing);
  const ageYears = parseAgeYears(ageText, input.hisInfo?.age);
  const idCard = pickFirstText(payload, ['idCard', 'idNo']) || input.hisInfo?.idNo || text(existing?.idCard);
  const mobilePhone = pickFirstText(payload, ['mobilePhone', 'phone']) || input.hisInfo?.mobilePhone || text(existing?.mobilePhone);
  const insuranceType = pickFirstText(payload, ['insuranceType']) || input.hisInfo?.insuranceType || text(existing?.insuranceType);

  const hisHistory = input.hisHistory ?? getPatientContextHistory(existing);
  const pastMedicalHistory = pickFirstText(payload, ['pastMedicalHistory', 'past_medical_history', 'pastMedicalHistoryText'])
    || getPatientContextPastMedicalHistory(existing);
  const allergyHistory = pickFirstText(payload, ['allergyHistory', 'allergy_history', 'allergyHistoryText'])
    || getPatientContextAllergyHistory(existing);
  const currentMedicationHistory = pickFirstText(payload, ['currentMedicationHistory'])
    || text(existing?.currentMedicationHistory || existing?.clinical?.currentMedicationHistory);
  const chiefComplaint = pickFirstText(payload, ['chiefComplaint'])
    || text(existing?.chiefComplaint || existing?.clinical?.chiefComplaint);
  const historyOfPresentIllness = pickFirstText(payload, ['historyOfPresentIllness'])
    || text(existing?.historyOfPresentIllness || existing?.clinical?.historyOfPresentIllness);
  const diagnosis = pickFirstText(payload, ['diagnosis'])
    || text(existing?.diagnosis || existing?.clinical?.diagnosis);
  const receptionEnsured = input.receptionEnsured ?? existing?.receptionEnsured ?? existing?._receptionEnsured ?? false;

  const baseContext: PatientContext = {
    identity: {
      patientId,
      visitId: visitId || undefined,
      mpiId: mpiId || undefined,
      tetId: tetId || undefined,
    },
    demographics: {
      patientName: patientName || '未知患者',
      genderCode,
      genderText: genderText || undefined,
      ageText: ageText || undefined,
      ageYears,
      idCard: idCard || undefined,
      mobilePhone: mobilePhone || undefined,
      insuranceType: insuranceType || undefined,
    },
    clinical: {
      chiefComplaint: chiefComplaint || undefined,
      historyOfPresentIllness: historyOfPresentIllness || undefined,
      pastMedicalHistory: pastMedicalHistory || undefined,
      allergyHistory: allergyHistory || undefined,
      currentMedicationHistory: currentMedicationHistory || undefined,
      diagnosis: diagnosis || undefined,
      hisHistory,
    },
    receptionEnsured,
    source: input.source || existing?.source,
    raw: {
      ...(existing?.raw || {}),
      ...(payload || {}),
      ...(input.hisInfo?.raw || {}),
    },

    patientId,
    visitId: visitId || undefined,
    patientName: patientName || '未知患者',
    genderCode,
    genderText: genderText || undefined,
    ageText: ageText || undefined,
    ageYears,
    idCard: idCard || undefined,
    mobilePhone: mobilePhone || undefined,
    insuranceType: insuranceType || undefined,
    chiefComplaint: chiefComplaint || undefined,
    historyOfPresentIllness: historyOfPresentIllness || undefined,
    pastMedicalHistory: pastMedicalHistory || undefined,
    allergyHistory: allergyHistory || undefined,
    currentMedicationHistory: currentMedicationHistory || undefined,
    diagnosis: diagnosis || undefined,
    hisHistory,

    id: text(existing?.id),
    idTet: tetId || undefined,
    idPi: patientId,
    idMpi: mpiId || undefined,
    idVis: visitId || undefined,
    piOi: text(existing?.piOi),
    name: patientName || '未知患者',
    naPi: patientName || '未知患者',
    gender: genderCode,
    sdSexText: genderText || undefined,
    age: ageYears ?? (ageText || undefined),
    patientHistory: hisHistory,
    _receptionEnsured: receptionEnsured,
  };

  const overrides = input.overrides || {};
  const context: PatientContext = {
    ...baseContext,
    ...overrides,
    clinical: {
      ...baseContext.clinical,
      ...(overrides.clinical || {}),
    },
  };

  return context;
}

export function toConsultationPatient(context: AppPatient | null | undefined): Patient {
  const ageText = getPatientContextAgeText(context);
  const ageYears = typeof context?.ageYears === 'number' ? context.ageYears : undefined;

  return {
    idTet: context?.idTet,
    idPi: getPatientContextId(context) || undefined,
    idMpi: context?.idMpi,
    naPi: getPatientContextName(context),
    sdSex: getPatientContextGenderCode(context),
    idCard: context?.idCard,
    mobilePhone: context?.mobilePhone,
    ageNum: ageYears,
    ageUnit: ageYears != null ? '岁' : undefined,
    ageText: ageText || undefined,
    sdSexText: getPatientContextGenderText(context) || undefined,
    allergyHistory: getPatientContextAllergyHistory(context) || undefined,
    chiefComplaint: context?.chiefComplaint || context?.clinical?.chiefComplaint,
    historyOfPresentIllness: context?.historyOfPresentIllness || context?.clinical?.historyOfPresentIllness,
    pastMedicalHistory: context?.pastMedicalHistory || context?.clinical?.pastMedicalHistory,
    currentMedicationHistory: context?.currentMedicationHistory || context?.clinical?.currentMedicationHistory,
    diagnosis: context?.diagnosis || context?.clinical?.diagnosis,
  };
}
