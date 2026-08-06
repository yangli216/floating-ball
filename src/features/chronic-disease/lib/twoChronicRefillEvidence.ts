import type {
  ChronicDiseaseVisitDrug,
  ChronicDiseaseVisitInfo,
} from '@/services/his/types';
import type { AppPatient } from '@/types/appState';
import type { ChronicRefillSupplementalEvidence } from '@features/reception-risk/lib/chronicRefillAssessment';
import { buildChronicDiseaseSummary } from './chronicDiseaseSummary';

const HYPERTENSION_PATTERN = /高血压|原发性高血压|\bI1[0-5](?:\.\w+)?\b/i;
const TYPE2_DIABETES_PATTERN = /2\s*型糖尿病|Ⅱ\s*型糖尿病|II\s*型糖尿病|非胰岛素依赖型糖尿病|\bE11(?:\.\w+)?\b/i;

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function readVisitInfos(patient: AppPatient): ChronicDiseaseVisitInfo[] {
  const value = patient.raw?.visitInfos;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChronicDiseaseVisitInfo => (
    Boolean(item) && typeof item === 'object'
  ));
}

function visitTimestamp(visit: ChronicDiseaseVisitInfo, index: number): number {
  const parsed = Date.parse(toText(visit.dtVisit).replace(/\//g, '-'));
  return Number.isFinite(parsed) ? parsed : index;
}

function latestVisits(visits: ChronicDiseaseVisitInfo[]): ChronicDiseaseVisitInfo[] {
  return visits
    .map((visit, index) => ({ visit, index, timestamp: visitTimestamp(visit, index) }))
    .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index)
    .slice(0, 3)
    .map(({ visit }) => visit);
}

function formatMedication(drug: ChronicDiseaseVisitDrug): string {
  const name = toText(drug.naDrug);
  const dose = [toText(drug.perDose), toText(drug.doseUnit)].filter(Boolean).join('');
  const regimen = [dose, toText(drug.sdDrugFreq)].filter(Boolean).join(' · ');
  return regimen ? `${name}（${regimen}）` : name;
}

function collectMedications(visits: ChronicDiseaseVisitInfo[]): string[] {
  const medications = new Map<string, string>();
  visits.forEach((visit) => {
    (visit.drugList || []).forEach((drug) => {
      const name = toText(drug.naDrug);
      if (!name || medications.has(name)) return;
      medications.set(name, formatMedication(drug));
    });
  });
  return Array.from(medications.values()).slice(0, 8);
}

function collectDiagnoses(patient: AppPatient): string[] {
  const summary = buildChronicDiseaseSummary({ patient });
  const supportedTypes = new Set(summary.diseaseTags.map((item) => item.diseaseType));
  const diagnosisText = toText(patient.raw?.diagnosis);
  const diagnoses = diagnosisText
    .split(/[、,，;；|]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((diagnosis) => (
      (supportedTypes.has('hypertension') && HYPERTENSION_PATTERN.test(diagnosis))
      || (supportedTypes.has('type2_diabetes') && TYPE2_DIABETES_PATTERN.test(diagnosis))
    ));
  return Array.from(new Set(diagnoses));
}

/**
 * 读取两慢病原始历史随访字段作为复诊候选的补充证据。
 *
 * 不把原始慢病响应翻译成 HisPatientHistory，也不读取当前 idVis 的诊中处方。
 */
export function buildTwoChronicRefillEvidence(
  patient: AppPatient | null | undefined,
): ChronicRefillSupplementalEvidence | null {
  if (!patient || patient.source !== 'open-chronic-disease-management') return null;

  const visits = latestVisits(readVisitInfos(patient));
  if (visits.length === 0) return null;

  const diagnoses = collectDiagnoses(patient);
  if (diagnoses.length === 0) return null;

  return {
    diagnoses: diagnoses.map((name) => ({ name })),
    medications: collectMedications(visits),
    visitCount: visits.length,
    evidenceLabel: '两慢病历史记录',
  };
}
