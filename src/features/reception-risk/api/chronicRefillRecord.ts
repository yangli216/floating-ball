import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextGenderText,
  getPatientContextName,
  getPatientContextPastMedicalHistory,
} from '@/utils/patientContext';
import {
  loadAvailableMedicineInventoryContext,
  parseLLMJson,
  type ClinicalResultDiagnosis,
  type ClinicalResultInput,
} from '@features/clinical-result';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';
import { buildChronicRefillInventoryTreatments } from '../lib/chronicRefillInventory';

interface ChronicRefillDraft {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  currentMedicationHistory?: string;
  treatmentPlan?: string;
  healthEducation?: string;
  recommendedMedicines?: string[];
}

function buildHistoryEvidence(candidate: ChronicRefillCandidate): string {
  return candidate.chronicVisits.map((visit, index) => {
    const date = new Date(visit.visitTime);
    const dateText = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    return [
      `第${index + 1}次：${dateText}`,
      `诊断：${(visit.diagnoses || []).join('、') || '未记录'}`,
      `用药：${(visit.medications || []).join('、') || '未记录'}`,
      `主诉：${visit.chiefComplaint || '未记录'}`,
      `现病史：${visit.presentIllness || '未记录'}`,
    ].join('；');
  }).join('\n');
}

function buildMedicationSummary(medications: string[]): string {
  return medications.length > 0 ? medications.join('、') : '当前有效库存中未匹配到历史续方药品';
}

function standardizeMedicineName(value: string): string {
  return medicalDataService.matchMedicine(value)?.name
    || value
      .replace(/^[\s☆★*·•]+/u, '')
      .replace(/[（(][^）)]*[）)]/gu, '')
      .replace(/\d+(?:\.\d+)?\s*(?:μg|ug|mg|g|ml|片|粒|支|盒|瓶|袋)/giu, '')
      .trim();
}

function fallbackDraft(
  patient: AppPatient,
  candidate: ChronicRefillCandidate,
  availableMedications: string[],
): Required<ChronicRefillDraft> {
  const diagnosisText = candidate.diagnoses.join('、');
  const medicationText = buildMedicationSummary(availableMedications);
  return {
    chiefComplaint: `${diagnosisText}定期复诊续方`,
    historyOfPresentIllness: `患者既往诊断${diagnosisText}，本次因慢性病长期用药续方就诊。历史慢病处方记录包括${candidate.medications.join('、')}；当前可续方药品为${medicationText}。本次病情控制情况、服药依从性及近期监测结果待医生面诊核实。`,
    pastMedicalHistory: getPatientContextPastMedicalHistory(patient) || `既往有${diagnosisText}病史。`,
    currentMedicationHistory: candidate.medications.join('、'),
    treatmentPlan: availableMedications.length > 0
      ? `医生核实病情控制、依从性及禁忌证后，可从当前有效库存中的历史处方药品续方：${medicationText}。`
      : '当前有效库存中未匹配到历史续方药品，请医生核实库存或手工调整处方。',
    healthEducation: '按医嘱规律服药并记录家庭监测结果；出现症状变化或指标异常时及时复诊。',
    recommendedMedicines: candidate.medications,
  };
}

function normalizeDraft(
  value: ChronicRefillDraft,
  patient: AppPatient,
  candidate: ChronicRefillCandidate,
  availableMedications: string[],
): Required<ChronicRefillDraft> {
  const fallback = fallbackDraft(patient, candidate, availableMedications);
  const chiefComplaint = value.chiefComplaint?.trim() || '';
  const historyOfPresentIllness = value.historyOfPresentIllness?.trim() || '';
  return {
    chiefComplaint: chiefComplaint.length >= 6 && /复诊|续方|配药/u.test(chiefComplaint)
      ? chiefComplaint
      : fallback.chiefComplaint,
    historyOfPresentIllness: historyOfPresentIllness.length >= 30
      && !/未提供新发不适信息/u.test(historyOfPresentIllness)
      ? historyOfPresentIllness
      : fallback.historyOfPresentIllness,
    pastMedicalHistory: value.pastMedicalHistory?.trim() || fallback.pastMedicalHistory,
    currentMedicationHistory: value.currentMedicationHistory?.trim() || fallback.currentMedicationHistory,
    treatmentPlan: fallback.treatmentPlan,
    healthEducation: value.healthEducation?.trim() || fallback.healthEducation,
    recommendedMedicines: Array.isArray(value.recommendedMedicines) && value.recommendedMedicines.length > 0
      ? value.recommendedMedicines.map((item) => item.trim()).filter(Boolean)
      : fallback.recommendedMedicines,
  };
}

