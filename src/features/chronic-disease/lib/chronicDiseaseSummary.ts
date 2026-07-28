import type {
  ChronicDiseaseHistoryField,
  ChronicDiseaseVisitInfo,
} from '@/services/his/types';
import {
  getPatientContextAgeText,
  getPatientContextGenderText,
  getPatientContextHistory,
  getPatientContextName,
} from '@/utils/patientContext';
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

function normalizeDateInput(value: unknown): string {
  const match = toText(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return '';

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = toText(value).replace(/,/g, '');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readObjectList<T extends Record<string, unknown>>(
  raw: Record<string, unknown> | undefined,
  key: string,
): T[] {
  const value = raw?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is T => Boolean(item) && typeof item === 'object')
    : [];
}

function readHistoryFields(
  raw: Record<string, unknown> | undefined,
  key: 'pressureList' | 'pressureHist' | 'pressureHList' | 'gluList',
): ChronicDiseaseHistoryField[] {
  return readObjectList<ChronicDiseaseHistoryField & Record<string, unknown>>(raw, key);
}

function readVisitInfos(raw: Record<string, unknown> | undefined): ChronicDiseaseVisitInfo[] {
  return readObjectList<ChronicDiseaseVisitInfo & Record<string, unknown>>(raw, 'visitInfos');
}

type FollowUpVisitKind = '1' | '2';

interface FollowUpPlanCandidate {
  index: number;
  visitAt: number;
  date: string;
  kinds: FollowUpVisitKind[];
}

const HYPERTENSION_VISIT_FIELDS = [
  'sdSalt',
  'sdAdvSalt',
  'fgCardiovascular',
  'sdMajorCc',
  'targetOrganDamage',
] as const;

const DIABETES_VISIT_FIELDS = [
  'glu',
  'fbgMeal',
  'hgb',
  'dtHgb',
  'rice',
  'targRice',
  'lowEffects',
  'sdArteriopalmus',
  'sdComplications',
  'sdComorbidity',
] as const;

function hasVisitField(
  visitInfo: ChronicDiseaseVisitInfo,
  fields: readonly string[],
): boolean {
  return fields.some((field) => {
    const value = visitInfo[field];
    return value !== undefined && value !== null && toText(value) !== '';
  });
}

function readFollowUpVisitKinds(visitInfo: ChronicDiseaseVisitInfo): FollowUpVisitKind[] {
  const rawValue = visitInfo.sdVisitKind;
  const values = Array.isArray(rawValue)
    ? rawValue.map((item) => toText(item))
    : toText(rawValue).split(/[,，;；|]/).map((item) => item.trim());
  const explicit = Array.from(new Set(values))
    .filter((item): item is FollowUpVisitKind => item === '1' || item === '2');
  if (explicit.length > 0) return explicit;

  if (hasVisitField(visitInfo, DIABETES_VISIT_FIELDS)) return ['2'];
  if (hasVisitField(visitInfo, HYPERTENSION_VISIT_FIELDS)) return ['1'];
  return [];
}

function latestPlanCandidate(
  candidates: readonly FollowUpPlanCandidate[],
  kind?: FollowUpVisitKind,
): FollowUpPlanCandidate | undefined {
  const sorted = candidates
    .filter((candidate) => !kind || candidate.kinds.includes(kind))
    .slice()
    .sort((left, right) => left.visitAt - right.visitAt || left.index - right.index);
  return sorted[sorted.length - 1];
}

function buildFollowUpPlanDates(
  raw: Record<string, unknown> | undefined,
  managedDiseaseTypes: readonly ChronicDiseaseType[],
): Pick<ChronicDiseasePatientSummary, 'dtHyPlan' | 'dtDbsPlan'> {
  const nested = raw?.rqflInfo && typeof raw.rqflInfo === 'object'
    ? raw.rqflInfo as Record<string, unknown>
    : undefined;
  let dtHyPlan = normalizeDateInput(
    readRawValue(raw, ['dtHyPlan']) ?? readRawValue(nested, ['dtHyPlan']),
  );
  let dtDbsPlan = normalizeDateInput(
    readRawValue(raw, ['dtDbsPlan']) ?? readRawValue(nested, ['dtDbsPlan']),
  );

  const candidates = readVisitInfos(raw)
    .map((visitInfo, index): FollowUpPlanCandidate | null => {
      const date = normalizeDateInput(visitInfo.dtNextVisit);
      if (!date) return null;
      const visitAt = Date.parse(normalizeDate(visitInfo.dtVisit));
      return {
        index,
        visitAt: Number.isFinite(visitAt) ? visitAt : index,
        date,
        kinds: readFollowUpVisitKinds(visitInfo),
      };
    })
    .filter((item): item is FollowUpPlanCandidate => Boolean(item));

  const hasHypertension = managedDiseaseTypes.includes('hypertension');
  const hasDiabetes = managedDiseaseTypes.includes('type2_diabetes');

  if (hasHypertension && !dtHyPlan) {
    dtHyPlan = latestPlanCandidate(candidates, '1')?.date || '';
  }
  if (hasDiabetes && !dtDbsPlan) {
    dtDbsPlan = latestPlanCandidate(candidates, '2')?.date || '';
  }

  if (hasHypertension !== hasDiabetes) {
    const latest = latestPlanCandidate(candidates)?.date || '';
    if (hasHypertension && !dtHyPlan) dtHyPlan = latest;
    if (hasDiabetes && !dtDbsPlan) dtDbsPlan = latest;
  } else if (hasHypertension && hasDiabetes) {
    const unclassified = candidates.filter((candidate) => candidate.kinds.length === 0);
    if (!dtHyPlan && !dtDbsPlan && candidates.length === 2) {
      const ordered = candidates.slice().sort((left, right) => left.index - right.index);
      [dtHyPlan, dtDbsPlan] = [ordered[0].date, ordered[1].date];
    } else if (!dtHyPlan && unclassified.length === 1) {
      dtHyPlan = unclassified[0].date;
    } else if (!dtDbsPlan && unclassified.length === 1) {
      dtDbsPlan = unclassified[0].date;
    }
  }

  return {
    dtHyPlan: hasHypertension ? dtHyPlan || undefined : undefined,
    dtDbsPlan: hasDiabetes ? dtDbsPlan || undefined : undefined,
  };
}

function collectDiagnosisText(input: ChronicDiseaseSummaryInput): string[] {
  const patient = input.patient;
  const raw = patient?.raw;
  const history = getPatientContextHistory(patient);
  const values = [
    toText(raw?.diagnosis),
    toText(raw?.pastMedicalHistory),
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
  const unique = new Map<string, ChronicMedicationFact>();
  readVisitInfos(input.patient?.raw).forEach((visitInfo) => {
    const observedAt = normalizeDate(visitInfo.dtVisit) || undefined;
    const sourceLabel = visitInfo.idDoctorText
      ? `慢病随访 · ${visitInfo.idDoctorText}`
      : '慢病随访';
    (visitInfo.drugList || []).forEach((drug) => {
      const name = toText(drug.naDrug);
      if (!name) return;
      const dose = [toText(drug.perDose), toText(drug.doseUnit)].filter(Boolean).join('');
      const regimenText = [dose, toText(drug.sdDrugFreq)].filter(Boolean).join(' · ');
      const item: ChronicMedicationFact = {
        name,
        regimenText: regimenText || undefined,
        sdDrugFreq: toText(drug.sdDrugFreq) || undefined,
        perDose: toText(drug.perDose) || undefined,
        doseUnit: toText(drug.doseUnit) || undefined,
        insulin: /胰岛素/u.test(name) ? '1' : '2',
        observedAt,
        sourceLabel,
      };
      unique.set(`${name}:${observedAt || '-'}`, item);
    });
  });
  return Array.from(unique.values())
    .sort((left, right) => Date.parse(left.observedAt || '') - Date.parse(right.observedAt || ''))
    .slice(-12);
}

function collectBloodPressurePoints(input: ChronicDiseaseSummaryInput): BloodPressurePoint[] {
  const raw = input.patient?.raw;
  const pressureLByDate = new Map<string, ChronicDiseaseHistoryField>();
  readHistoryFields(raw, 'pressureList').forEach((item) => {
    const measuredAt = normalizeDate(item.bisDate);
    if (measuredAt) pressureLByDate.set(measuredAt, item);
  });
  const pressureHItems = readHistoryFields(raw, 'pressureHist');
  const resolvedPressureHItems = pressureHItems.length > 0
    ? pressureHItems
    : readHistoryFields(raw, 'pressureHList');
  const points = resolvedPressureHItems
    .map((pressureH): BloodPressurePoint | null => {
      const measuredAt = normalizeDate(pressureH.bisDate);
      const pressureL = pressureLByDate.get(measuredAt);
      const systolic = numericValue(pressureH.fieldValue);
      const diastolic = numericValue(pressureL?.fieldValue);
      if (!measuredAt || systolic === undefined || diastolic === undefined) return null;
      return {
        measuredAt,
        systolic,
        diastolic,
        sourceLabel: toText(pressureH.sourceText || pressureL?.sourceText) || '慢病系统',
      };
    })
    .filter((item): item is BloodPressurePoint => Boolean(item));
  return points
    .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt))
    .slice(-12);
}

