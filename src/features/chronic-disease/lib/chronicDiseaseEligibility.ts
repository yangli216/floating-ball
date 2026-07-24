import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseType,
} from '../types';

const FOLLOW_UP_DISEASE_ORDER: ChronicDiseaseType[] = [
  'hypertension',
  'type2_diabetes',
];

export function getManagedFollowUpDiseases(
  summary: ChronicDiseasePatientSummary,
): ChronicDiseaseType[] {
  return FOLLOW_UP_DISEASE_ORDER.filter((diseaseType) => (
    summary.managedDiseaseTypes.includes(diseaseType)
    && summary.diseaseTags.some((item) => (
      item.diseaseType === diseaseType
      && item.source === 'public-health'
      && Boolean(item.evidenceText?.trim())
    ))
  ));
}

export function isChronicFollowUpEligible(
  summary: ChronicDiseasePatientSummary,
  diseaseType?: ChronicDiseaseType,
): boolean {
  const eligibleDiseases = getManagedFollowUpDiseases(summary);
  return diseaseType
    ? eligibleDiseases.includes(diseaseType)
    : eligibleDiseases.length > 0;
}

export function getPrimaryManagedDisease(
  summary: ChronicDiseasePatientSummary,
): ChronicDiseaseType | undefined {
  return getManagedFollowUpDiseases(summary)[0];
}
