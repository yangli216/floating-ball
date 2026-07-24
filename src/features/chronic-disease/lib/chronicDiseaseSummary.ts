import type {
  HisHistoricalLabResult,
  HisVisitRecord,
  HisVisitVitalSigns,
} from '@/services/his/types';
import {
  getPatientContextAgeText,
  getPatientContextGenderText,
  getPatientContextHistory,
  getPatientContextId,
  getPatientContextName,
  getPatientContextVisitId,
} from '@/utils/patientContext';
import type { PatientMemoryFactItem } from '@entities/patient-memory';
import type {
  BloodGlucosePoint,
  BloodPressurePoint,
  ChronicDiseasePatientSummary,
  ChronicDiseaseSummaryInput,
  ChronicDiseaseTag,
  ChronicDiseaseType,
  ChronicMedicationFact,
} from '../types';

const HYPERTENSION_PATTERN = /高血压|原发性高血压|\bI1[0-5](?:\.\w+)?\b/i;
const TYPE2_DIABETES_PATTERN = /2\s*型糖尿病|Ⅱ\s*型糖尿病|II\s*型糖尿病|非胰岛素依赖型糖尿病|\bE11(?:\.\w+)?\b/i;
const GLUCOSE_PATTERN = /血糖|葡萄糖|GLU|fasting glucose|FPG/i;
const FASTING_PATTERN = /空腹|FPG|fasting/i;
const POSTPRANDIAL_PATTERN = /餐后|2\s*h|postprandial/i;
const RANDOM_PATTERN = /随机|random/i;

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function readRawValue(raw: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!raw) return undefined;
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

