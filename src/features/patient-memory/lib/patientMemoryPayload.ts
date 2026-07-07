import type { AppPatient } from '@/types/appState';
import type { HisVisitVitalSigns } from '@/services/his/types';
import type {
  PatientMemoryClinicalFact,
  PatientMemoryObservation,
  PatientMemorySyncRequest,
} from '@entities/patient-memory';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextGenderCode,
  getPatientContextHistory,
  getPatientContextId,
  getPatientContextName,
  getPatientContextPastMedicalHistory,
} from '@/utils/patientContext';

const NEGATIVE_ALLERGY_PATTERNS = [
  /^无(?:明确)?(?:药物|食物)?过敏/u,
  /^否认.*过敏/u,
  /^未发现.*过敏/u,
  /^不详$/u,
];

function cleanText(value: unknown, maxLength = 1000): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function uniqueTexts(values: unknown[], maxLength = 256): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase().replace(/[\s_-]+/gu, '');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  }
  return result;
}

function splitClinicalText(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/[，、,;；\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKeyPart(value: string): string {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[\s_-]+/gu, '')
    .replace(/[^\p{L}\p{N}.]+/gu, '');
  return (normalized || 'unknown').slice(0, 96);
}

function formatVisitEvidence(visitTime: number, deptName?: string): string {
  const date = Number.isFinite(visitTime)
    ? new Date(visitTime).toLocaleDateString('zh-CN')
    : '历史';
  return `${date}${deptName ? ` ${deptName}` : ''} HIS就诊记录`;
}

function formatMedicationValue(input: {
  spec?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  route?: string;
  days?: string;
}): string | undefined {
  const fields = [
    cleanText(input.spec, 128),
    [cleanText(input.dose, 64), cleanText(input.doseUnit, 64)].filter(Boolean).join(''),
    cleanText(input.frequency, 128),
    cleanText(input.route, 128),
    input.days ? `${cleanText(input.days, 32)}天` : '',
  ].filter(Boolean);
  return fields.length > 0 ? fields.join(' · ') : undefined;
}

function vitalPayload(vitalSigns: HisVisitVitalSigns): Record<string, unknown> {
  return Object.keys(vitalSigns)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const value = vitalSigns[key as keyof HisVisitVitalSigns];
      if (typeof value !== 'undefined') {
        result[key] = value;
      }
      return result;
    }, {});
}

function buildVitalFacts(
  vitalSigns: HisVisitVitalSigns | null | undefined,
  evidenceText: string,
): PatientMemoryClinicalFact[] {
  if (!vitalSigns) return [];
  const facts: PatientMemoryClinicalFact[] = [];
  const add = (factKey: string, name: string, valueText: string | undefined) => {
    if (!valueText) return;
    facts.push({
      factKey,
      factType: 'vital',
      name,
      valueText,
      status: 'historical',
      confidence: 'structured',
      evidenceText,
    });
  };

  if (
    typeof vitalSigns.systolicBloodPressure === 'number'
    || typeof vitalSigns.diastolicBloodPressure === 'number'
  ) {
    const systolic = typeof vitalSigns.systolicBloodPressure === 'number'
      ? String(vitalSigns.systolicBloodPressure)
      : '-';
    const diastolic = typeof vitalSigns.diastolicBloodPressure === 'number'
      ? String(vitalSigns.diastolicBloodPressure)
      : '-';
    add('vital:blood-pressure', '血压', `${systolic}/${diastolic} mmHg`);
  }
  add(
    'vital:heart-rate',
    '心率',
    typeof vitalSigns.heartRate === 'number' ? `${vitalSigns.heartRate} 次/分` : undefined,
  );
  add(
    'vital:pulse-rate',
    '脉搏',
    typeof vitalSigns.pulseRate === 'number' ? `${vitalSigns.pulseRate} 次/分` : undefined,
  );
  add(
    'vital:respiratory-rate',
    '呼吸',
    typeof vitalSigns.respiratoryRate === 'number' ? `${vitalSigns.respiratoryRate} 次/分` : undefined,
  );
  add(
    'vital:temperature',
    vitalSigns.temperatureTypeText ? `体温（${vitalSigns.temperatureTypeText}）` : '体温',
    typeof vitalSigns.temperature === 'number' ? `${vitalSigns.temperature} ℃` : undefined,
  );
  add(
    'vital:height',
    '身高',
    typeof vitalSigns.heightCm === 'number' ? `${vitalSigns.heightCm} cm` : undefined,
  );
  add(
    'vital:weight',
    '体重',
    typeof vitalSigns.weightKg === 'number' ? `${vitalSigns.weightKg} kg` : undefined,
  );
  add(
    'vital:waist',
    '腰围',
    typeof vitalSigns.waistCm === 'number' ? `${vitalSigns.waistCm} cm` : undefined,
  );

  return facts;
}

