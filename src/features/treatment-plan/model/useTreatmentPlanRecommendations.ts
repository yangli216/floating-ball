import { computed, ref, type Ref } from 'vue';
import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import { PROMPTS } from '@/prompts';
import type { AppPatient } from '@/types/appState';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import {
  getPatientContextAgeText,
  getPatientContextAllergyHistory,
  getPatientContextId,
  getPatientContextName,
  getPatientContextPastMedicalHistory,
  getPatientContextGenderText,
} from '@/utils/patientContext';
import {
  assessTreatmentCatalogMatch,
  buildClinicalResultTreatmentRequestSpec,
  buildClinicalResultTreatmentRecommendationsFromRaw,
  mapClinicalResultAiDiagnoses,
  parseLLMJson,
  readFirstString,
  type RawClinicalResultTreatmentRecommendationInput,
} from '@features/clinical-result';
import type {
  ClinicalResultTreatmentPromptAsset,
  ClinicalResultTreatmentRequestKind,
} from '@features/clinical-result';

export interface TreatmentPlanRecordContext {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  allergyHistory: string;
  diagnosisText: string;
}

export interface TreatmentPlanRecommendationSection {
  key: ClinicalResultTreatmentRequestKind;
  title: string;
  itemType: TreatmentRecommendation['type'];
  items: TreatmentRecommendation[];
  loading: boolean;
  error: string;
}

export interface TreatmentPlanRecommendationOptions {
  patient: Ref<AppPatient | null>;
  diagnosis: Ref<Diagnosis | null>;
  treatments: Ref<TreatmentRecommendation[]>;
  normalizeTreatment: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
}

const TREATMENT_REQUESTS: Array<{
  key: ClinicalResultTreatmentRequestKind;
  itemType: TreatmentRecommendation['type'];
  title: string;
  prompt: ClinicalResultTreatmentPromptAsset;
  traceTitle: string;
}> = [
  {
    key: 'medication',
    itemType: 'medicine',
    title: '推荐药品',
    prompt: PROMPTS.consultation.treatmentRecommendation,
    traceTitle: '诊疗方案推荐生成用药方案',
  },
  {
    key: 'exam',
    itemType: 'exam',
    title: '推荐检查',
    prompt: PROMPTS.consultation.examinationRecommendation,
    traceTitle: '诊疗方案推荐生成检查项目',
  },
  {
    key: 'lab_test',
    itemType: 'lab_test',
    title: '推荐检验',
    prompt: PROMPTS.consultation.labTestRecommendation,
    traceTitle: '诊疗方案推荐生成检验项目',
  },
  {
    key: 'procedure',
    itemType: 'procedure',
    title: '推荐处置',
    prompt: PROMPTS.consultation.procedureRecommendation,
    traceTitle: '诊疗方案推荐生成处置项目',
  },
];

function readPatientText(patient: AppPatient | null, keys: string[]): string {
  if (!patient) return '';

  const sources = [
    patient as Record<string, unknown>,
    patient.clinical as Record<string, unknown> | undefined,
    patient.raw,
  ];

  for (const source of sources) {
    const value = readFirstString(source, keys);
    if (value) return value;
  }

  return '';
}

function buildRecordContext(patient: AppPatient | null): TreatmentPlanRecordContext {
  return {
    chiefComplaint: readPatientText(patient, ['chiefComplaint', 'chief_complaint']),
    historyOfPresentIllness: readPatientText(patient, ['historyOfPresentIllness', 'history_of_present_illness']),
    pastMedicalHistory: getPatientContextPastMedicalHistory(patient) || readPatientText(patient, ['pastMedicalHistory', 'past_medical_history']),
    allergyHistory: getPatientContextAllergyHistory(patient) || readPatientText(patient, ['allergyHistory', 'allergy_history']),
    diagnosisText: readPatientText(patient, ['diagnosis', 'diagnosisText', 'diagnosis_text']),
  };
}

function buildDiagnosisFromText(text: string): Diagnosis | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const [matched] = mapClinicalResultAiDiagnoses({
    rawDiagnoses: [{
      name: trimmed,
      code: '',
      rate: 'HIS诊断',
      rationale: '来自当前 HIS 诊断草稿',
    }],
    matchDiagnosis: (query, context) => medicalDataService.matchDiagnosis(query, context),
    clearUnmatchedId: true,
  });

  return matched || {
    name: trimmed,
    code: '',
    rate: 'HIS诊断',
    rationale: '来自当前 HIS 诊断草稿',
  };
}

function buildTreatmentRequestKind(kind: ClinicalResultTreatmentRequestKind): ClinicalResultTreatmentRequestKind {
  return kind;
}

