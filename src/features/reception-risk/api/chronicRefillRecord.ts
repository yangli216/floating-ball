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
import {
  buildChronicRefillInventoryTreatments,
  type ChronicRefillMedicineInput,
  type ChronicRefillMedicineRecommendation,
} from '../lib/chronicRefillInventory';

interface ChronicRefillDraft {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  currentMedicationHistory?: string;
  treatmentPlan?: string;
  healthEducation?: string;
  recommendedMedicines?: ChronicRefillMedicineInput[];
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

function isPatientFactHistory(value: string): boolean {
  if (value.length < 30 || /未提供新发不适信息/u.test(value)) return false;
  return !/(?:当前(?:有效)?库存|库存内|可续方药品|可参考药品|推荐药品|推荐使用|建议使用|后续治疗方案为)/u.test(value);
}

function normalizeMedicineRecommendation(value: unknown): ChronicRefillMedicineInput | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) return null;

  const result: ChronicRefillMedicineRecommendation = { name };
  const textFields: Array<keyof Omit<ChronicRefillMedicineRecommendation, 'name'>> = [
    'spec',
    'targetDose',
    'targetDoseUnit',
    'frequency',
    'frequencyKey',
    'route',
    'routeKey',
    'usage',
    'days',
    'reason',
  ];
  textFields.forEach((field) => {
    const fieldValue = source[field];
    const normalized = typeof fieldValue === 'string'
      ? fieldValue.trim()
      : (typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? String(fieldValue) : '');
    if (normalized) {
      result[field] = normalized;
    }
  });
  if (!result.targetDose) {
    const legacyDosage = source.dosage;
    result.targetDose = typeof legacyDosage === 'string'
      ? legacyDosage.trim()
      : (typeof legacyDosage === 'number' && Number.isFinite(legacyDosage) ? String(legacyDosage) : '');
  }
  if (!result.targetDoseUnit) {
    const legacyDosageUnit = source.dosageUnit;
    result.targetDoseUnit = typeof legacyDosageUnit === 'string' ? legacyDosageUnit.trim() : '';
  }
  return result;
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
  const medicationText = availableMedications.length > 0
    ? availableMedications.join('、')
    : (candidate.medications.length > 0 ? '当前库存未匹配到可直接续方的历史药品' : '暂无可直接沿用的历史药品');
  const historicalMedicationText = candidate.medications.length > 0
    ? `既往用药记录包括${candidate.medications.join('、')}。`
    : '既往用药方案未获取，待医生核实。';
  return {
    chiefComplaint: `${diagnosisText}定期复诊续方`,
    historyOfPresentIllness: `患者既往诊断${diagnosisText}，本次因慢性病复诊并评估后续用药方案。${historicalMedicationText}本次病情控制情况、服药依从性、不良反应及近期监测结果待医生面诊核实。`,
    pastMedicalHistory: getPatientContextPastMedicalHistory(patient) || `既往有${diagnosisText}病史。`,
    currentMedicationHistory: candidate.medications.length > 0
      ? candidate.medications.join('、')
      : '历史用药方案待医生核实',
    treatmentPlan: candidate.medications.length > 0 && availableMedications.length > 0
      ? `医生核实病情控制、依从性及禁忌证后，可从当前有效库存中的历史处方药品续方：${medicationText}。`
      : `未取得可直接沿用的历史用药方案，请结合${diagnosisText}、当前病情及有效库存由医生确认后续治疗。`,
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
  const recommendedMedicines = Array.isArray(value.recommendedMedicines)
    ? value.recommendedMedicines
      .map(normalizeMedicineRecommendation)
      .filter((item): item is ChronicRefillMedicineInput => Boolean(item))
    : [];
  return {
    chiefComplaint: chiefComplaint.length >= 6 && /复诊|续方|配药/u.test(chiefComplaint)
      ? chiefComplaint
      : fallback.chiefComplaint,
    historyOfPresentIllness: isPatientFactHistory(historyOfPresentIllness)
      ? historyOfPresentIllness
      : fallback.historyOfPresentIllness,
    pastMedicalHistory: value.pastMedicalHistory?.trim() || fallback.pastMedicalHistory,
    currentMedicationHistory: value.currentMedicationHistory?.trim() || fallback.currentMedicationHistory,
    treatmentPlan: fallback.treatmentPlan,
    healthEducation: value.healthEducation?.trim() || fallback.healthEducation,
    recommendedMedicines: recommendedMedicines.length > 0
      ? recommendedMedicines
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
    evidenceText: candidate.diagnosisEvidenceText,
    rationale: '',
    sourceType: 'explicit',
    confidence: 'high',
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
  const availableMedicationNames = initialTreatments
    .filter((item) => item.matchStatus === 'exact')
    .map((item) => item.name);
  let draft = fallbackDraft(patient, candidate, availableMedicationNames);
  try {
    const response = await chat([
      {
        role: 'system',
        content: [
          '你是基层门诊慢性病复诊配药病历助手。',
          '根据患者最近3次就诊中的慢病就诊记录和配药信息生成本次可编辑病历草稿，不得编造当前症状、生命体征、检查结果或病情稳定程度。',
          '主诉应写明具体慢病和“复诊续方”目的；现病史应概括慢病诊断、历史用药，并说明病情控制、服药依从性及监测结果待医生核实。',
          'historyOfPresentIllness只能记录患者事实和待核实信息，禁止写入当前库存、可续方药品、可参考药品、推荐药品或后续治疗方案；库存信息只能用于recommendedMedicines。',
          '禁止使用“未提供新发不适信息”作为主诉或现病史主体，也不要写“无不适”或“病情稳定”。',
          '药品按“库存同品 → 库存等效药 → 规范通用名兜底”选择；无库存通用名仅供医生参考。',
          '若未获取到可确认的历史用药，仍需根据具体慢病诊断、患者信息和当前有效库存推荐合理的候选药品，不得返回空方案。',
          '未获取到历史用药时，currentMedicationHistory只能写“历史用药方案待医生核实”等待核实表述，不得把本次推荐药品伪装成既往用药。',
          'recommendedMedicines 必须返回结构化药品对象，不生成检查、检验或处置。',
          '每个药品必须结合候选慢病、历史用药和库存规格给出合理的目标临床一次剂量、频次、用法和天数；不得把包装规格直接当成一次剂量，也不得把所有药品统一写成一次1剂量单位。',
          '目标剂量只写targetDose/targetDoseUnit，例如500mg写为targetDose="500"、targetDoseUnit="mg"；dosage/dosageUnit必须留空，由程序结合PHIS药品详情换算。frequencyKey优先使用QD/BID/TID/QID，routeKey口服优先使用PO。',
          'totalQty/totalUnit必须留空，包装总量由程序根据最终一次剂量、频次、天数和库存包装规格计算并校验库存。',
          'reason只说明诊断、历史用药和适应证等临床推荐依据，不得复述或计算单次剂量、频次、疗程、总量和包装数量。',
          '只返回 JSON 对象。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `患者：${getPatientContextName(patient)}，${getPatientContextGenderText(patient)}，${getPatientContextAgeText(patient)}`,
          `过敏史：${getPatientContextAllergyHistory(patient) || '未记录'}`,
          `历史临床诊断：${candidate.diagnoses.join('、')}`,
          `慢病分类（仅用于场景识别）：${candidate.diagnosisGroups.join('、')}`,
          `历史慢病配药：${candidate.medicationEvidenceText}`,
          `当前库存内可续方药品：${buildMedicationSummary(availableMedicationNames)}`,
          inventoryContext.promptContext,
          '最近3次中的慢病就诊依据：',
          buildHistoryEvidence(candidate),
          [
            '请生成字段：chiefComplaint、historyOfPresentIllness、pastMedicalHistory、currentMedicationHistory、treatmentPlan、healthEducation、recommendedMedicines。',
            'recommendedMedicines格式：',
            '[{"name":"库存中的完整药品名称","spec":"库存规格","targetDose":"目标临床一次剂量数值","targetDoseUnit":"mg/g/ml","frequency":"频次文本","frequencyKey":"频次编码","route":"用法文本","routeKey":"用法编码","days":"用药天数","reason":"推荐依据"}]',
          ].join('\n'),
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
    { historicalMedications: candidate.medications },
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
