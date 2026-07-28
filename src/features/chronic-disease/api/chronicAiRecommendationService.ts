import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import { PROMPTS } from '@/prompts/prompts';
import type { TreatmentRecommendation } from '@/types/consultation';
import { buildClinicalResultTreatmentRequestSpec } from '@features/clinical-result/clinicalResultAiRequest';
import { parseLLMJson } from '@features/clinical-result/clinicalResultLlmJsonParser';
import {
  buildInstitutionAuxiliaryCatalogContext,
  mapAuxiliaryCatalogRecommendations,
  type AuxiliaryCatalogRecommendationResponse,
} from '@features/clinical-result/institutionAuxiliaryCatalog';
import type {
  ChronicAiRecommendation,
  ChronicDiseasePatientSummary,
} from '../types';

const MAX_RECOMMENDATION_COUNT = 5;
const MAX_RECENT_MEASUREMENT_COUNT = 5;

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function formatGlucoseMeasurementType(
  value: ChronicDiseasePatientSummary['bloodGlucosePoints'][number]['measurementType'],
): string {
  switch (value) {
    case 'fasting':
      return '空腹';
    case 'postprandial':
      return '餐后';
    case 'random':
      return '随机';
    default:
      return '时点待核实';
  }
}

function formatRecentMeasurements(summary: ChronicDiseasePatientSummary): string[] {
  const bloodPressure = summary.bloodPressurePoints
    .slice(-MAX_RECENT_MEASUREMENT_COUNT)
    .map((item) => (
      `${formatDate(item.measuredAt)} ${item.systolic}/${item.diastolic} mmHg`
    ));
  const bloodGlucose = summary.bloodGlucosePoints
    .slice(-MAX_RECENT_MEASUREMENT_COUNT)
    .map((item) => (
      `${formatDate(item.measuredAt)} ${item.value} mmol/L（${formatGlucoseMeasurementType(item.measurementType)}）`
    ));

  return [
    bloodPressure.length > 0 ? `近期血压序列：${bloodPressure.join('；')}` : '',
    bloodGlucose.length > 0 ? `近期血糖序列：${bloodGlucose.join('；')}` : '',
  ].filter(Boolean);
}

function formatLatestVisitFacts(summary: ChronicDiseasePatientSummary): string {
  const facts = [
    summary.latestHeightCm ? `身高 ${summary.latestHeightCm} cm` : '',
    summary.latestWeightKg ? `体重 ${summary.latestWeightKg} kg` : '',
    summary.latestWaistCm ? `腰围 ${summary.latestWaistCm} cm` : '',
    summary.latestHeartRate ? `心率 ${summary.latestHeartRate} 次/分` : '',
  ].filter(Boolean);
  if (facts.length === 0) return '';
  return `最近随访体征（${summary.lastVisitLabel}）：${facts.join('，')}`;
}

function formatRecentMedications(summary: ChronicDiseasePatientSummary): string {
  const medications = summary.recentMedicationSummaries?.length
    ? summary.recentMedicationSummaries
    : summary.recentMedicationNames;
  return medications.length > 0 ? `近期用药：${medications.join('、')}` : '';
}

function buildChronicRecommendationContext(summary: ChronicDiseasePatientSummary): string {
  const diseaseLabels = summary.diseaseTags.map((item) => (
    `${item.label}（${item.sourceLabel}）`
  ));
  return [
    `管理病种：${diseaseLabels.join('、') || summary.diagnosisText || '待核实'}`,
    `现有诊断资料：${summary.diagnosisText || '待核实'}`,
    ...formatRecentMeasurements(summary),
    formatLatestVisitFacts(summary),
    formatRecentMedications(summary),
    summary.latestDataAt ? `最新慢病数据日期：${formatDate(summary.latestDataAt)}` : '',
    summary.sourceQuality === 'ready'
      ? ''
      : '当前慢病资料不完整：只能基于已经明确提供的事实选择项目，不得把缺失信息推断为正常或异常。',
    '本次仅评估未来 90 天内确有必要核实的慢病复查或并发症筛查项目；不得自动诊断、调整用药或改变已发布临床规则。',
  ].filter(Boolean).join('\n');
}

export async function generateChronicAiRecommendations(
  summary: ChronicDiseasePatientSummary,
  options: { forceCatalog?: boolean } = {},
): Promise<ChronicAiRecommendation[]> {
  if (!summary.hasSupportedDisease) return [];

  const availableItems = await medicalDataService.fetchAvailableExamLabItems({
    force: options.forceCatalog,
  });
  const catalog = buildInstitutionAuxiliaryCatalogContext(
    availableItems,
    ['exam', 'lab_test'],
  );
  const requestedTypes = [
    ...(catalog.counts.exam > 0 ? ['exam' as const] : []),
    ...(catalog.counts.labTest > 0 ? ['lab_test' as const] : []),
  ];
  if (requestedTypes.length === 0) {
    throw new Error('当前 HIS 上下文没有可开立的检查或检验项目');
  }

  const request = buildClinicalResultTreatmentRequestSpec(
    'exam',
    {
      patientName: summary.name || '当前患者',
      gender: summary.gender || '未知',
      age: summary.ageText || '未知',
      diagnosisName: summary.diagnosisText || '两慢病管理对象',
      diagnosisCode: '',
      chiefComplaint: '慢病接诊，评估未来 90 天必要的复查与并发症筛查项目',
      clinicalContext: buildChronicRecommendationContext(summary),
      availableExamLabCatalog: catalog.promptContext,
      requestedTypes,
      explicitItemNames: [],
    },
    PROMPTS.consultation.auxiliaryCatalogRecommendation,
    {
      consultationId: summary.idRecord || summary.idPhr,
      sourceModule: 'chronic_disease_ai',
      operationModule: 'chronic_disease',
    },
    {
      scene: 'chronic-disease-auxiliary-catalog-recommendation',
      operationAction: 'generate_chronic_auxiliary_recommendation',
      title: '慢病插件生成院内目录检查检验推荐',
    },
  );
  const response = await chat(
    request.messages,
    undefined,
    undefined,
    undefined,
    request.config,
  );
  const recommendations = mapAuxiliaryCatalogRecommendations(
    parseLLMJson<AuxiliaryCatalogRecommendationResponse>(response),
    catalog,
    requestedTypes,
    (item) => item as TreatmentRecommendation,
  );

  return recommendations
    .flatMap((item) => {
      if (!item.matchedItem) return [];
      return [{
        id: String(item.matchedItem.id || `${item.type}:${item.name}`),
        type: item.type === 'exam' ? 'exam' as const : 'lab_test' as const,
        name: item.matchedItem.name || item.name,
        reason: item.reason || '结合当前慢病资料与院内可开立目录推荐',
        matchedItem: item.matchedItem,
      }];
    })
    .slice(0, MAX_RECOMMENDATION_COUNT);
}