function buildProfileObservation(patient: AppPatient): PatientMemoryObservation {
  return {
    sourceKey: 'patient-profile',
    sourceType: 'patient_profile',
    operation: 'upsert',
    payload: {
      gender: getPatientContextGenderCode(patient) || undefined,
      ageText: getPatientContextAgeText(patient) || undefined,
    },
    facts: [],
  };
}

function buildAllergyObservation(patient: AppPatient): PatientMemoryObservation {
  const history = getPatientContextHistory(patient);
  const allergies = uniqueTexts([
    ...(history?.allergyHistory || []),
    ...splitClinicalText(getPatientContextAllergyHistory(patient)),
  ]).filter((item) => !NEGATIVE_ALLERGY_PATTERNS.some((pattern) => pattern.test(item)));
  return {
    sourceKey: 'allergy-snapshot',
    sourceType: 'allergy_snapshot',
    operation: 'upsert',
    payload: { count: allergies.length },
    facts: allergies.map((name): PatientMemoryClinicalFact => ({
      factKey: `allergy:${normalizeKeyPart(name)}`,
      factType: 'allergy',
      name,
      status: 'active',
      confidence: 'structured',
      evidenceText: 'HIS过敏史',
    })),
  };
}

function buildHistoryObservation(patient: AppPatient): PatientMemoryObservation | null {
  const history = getPatientContextHistory(patient);
  const entries = uniqueTexts([
    ...(history?.pastMedicalHistory || []),
    ...splitClinicalText(getPatientContextPastMedicalHistory(patient)),
  ]);
  if (entries.length === 0) return null;
  return {
    sourceKey: 'past-medical-history',
    sourceType: 'visit_summary',
    operation: 'upsert',
    payload: { count: entries.length },
    facts: entries.map((name): PatientMemoryClinicalFact => ({
      factKey: `history:${normalizeKeyPart(name)}`,
      factType: 'history',
      name,
      status: 'historical',
      confidence: 'structured',
      evidenceText: 'HIS既往史',
    })),
  };
}

function buildVisitObservations(patient: AppPatient): PatientMemoryObservation[] {
  const visits = getPatientContextHistory(patient)?.visits || [];
  return visits.map((visit, index) => {
    const sourceKey = `visit:${cleanText(visit.visitId, 128) || `${visit.visitTime}:${index}`}`;
    const evidenceText = formatVisitEvidence(visit.visitTime, visit.deptName);
    const facts: PatientMemoryClinicalFact[] = [];
    const diagnosisEntries: Array<{ name: string; code?: string }> = visit.diagnosisEntries?.length
      ? visit.diagnosisEntries
      : uniqueTexts(visit.diagnoses || []).map((name) => ({ name }));
    for (const diagnosis of diagnosisEntries) {
      const name = cleanText(diagnosis.name, 256);
      const code = cleanText(diagnosis.code, 128);
      if (!name && !code) continue;
      facts.push({
        factKey: `diagnosis:${normalizeKeyPart(code || name)}`,
        factType: 'diagnosis',
        code: code || undefined,
        name: name || code,
        status: 'historical',
        confidence: 'structured',
        evidenceText,
      });
    }

    if (visit.medicationOrders?.length) {
      for (const medication of visit.medicationOrders) {
        const name = cleanText(medication.name, 256);
        const productId = cleanText(medication.productId, 128);
        if (!name && !productId) continue;
        facts.push({
          factKey: `medication:${normalizeKeyPart(productId || name)}`,
          factType: 'medication',
          code: productId || undefined,
          name: name || productId,
          valueText: formatMedicationValue(medication),
          status: 'historical',
          confidence: 'structured',
          evidenceText,
        });
      }
    } else {
      for (const name of uniqueTexts(visit.medications || [])) {
        facts.push({
          factKey: `medication:${normalizeKeyPart(name)}`,
          factType: 'medication',
          name,
          status: 'historical',
          confidence: 'extracted',
          evidenceText,
        });
      }
    }

    facts.push(...buildVitalFacts(visit.vitalSigns, evidenceText));

    return {
      sourceKey,
      sourceType: 'visit_summary',
      sourceVersion: undefined,
      operation: 'upsert',
      occurredAt: visit.visitTime,
      visitId: cleanText(visit.visitId, 128) || undefined,
      payload: {
        visitTime: visit.visitTime,
        deptName: cleanText(visit.deptName, 128) || undefined,
        chiefComplaint: cleanText(visit.chiefComplaint, 500) || undefined,
        vitalSigns: visit.vitalSigns ? vitalPayload(visit.vitalSigns) : undefined,
      },
      facts,
    };
  });
}