function normalizeDate(value: unknown, fallbackTimestamp?: number): string {
  const text = toText(value);
  if (text) {
    const timestamp = Date.parse(text.replace(/\//g, '-'));
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return fallbackTimestamp && Number.isFinite(fallbackTimestamp)
    ? new Date(fallbackTimestamp).toISOString()
    : '';
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = toText(value).replace(/,/g, '');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function collectDiagnosisText(input: ChronicDiseaseSummaryInput): string[] {
  const patient = input.patient;
  const history = getPatientContextHistory(patient);
  const values = [
    toText(patient?.diagnosis),
    toText(patient?.clinical?.diagnosis),
    ...(history?.pastMedicalHistory || []),
    ...(history?.visits || []).flatMap((visit) => [
      ...(visit.diagnoses || []),
      ...(visit.diagnosisEntries || []).flatMap((item) => [item.name, item.code || '']),
    ]),
    ...(input.patientMemoryBrief?.chronicConditions || []).flatMap((item) => [
      item.name || '',
      item.code || '',
      item.valueText || '',
    ]),
    ...(input.patientMemoryBrief?.recentDiagnoses || []).flatMap((item) => [
      item.name || '',
      item.code || '',
      item.valueText || '',
    ]),
  ];

  return Array.from(new Set(values.map((item) => toText(item)).filter(Boolean)));
}

function readPublicHealthStatus(raw: Record<string, unknown> | undefined): Set<string> {
  const direct = readRawValue(raw, [
    'publicHealthDiseaseCodes',
    'publicHealthTags',
    'rqflStatus',
    'rqfl_status',
  ]);
  const nested = raw?.rqflInfo && typeof raw.rqflInfo === 'object'
    ? readRawValue(raw.rqflInfo as Record<string, unknown>, ['rqflStatus', 'status'])
    : undefined;
  const value = direct ?? nested;
  const values = Array.isArray(value)
    ? value.map((item) => toText(item))
    : toText(value).split(/[,，;；|]/).map((item) => item.trim());
  return new Set(values.filter(Boolean));
}

function findPublicHealthDiseaseEvidence(
  status: Set<string>,
  diseaseType: ChronicDiseaseType,
): string | undefined {
  const candidates = diseaseType === 'hypertension'
    ? ['3', '高随', '高血压管理', 'hypertension']
    : ['6', '糖随', '糖尿病管理', '2型糖尿病管理', 'type2_diabetes'];
  return candidates.find((item) => status.has(item));
}

function buildDiseaseTags(
  diagnoses: string[],
  publicHealthStatus: Set<string>,
): ChronicDiseaseTag[] {
  const joined = diagnoses.join('；');
  const diseases: Array<{ type: ChronicDiseaseType; label: string; pattern: RegExp }> = [
    { type: 'hypertension', label: '高血压', pattern: HYPERTENSION_PATTERN },
    { type: 'type2_diabetes', label: '2 型糖尿病', pattern: TYPE2_DIABETES_PATTERN },
  ];

  return diseases.reduce<ChronicDiseaseTag[]>((tags, { type, label, pattern }) => {
    const publicHealthEvidence = findPublicHealthDiseaseEvidence(publicHealthStatus, type);
    if (publicHealthEvidence) {
      tags.push({
        diseaseType: type,
        label: `${label}管理`,
        source: 'public-health',
        sourceLabel: '公卫管理',
        evidenceText: publicHealthEvidence,
      });
      return tags;
    }
    if (pattern.test(joined)) {
      tags.push({
        diseaseType: type,
        label,
        source: 'clinical',
        sourceLabel: '临床识别',
      });
    }
    return tags;
  }, []);
}

function collectMedicationFacts(input: ChronicDiseaseSummaryInput): ChronicMedicationFact[] {
  const memoryFacts = (input.patientMemoryBrief?.recentMedications || [])
    .filter((item) => item.status !== 'inactive' && item.status !== 'disputed')
    .map((item): ChronicMedicationFact | null => {
      const name = toText(item.name || item.valueText);
      if (!name) return null;
      const observedAt = normalizeDate(item.lastObservedAt);
      return {
        name,
        observedAt: observedAt || undefined,
        sourceLabel: item.sourceType ? `用药事实 · ${item.sourceType}` : '用药事实',
      };
    })
    .filter((item): item is ChronicMedicationFact => Boolean(item));

  const historyFacts = (getPatientContextHistory(input.patient)?.visits || [])
    .flatMap((visit): ChronicMedicationFact[] => {
      const observedAt = normalizeDate(undefined, visit.visitTime) || undefined;
      const sourcePrefix = /随访/u.test(toText(visit.chiefComplaint)) ? '随访用药' : '历史用药';
      const sourceLabel = visit.deptName ? `${sourcePrefix} · ${visit.deptName}` : sourcePrefix;
      if (visit.medicationOrders?.length) {
        return visit.medicationOrders
          .map((item): ChronicMedicationFact | null => {
            const name = toText(item.name);
            if (!name) return null;
            const dose = [toText(item.dose), toText(item.doseUnit)].filter(Boolean).join('');
            const regimenText = [
              dose,
              toText(item.frequency),
              toText(item.route),
            ].filter(Boolean).join(' · ');
            return {
              name,
              idDrug: toText(item.productId) || undefined,
              regimenText: regimenText || undefined,
              sdDrugFreq: toText(item.frequency).match(/\d+(?:\.\d+)?/)?.[0],
              perDose: toText(item.dose) || undefined,
              doseUnit: toText(item.doseUnit) || undefined,
              insulin: /胰岛素/u.test(name) ? '1' : '2',
              observedAt,
              sourceLabel,
            };
          })
          .filter((item): item is ChronicMedicationFact => Boolean(item));
      }
      return (visit.medications || [])
        .map((name) => toText(name))
        .filter(Boolean)
        .map((name) => ({ name, observedAt, sourceLabel }));
    });

  const unique = new Map<string, ChronicMedicationFact>();
  [...memoryFacts, ...historyFacts].forEach((item) => {
    const key = `${item.name}:${item.observedAt || '-'}`;
    unique.set(key, item);
  });
  return Array.from(unique.values())
    .sort((left, right) => Date.parse(left.observedAt || '') - Date.parse(right.observedAt || ''))
    .slice(-12);
}

function buildBloodPressurePoint(
  vital: HisVisitVitalSigns | undefined,
  visit?: HisVisitRecord,
): BloodPressurePoint | null {
  if (!vital || !Number.isFinite(vital.systolicBloodPressure) || !Number.isFinite(vital.diastolicBloodPressure)) {
    return null;
  }
  const measuredAt = normalizeDate(vital.measuredAt || vital.updatedAt, visit?.visitTime);
  if (!measuredAt) return null;
  return {
    measuredAt,
    systolic: vital.systolicBloodPressure as number,
    diastolic: vital.diastolicBloodPressure as number,
    sourceLabel: visit?.deptName ? `门诊测量 · ${visit.deptName}` : '门诊测量',
  };
}

function collectBloodPressurePoints(input: ChronicDiseaseSummaryInput): BloodPressurePoint[] {
  const patient = input.patient;
  const history = getPatientContextHistory(patient);
  const points = (history?.visits || [])
    .map((visit) => buildBloodPressurePoint(visit.vitalSigns, visit))
    .filter((item): item is BloodPressurePoint => Boolean(item));
  const current = buildBloodPressurePoint(patient?.currentVitalSigns || patient?.clinical?.currentVitalSigns);
  if (current) points.push(current);

  const unique = new Map<string, BloodPressurePoint>();
  points.forEach((point) => unique.set(
    `${point.measuredAt}:${point.systolic}:${point.diastolic}`,
    point,
  ));
  return Array.from(unique.values())
    .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt))
    .slice(-12);
}

function glucoseType(text: string): BloodGlucosePoint['measurementType'] {
  if (FASTING_PATTERN.test(text)) return 'fasting';
  if (POSTPRANDIAL_PATTERN.test(text)) return 'postprandial';
  if (RANDOM_PATTERN.test(text)) return 'random';
  return 'unknown';
}

function glucosePointFromFact(fact: PatientMemoryFactItem): BloodGlucosePoint | null {
  const descriptor = [fact.name, fact.valueText, fact.evidenceText, fact.code]
    .map((item) => toText(item))
    .filter(Boolean)
    .join(' ');
  if (fact.factType !== 'lab_result' || !GLUCOSE_PATTERN.test(descriptor)) return null;
  if (fact.status === 'inactive' || fact.status === 'disputed') return null;
  const value = numericValue(fact.valueText || fact.evidenceText);
  const measuredAt = normalizeDate(fact.lastObservedAt);
  if (value === undefined || !measuredAt) return null;
  return {
    measuredAt,
    value,
    measurementType: glucoseType(descriptor),
    sourceLabel: fact.sourceType ? `检验结果 · ${fact.sourceType}` : '检验结果',
  };
}

function glucosePointFromHistoricalLab(
  result: HisHistoricalLabResult,
  visit: HisVisitRecord,
): BloodGlucosePoint | null {
  const descriptor = [result.name, result.code].map((item) => toText(item)).filter(Boolean).join(' ');
  if (!GLUCOSE_PATTERN.test(descriptor)) return null;
  const value = numericValue(result.value);
  const measuredAt = normalizeDate(result.measuredAt, visit.visitTime);
  if (value === undefined || !measuredAt) return null;
  return {
    measuredAt,
    value,
    measurementType: glucoseType(descriptor),
    sourceLabel: visit.deptName ? `随访检验 · ${visit.deptName}` : '随访检验',
  };
}

function collectBloodGlucosePoints(input: ChronicDiseaseSummaryInput): BloodGlucosePoint[] {
  const facts = [
    ...(input.patientMemoryBrief?.otherFacts || []),
    ...(input.patientMemoryBrief?.chronicConditions || []),
  ];
  const memoryPoints = facts
    .map(glucosePointFromFact)
    .filter((item): item is BloodGlucosePoint => Boolean(item));
  const historyPoints = (getPatientContextHistory(input.patient)?.visits || [])
    .flatMap((visit) => (visit.labResults || [])
      .map((result) => glucosePointFromHistoricalLab(result, visit))
      .filter((item): item is BloodGlucosePoint => Boolean(item)));
  const unique = new Map<string, BloodGlucosePoint>();
  [...memoryPoints, ...historyPoints].forEach((point) => {
    unique.set(`${point.measuredAt}:${point.measurementType}:${point.value}`, point);
  });
  return Array.from(unique.values())
    .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt))
    .slice(-12);
}

