import type {
  ClinicalResultMatchedDiagnosis as MatchedDiagnosis,
  ClinicalResultMatchedTreatment as MatchedTreatment,
  ClinicalResultTreatment,
} from './clinicalResultContract';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { splitDosageAndUnit } from '@/utils/treatmentInference';
import { normalizeRawTreatmentRecommendationFields } from './clinicalResultTreatmentFields';
import { getStandardDiagnosisId } from './recordConfirmedPayload';

type TreatmentMatchState = Pick<
  TreatmentRecommendation,
  'matchedItem' | 'suggestedMatchItem' | 'matchStatus'
>;

export interface InitClinicalDiagnosesOptions {
  buildRationale: (item: MatchedDiagnosis, displayName: string) => string;
}

export interface InitClinicalTreatmentsOptions {
  assessCatalogMatch: (
    type: TreatmentRecommendation['type'],
    name: string,
    aliases?: string[],
    spec?: string,
  ) => TreatmentMatchState;
  inferFrequency: (text: string) => string;
  inferRoute: (text: string) => string;
  normalize: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  buildReason: (item: MatchedTreatment, displayName: string) => string;
  shouldAutoSelect: (item: MatchedTreatment) => boolean;
}

export function mapClinicalTreatmentType(
  type: MatchedTreatment['type'],
): TreatmentRecommendation['type'] {
  if (type === 'examination') return 'exam';
  if (type === 'labTest') return 'lab_test';
  return type;
}

export function hasClinicalResultTreatmentState(item: MatchedTreatment): boolean {
  const candidate = item as Partial<TreatmentRecommendation>;
  return Boolean(
    candidate.suggestedMatchItem
    || candidate.matchStatus
    || typeof candidate.selected === 'boolean'
    || candidate.manualMatched
    || candidate.route
    || candidate.routeKey
    || candidate.pharmacy
    || candidate.pharmacyCleared
    || candidate.execDept
    || candidate.execDeptCleared
    || candidate.insuranceType
    || candidate.insuranceCleared
    || candidate.bodySite
    || candidate.bodySiteId
  );
}

export function initClinicalDiagnoses(
  matched: MatchedDiagnosis[],
  options: InitClinicalDiagnosesOptions,
): Diagnosis[] {
  return matched.map((item) => {
    const inheritedDiagnosis = item as MatchedDiagnosis & Partial<Diagnosis>;
    const name = item.matchedItem?.name || item.name;
    const standardId = item.matchedItem?.id || getStandardDiagnosisId(inheritedDiagnosis as Diagnosis);
    return {
      id: standardId || undefined,
      name,
      code: item.matchedItem?.code || item.code || '',
      rate: inheritedDiagnosis.rate || formatDiagnosisConfidence(item.confidence),
      rationale: options.buildRationale(item, name),
      isTCM: inheritedDiagnosis.isTCM,
      syndrome: inheritedDiagnosis.syndrome,
      syndromeCode: inheritedDiagnosis.syndromeCode,
      syndromeMatched: inheritedDiagnosis.syndromeMatched,
      treatment: inheritedDiagnosis.treatment,
      treatmentCode: inheritedDiagnosis.treatmentCode,
      treatmentMatched: inheritedDiagnosis.treatmentMatched,
    };
  });
}

export function formatDiagnosisConfidence(confidence?: MatchedDiagnosis['confidence']): string {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信';
  if (confidence === 'low') return '低置信';
  return 'AI分析';
}

export function initClinicalTreatments(
  matched: MatchedTreatment[],
  options: InitClinicalTreatmentsOptions,
): TreatmentRecommendation[] {
  return matched.map((item) => {
    const type = mapClinicalTreatmentType(item.type);
    const normalizedRaw = normalizeRawTreatmentRecommendationFields(
      item as ClinicalResultTreatment & Record<string, unknown>,
      type,
    );
    const inherited = normalizedRaw as ClinicalResultTreatment;
    const suggestedName = item.name;
    const hasExistingMatch = hasClinicalResultTreatmentState(item);
    const assessment = hasExistingMatch
      ? {
          matchedItem: inherited.matchedItem,
          suggestedMatchItem: inherited.suggestedMatchItem,
          matchStatus: inherited.matchStatus || (inherited.matchedItem ? 'exact' : 'unmatched'),
        }
      : options.assessCatalogMatch(type, suggestedName, item.aliases, item.spec);
    const name = assessment.matchedItem?.name || inherited.name || suggestedName;
    const dosagePair = splitDosageAndUnit(item.dosage);
    const selectionBasis = {
      ...item,
      matchedItem: assessment.matchedItem,
    } as MatchedTreatment;

    return options.normalize({
      ...inherited,
      type,
      name,
      originalName: inherited.originalName || (name !== suggestedName ? suggestedName : ''),
      reason: inherited.reason || options.buildReason(item, name),
      spec: inherited.spec || assessment.matchedItem?.spec || '',
      targetDose: item.targetDose || '',
      targetDoseUnit: item.targetDoseUnit || '',
      usage: inherited.usage || [item.usage, item.frequency, item.dosage, item.dosageUnit].filter(Boolean).join('，'),
      dosage: item.dosage || dosagePair.dosage,
      dosageUnit: item.dosageUnit || dosagePair.dosageUnit,
      frequency: item.frequency || options.inferFrequency([item.frequency, item.evidenceText, item.text].filter(Boolean).join(' ')),
      frequencyKey: item.frequencyKey || '',
      route: inherited.route || item.usage || options.inferRoute([item.usage, item.evidenceText, item.text].filter(Boolean).join(' ')),
      routeKey: inherited.routeKey || item.usageKey || '',
      totalQty: inherited.totalQty || item.totalQty || '',
      totalUnit: inherited.totalUnit || item.totalUnit || '',
      days: item.days || '',
      sourceType: item.sourceType,
      evidenceText: item.evidenceText || item.text || '',
      goal: item.goal || '',
      matchedItem: assessment.matchedItem,
      suggestedMatchItem: assessment.suggestedMatchItem,
      matchStatus: assessment.matchStatus,
      manualMatched: !!inherited.manualMatched,
      selected: typeof inherited.selected === 'boolean'
        ? inherited.selected
        : assessment.matchStatus === 'exact' && options.shouldAutoSelect(selectionBasis),
    });
  });
}