function matchDiagnosis(
  diagnosis: string,
  candidate: ChronicRefillCandidate,
): ClinicalResultDiagnosis {
  const matched = medicalDataService.matchDiagnosis(diagnosis);
  return {
    name: diagnosis,
    code: matched?.code || '',
    evidenceText: candidate.evidenceText,
    rationale: candidate.evidenceText,
    sourceType: 'inferred',
    confidence: 'medium',
    matchedItem: matched
      ? { id: matched.id, code: matched.code, name: matched.name }
      : null,
  };
}

export async function generateChronicRefillRecord(
  patient: AppPatient,
  candidate: ChronicRefillCandidate,
): Promise<ClinicalResultInput> {
  const inventoryContext = await loadAvailableMedicineInventoryContext().catch((error) => {
    console.warn('[ChronicRefill] Failed to load available inventory, no refill medicine will be preselected', error);
    return {
      items: [],
      promptContext: '',
      pharmacyCount: 0,
      staleStoreCount: 0,
    };
  });
  const initialTreatments = buildChronicRefillInventoryTreatments(
    candidate.medications,
    inventoryContext.items,
    standardizeMedicineName,
  );
  const availableMedicationNames = initialTreatments.filter((item) => item.selected).map((item) => item.name);
  let draft = fallbackDraft(patient, candidate, availableMedicationNames);
  try {
    const response = await chat([
      {
        role: 'system',
        content: [
          '你是基层门诊慢性病复诊配药病历助手。',
          '根据患者最近3次就诊中的慢病就诊记录和配药信息生成本次可编辑病历草稿，不得编造当前症状、生命体征、检查结果或病情稳定程度。',
          '主诉应写明具体慢病和“复诊续方”目的；现病史应概括慢病诊断、历史用药，并说明病情控制、服药依从性及监测结果待医生核实。',
          '禁止使用“未提供新发不适信息”作为主诉或现病史主体，也不要写“无不适”或“病情稳定”。',
          '药品按“库存同品 → 库存等效药 → 规范通用名兜底”选择；无库存通用名仅供医生参考。',
          'recommendedMedicines 返回最终药品名称数组，不生成检查、检验或处置。',
          '只返回 JSON 对象。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `患者：${getPatientContextName(patient)}，${getPatientContextGenderText(patient)}，${getPatientContextAgeText(patient)}`,
          `过敏史：${getPatientContextAllergyHistory(patient) || '未记录'}`,
          `候选慢病：${candidate.diagnoses.join('、')}`,
          `历史慢病配药：${candidate.medications.join('、')}`,
          `当前库存内可续方药品：${buildMedicationSummary(availableMedicationNames)}`,
          inventoryContext.promptContext,
          '最近3次中的慢病就诊依据：',
          buildHistoryEvidence(candidate),
          '请生成字段：chiefComplaint、historyOfPresentIllness、pastMedicalHistory、currentMedicationHistory、treatmentPlan、healthEducation、recommendedMedicines。',
        ].join('\n'),
      },
    ], undefined, undefined, undefined, {
      configProfile: 'fast',
      traceContext: {
        scene: 'reception-chronic-refill-record',
        sourceModule: 'reception_risk',
        operationModule: 'reception',
        operationAction: 'generate_chronic_refill_record',
        title: '接诊生成复诊配药病历',
      },
    });
    draft = normalizeDraft(
      parseLLMJson<ChronicRefillDraft>(response),
      patient,
      candidate,
      availableMedicationNames,
    );
  } catch (error) {
    console.warn('[ChronicRefill] AI draft failed, using deterministic fallback', error);
  }
  const treatments = buildChronicRefillInventoryTreatments(
    draft.recommendedMedicines,
    inventoryContext.items,
    standardizeMedicineName,
  );

  return {
    chiefComplaint: draft.chiefComplaint,
    historyOfPresentIllness: draft.historyOfPresentIllness,
    pastMedicalHistory: draft.pastMedicalHistory,
    allergyHistory: getPatientContextAllergyHistory(patient) || '未记录',
    currentMedicationHistory: draft.currentMedicationHistory,
    familyHistory: '',
    symptoms: [],
    negativeSymptoms: [],
    diagnoses: candidate.diagnoses.map((diagnosis) => matchDiagnosis(diagnosis, candidate)),
    treatments,
    treatmentPlan: draft.treatmentPlan,
    healthEducation: draft.healthEducation,
    recommendationPolicy: {
      autoFetchTreatments: false,
      allowTreatmentRefresh: false,
      allowedTreatmentTypes: ['medicine'],
    },
  };
}
