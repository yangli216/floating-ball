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

function formatLatestMeasurement(summary: ChronicDiseasePatientSummary): string {
  const latestPressure = summary.bloodPressurePoints[summary.bloodPressurePoints.length - 1];
  const latestGlucose = summary.bloodGlucosePoints[summary.bloodGlucosePoints.length - 1];
  const facts = [
    latestPressure
      ? `最近血压 ${latestPressure.systolic}/${latestPressure.diastolic} mmHg（${latestPressure.measuredAt}）`
      : '',
    latestGlucose
      ? `最近血糖 ${latestGlucose.value} mmol/L（${latestGlucose.measuredAt}）`
      : '',
    summary.recentMedicationNames.length > 0
      ? `近期用药：${summary.recentMedicationNames.join('、')}`
      : '',
  ].filter(Boolean);
  return facts.length > 0 ? facts.join('；') : '暂无可用的近期测量或用药事实';
}

function buildChronicRecommendationContext(summary: ChronicDiseasePatientSummary): string {
  const diseaseLabels = summary.diseaseTags.map((item) => (
    `${item.label}（${item.sourceLabel}）`
  ));
  return [
    `管理病种：${diseaseLabels.join('、') || summary.diagnosisText || '待核实'}`,
    formatLatestMeasurement(summary),
    '本次仅评估未来 90 天内确有必要核实的慢病复查或并发症筛查项目；不得自动诊断、调整用药或改变已发布临床规则。',
  ].join('\n');
}

export async function generateChronicAiRecommendations(
  summary: ChronicDiseasePatientSummary,
): Promise<ChronicAiRecommendation[]> {
  if (!summary.hasSupportedDisease) return [];

  const availableItems = await medicalDataService.fetchAvailableExamLabItems();
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

  return recommendations.flatMap((item) => {
    if (!item.matchedItem) return [];
    return [{
      id: String(item.matchedItem.id || `${item.type}:${item.name}`),
      type: item.type === 'exam' ? 'exam' : 'lab_test',
      name: item.matchedItem.name || item.name,
      reason: item.reason || '结合当前慢病资料与院内可开立目录推荐',
      matchedItem: item.matchedItem,
    }];
  });
}