function readContractLabel(raw: Record<string, unknown> | undefined): {
  label: string;
  source: 'public-health' | 'unavailable';
} {
  const value = toText(readRawValue(raw, [
    'contractStatus',
    'familyDoctorContractStatus',
    'signStatus',
    'qyStatus',
  ]));
  if (/已签约|签约成功|active|signed|^1$/i.test(value)) {
    return { label: '已签约', source: 'public-health' };
  }
  if (/未签约|未签|inactive|unsigned|^0$/i.test(value)) {
    return { label: '未签约', source: 'public-health' };
  }
  return { label: '签约信息待核实', source: 'unavailable' };
}

function formatDateLabel(value: string | undefined): string {
  if (!value) return '暂无历史就诊';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function buildChronicDiseaseSummary(input: ChronicDiseaseSummaryInput): ChronicDiseasePatientSummary {
  const patient = input.patient;
  const raw = patient?.raw;
  const diagnoses = collectDiagnosisText(input);
  const diseaseTags = buildDiseaseTags(diagnoses, readPublicHealthStatus(raw));
  const pressurePoints = collectBloodPressurePoints(input);
  const glucosePoints = collectBloodGlucosePoints(input);
  const history = getPatientContextHistory(patient);
  const lastVisitTimestamp = (history?.visits || [])
    .map((visit) => visit.visitTime)
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  const lastVisitAt = lastVisitTimestamp ? new Date(lastVisitTimestamp).toISOString() : undefined;
  const contract = readContractLabel(raw);
  const recentMedicationFacts = collectMedicationFacts(input);
  const latestVitalSigns = patient?.currentVitalSigns
    || patient?.clinical?.currentVitalSigns
    || [...(history?.visits || [])]
      .sort((left, right) => right.visitTime - left.visitTime)
      .find((visit) => visit.vitalSigns)?.vitalSigns;
  const managedDiseaseTypes = diseaseTags
    .filter((item) => item.source === 'public-health')
    .map((item) => item.diseaseType);
  const latestDataAt = [
    ...pressurePoints.map((item) => item.measuredAt),
    ...glucosePoints.map((item) => item.measuredAt),
    ...recentMedicationFacts.map((item) => item.observedAt || ''),
    input.patientMemoryBrief?.lastSourceTime || '',
  ].filter(Boolean).sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  const gender = getPatientContextGenderText(patient) || '未知';

  return {
    patientId: getPatientContextId(patient) || '',
    visitId: getPatientContextVisitId(patient) || undefined,
    name: getPatientContextName(patient) || '未知患者',
    gender,
    ageText: getPatientContextAgeText(patient) || '年龄待核实',
    avatarGender: gender.includes('女') ? 'F' : 'M',
    organizationId: toText(readRawValue(raw, ['orgId', 'hisOrgId', 'organizationId', 'idOrg'])) || undefined,
    organizationName: toText(readRawValue(raw, ['orgName', 'hisOrgName', 'organizationName'])) || undefined,
    doctorId: toText(readRawValue(raw, ['doctorId', 'idDoctor'])) || undefined,
    doctorName: toText(readRawValue(raw, ['doctorName', 'naDoctor'])) || undefined,
    contractLabel: contract.label,
    contractSource: contract.source,
    diseaseTags,
    managedDiseaseTypes,
    hasSupportedDisease: diseaseTags.length > 0,
    isChronicManaged: managedDiseaseTypes.length > 0,
    diagnosisText: diagnoses.join('、') || '暂无明确诊断',
    lastVisitAt,
    lastVisitLabel: formatDateLabel(lastVisitAt),
    latestDataAt,
    latestHeightCm: latestVitalSigns?.heightCm,
    latestWeightKg: latestVitalSigns?.weightKg,
    latestWaistCm: latestVitalSigns?.waistCm,
    latestHeartRate: latestVitalSigns?.heartRate || latestVitalSigns?.pulseRate,
    bloodPressurePoints: pressurePoints,
    bloodGlucosePoints: glucosePoints,
    recentMedicationFacts,
    recentMedicationNames: Array.from(new Set(
      recentMedicationFacts.map((item) => item.name),
    )).slice(0, 8),
    recentMedicationSummaries: Array.from(new Set(
      recentMedicationFacts.map((item) => (
        item.regimenText ? `${item.name}（${item.regimenText}）` : item.name
      )),
    )).slice(0, 8),
    sourceQuality: input.patientMemoryBrief?.qualityStatus === 'fresh'
      ? 'ready'
      : patient
        ? 'partial'
        : 'unavailable',
  };
}