function collectBloodGlucosePoints(input: ChronicDiseaseSummaryInput): BloodGlucosePoint[] {
  return readHistoryFields(input.patient?.raw, 'gluList')
    .map((item): BloodGlucosePoint | null => {
      const measuredAt = normalizeDate(item.bisDate);
      const value = numericValue(item.fieldValue);
      if (!measuredAt || value === undefined) return null;
      return {
        measuredAt,
        value,
        measurementType: 'fasting',
        sourceLabel: toText(item.sourceText) || '慢病系统',
      };
    })
    .filter((item): item is BloodGlucosePoint => Boolean(item))
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
  const visitInfos = readVisitInfos(raw)
    .slice()
    .sort((left, right) => (
      Date.parse(toText(left.dtVisit).replace(/\//g, '-'))
      - Date.parse(toText(right.dtVisit).replace(/\//g, '-'))
    ));
  const latestVisitInfo = visitInfos[visitInfos.length - 1];
  const lastVisitAt = normalizeDate(latestVisitInfo?.dtVisit) || undefined;
  const contract = readContractLabel(raw);
  const recentMedicationFacts = collectMedicationFacts(input);
  const managedDiseaseTypes = diseaseTags
    .filter((item) => item.source === 'public-health')
    .map((item) => item.diseaseType);
  const followUpPlanDates = buildFollowUpPlanDates(raw, managedDiseaseTypes);
  const latestDataAt = [
    ...pressurePoints.map((item) => item.measuredAt),
    ...glucosePoints.map((item) => item.measuredAt),
    ...recentMedicationFacts.map((item) => item.observedAt || ''),
  ].filter(Boolean).sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  const gender = toText(raw?.sdSexText) || getPatientContextGenderText(patient) || '未知';
  const hasOriginalChronicDiseaseData = Boolean(toText(raw?.idPhr))
    || Boolean(toText(raw?.idRecord))
    || Array.isArray(raw?.pressureList)
    || Array.isArray(raw?.pressureHist)
    || Array.isArray(raw?.pressureHList)
    || Array.isArray(raw?.gluList)
    || Array.isArray(raw?.visitInfos);

  return {
    idPhr: toText(raw?.idPhr),
    idRecord: toText(raw?.idRecord),
    name: toText(raw?.naPi) || getPatientContextName(patient) || '未知患者',
    gender,
    ageText: toText(raw?.ageText) || getPatientContextAgeText(patient) || '年龄待核实',
    avatarGender: gender.includes('女') ? 'F' : 'M',
    organizationId: toText(readRawValue(raw, ['orgId', 'hisOrgId', 'organizationId', 'idOrg'])) || undefined,
    organizationName: toText(readRawValue(raw, ['orgName', 'hisOrgName', 'organizationName'])) || undefined,
    doctorId: toText(latestVisitInfo?.idDoctor) || undefined,
    doctorName: toText(latestVisitInfo?.idDoctorText) || undefined,
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
    latestHeightCm: latestVisitInfo?.stature,
    latestWeightKg: latestVisitInfo?.avoirdupois,
    latestWaistCm: latestVisitInfo?.waistline,
    latestHeartRate: latestVisitInfo?.heartRate,
    ...followUpPlanDates,
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
    sourceQuality: hasOriginalChronicDiseaseData
      ? 'ready'
      : patient
        ? 'partial'
        : 'unavailable',
  };
}