function buildCurrentVitalSignsObservation(patient: AppPatient): PatientMemoryObservation | null {
  const vitalSigns = patient.currentVitalSigns || patient.clinical?.currentVitalSigns;
  const facts = buildVitalFacts(vitalSigns, '本次门诊病历生命体征');
  if (!vitalSigns || facts.length === 0) return null;
  const visitId = cleanText(patient.visitId || patient.idVis || patient.identity?.visitId, 128) || undefined;
  const occurredAtText = cleanText(vitalSigns.measuredAt || vitalSigns.updatedAt, 128);
  const occurredAt = occurredAtText ? Date.parse(occurredAtText) : undefined;

  return {
    sourceKey: visitId ? `current-vitals:${visitId}` : 'current-vitals',
    sourceType: 'outpatient_record',
    sourceVersion: undefined,
    operation: 'upsert',
    occurredAt: Number.isFinite(occurredAt) ? occurredAt : undefined,
    visitId,
    payload: {
      vitalSigns: vitalPayload(vitalSigns),
    },
    facts,
  };
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (typeof item !== 'undefined') result[key] = sortForStableJson(item);
        return result;
      }, {});
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}-${value.length}`;
}

export async function attachPatientMemorySourceVersions(
  observations: PatientMemoryObservation[],
): Promise<PatientMemoryObservation[]> {
  return Promise.all(observations.map(async (observation) => {
    const versionSource = {
      ...observation,
      sourceVersion: undefined,
      facts: [...observation.facts].sort((left, right) => left.factKey.localeCompare(right.factKey)),
    };
    const sourceVersion = await sha256Hex(JSON.stringify(sortForStableJson(versionSource)));
    return { ...observation, sourceVersion };
  }));
}

export async function buildPatientMemorySyncRequest(input: {
  patient: AppPatient;
  hisOrgId?: string | null;
  knownMemoryVersion?: number;
}): Promise<PatientMemorySyncRequest> {
  const patientId = getPatientContextId(input.patient);
  const observations = [
    buildProfileObservation(input.patient),
    buildAllergyObservation(input.patient),
    buildHistoryObservation(input.patient),
    buildCurrentVitalSignsObservation(input.patient),
    ...buildVisitObservations(input.patient),
  ].filter((item): item is PatientMemoryObservation => Boolean(item));

  return {
    schemaVersion: '1.0',
    syncId: globalThis.crypto?.randomUUID?.() || `memory-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    knownMemoryVersion: input.knownMemoryVersion,
    patient: {
      patientId,
      hisOrgId: cleanText(input.hisOrgId, 64) || undefined,
      name: getPatientContextName(input.patient) || undefined,
      gender: getPatientContextGenderCode(input.patient) || undefined,
      ageText: getPatientContextAgeText(input.patient) || undefined,
    },
    observations: await attachPatientMemorySourceVersions(observations),
  };
}