export function useTreatmentPlanRecommendations(options: TreatmentPlanRecommendationOptions) {
  const loadingByKind = ref<Record<ClinicalResultTreatmentRequestKind, boolean>>({
    medication: false,
    exam: false,
    lab_test: false,
    procedure: false,
  });
  const errorByKind = ref<Record<ClinicalResultTreatmentRequestKind, string>>({
    medication: '',
    exam: '',
    lab_test: '',
    procedure: '',
  });
  const initialized = ref(false);
  const refreshing = ref(false);
  const lastRunKey = ref('');

  const recordContext = computed(() => buildRecordContext(options.patient.value));
  const canRecommend = computed(() => Boolean(
    recordContext.value.chiefComplaint
    && recordContext.value.historyOfPresentIllness
    && recordContext.value.diagnosisText,
  ));
  const missingContextTips = computed(() => {
    const tips: string[] = [];
    if (!recordContext.value.chiefComplaint) tips.push('主诉');
    if (!recordContext.value.historyOfPresentIllness) tips.push('现病史');
    if (!recordContext.value.diagnosisText) tips.push('诊断');
    return tips;
  });
  const isLoading = computed(() => Object.values(loadingByKind.value).some(Boolean));
  const selectedTreatments = computed(() => options.treatments.value.filter((item) => item.selected));
  const sections = computed<TreatmentPlanRecommendationSection[]>(() => TREATMENT_REQUESTS.map((config) => ({
    key: config.key,
    title: config.title,
    itemType: config.itemType,
    items: options.treatments.value.filter((item) => item.type === config.itemType),
    loading: loadingByKind.value[config.key],
    error: errorByKind.value[config.key],
  })));

  function buildRunKey(): string {
    const patient = options.patient.value;
    return [
      getPatientContextId(patient),
      recordContext.value.chiefComplaint,
      recordContext.value.historyOfPresentIllness,
      recordContext.value.diagnosisText,
    ].join('|');
  }

  function replaceTreatmentsByType(type: TreatmentRecommendation['type'], items: TreatmentRecommendation[]): void {
    options.treatments.value = [
      ...options.treatments.value.filter((item) => item.type !== type),
      ...items,
    ];
  }

  async function fetchSection(config: (typeof TREATMENT_REQUESTS)[number], runKey: string): Promise<void> {
    loadingByKind.value = { ...loadingByKind.value, [config.key]: true };
    errorByKind.value = { ...errorByKind.value, [config.key]: '' };

    const patient = options.patient.value;
    const currentDiagnosis = options.diagnosis.value;
    try {
      if (!currentDiagnosis) {
        throw new Error('缺少当前诊断');
      }

      const requestSpec = buildClinicalResultTreatmentRequestSpec(buildTreatmentRequestKind(config.key), {
        patientName: getPatientContextName(patient) || '未知患者',
        gender: getPatientContextGenderText(patient) || '未知',
        age: getPatientContextAgeText(patient) || '',
        diagnosisName: currentDiagnosis.name,
        diagnosisCode: currentDiagnosis.code || '',
        chiefComplaint: recordContext.value.chiefComplaint,
      }, config.prompt, {
        sourceModule: 'treatment_plan_ai',
        operationModule: 'treatment_plan',
      }, {
        scene: `treatment-plan-${config.key}`,
        title: config.traceTitle,
      });

      const response = await chat(requestSpec.messages, undefined, undefined, undefined, requestSpec.config);
      if (runKey !== lastRunKey.value) return;

      const rawRecommendations = parseLLMJson<RawClinicalResultTreatmentRecommendationInput[]>(response);
      const mapped = buildClinicalResultTreatmentRecommendationsFromRaw({
        rawRecommendations,
        type: config.itemType,
        match: assessTreatmentCatalogMatch,
        normalize: options.normalizeTreatment,
      });
      replaceTreatmentsByType(config.itemType, mapped);
    } catch (error) {
      console.error('[TreatmentPlan] Failed to fetch treatment recommendation', {
        kind: config.key,
        error,
      });
      errorByKind.value = {
        ...errorByKind.value,
        [config.key]: `${config.title}生成失败，已保留其它可用建议。`,
      };
    } finally {
      loadingByKind.value = { ...loadingByKind.value, [config.key]: false };
    }
  }

  async function refresh(): Promise<boolean> {
    if (!canRecommend.value) {
      return false;
    }

    const runKey = buildRunKey();
    lastRunKey.value = runKey;
    refreshing.value = true;
    options.treatments.value = [];
    options.diagnosis.value = buildDiagnosisFromText(recordContext.value.diagnosisText);
    initialized.value = true;

    await Promise.all(TREATMENT_REQUESTS.map((config) => fetchSection(config, runKey)));
    refreshing.value = false;
    return runKey === lastRunKey.value;
  }

  function toggleSelection(item: TreatmentRecommendation): void {
    item.selected = !item.selected;
  }

  return {
    canRecommend,
    diagnosis: options.diagnosis,
    errorByKind,
    initialized,
    isLoading,
    missingContextTips,
    recordContext,
    refreshing,
    sections,
    selectedTreatments,
    treatments: options.treatments,
    refresh,
    toggleSelection,
  };
}

export type TreatmentPlanRecommendations = ReturnType<typeof useTreatmentPlanRecommendations>;
