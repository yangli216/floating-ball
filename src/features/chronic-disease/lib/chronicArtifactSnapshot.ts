import type {
  AnnualChronicAssessment,
} from './annualAssessment';
import {
  CHRONIC_RULE_VERSION,
  getPublishedClinicalPath,
  getPublishedFollowUpTemplate,
} from './publishedCatalog';
import type {
  ChronicArtifactSnapshotRequest,
  ChronicDiseaseType,
  ChronicDiseaseWindowPayload,
  HealthPrescriptionDraft,
} from '../types';

interface CommonSnapshotInput {
  requestId: string;
  payload: ChronicDiseaseWindowPayload;
  doctorName: string;
  doctorNotes?: string;
}

interface HealthPrescriptionSnapshotInput extends CommonSnapshotInput {
  draft: HealthPrescriptionDraft;
}

interface AnnualAssessmentSnapshotInput extends CommonSnapshotInput {
  assessment: AnnualChronicAssessment;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getDiseaseTypes(payload: ChronicDiseaseWindowPayload): ChronicDiseaseType[] {
  return unique(payload.summary.diseaseTags.map((tag) => tag.diseaseType));
}

function buildCommonSnapshot(
  input: CommonSnapshotInput,
  artifactType: ChronicArtifactSnapshotRequest['artifactType'],
): Omit<
  ChronicArtifactSnapshotRequest,
  | 'assessmentYear'
  | 'summaryText'
  | 'systolicPressure'
  | 'diastolicPressure'
  | 'bloodGlucose'
  | 'bloodPressureRecordCount'
  | 'bloodGlucoseRecordCount'
  | 'acceptedItems'
> {
  const { payload } = input;
  const diseaseTypes = getDiseaseTypes(payload);

  return {
    requestId: input.requestId,
    artifactType,
    hisOrgId: payload.summary.organizationId,
    hisOrgName: payload.summary.organizationName,
    patientId: payload.summary.patientId,
    visitId: payload.summary.visitId,
    patientName: payload.summary.name,
    diseaseTypes,
    dataAsOf: payload.summary.latestDataAt || payload.openedAt,
    templateVersions: diseaseTypes.map((diseaseType) => (
      getPublishedFollowUpTemplate(diseaseType).templateVersion
    )),
    pathVersions: diseaseTypes.map((diseaseType) => (
      getPublishedClinicalPath(diseaseType).pathVersion
    )),
    evidenceVersions: unique(diseaseTypes.map((diseaseType) => (
      getPublishedClinicalPath(diseaseType).evidenceVersion
    ))),
    ruleVersion: CHRONIC_RULE_VERSION,
    doctorNotes: input.doctorNotes?.trim() || undefined,
    doctorId: payload.summary.doctorId,
    doctorName: input.doctorName.trim(),
  };
}

export function buildHealthPrescriptionSnapshotRequest(
  input: HealthPrescriptionSnapshotInput,
): ChronicArtifactSnapshotRequest {
  const pressurePoints = input.payload.summary.bloodPressurePoints;
  const glucosePoints = input.payload.summary.bloodGlucosePoints;
  const latestPressure = pressurePoints[pressurePoints.length - 1];
  const latestGlucose = glucosePoints[glucosePoints.length - 1];

  return {
    ...buildCommonSnapshot(input, 'health_prescription'),
    summaryText: input.draft.summary,
    systolicPressure: latestPressure?.systolic,
    diastolicPressure: latestPressure?.diastolic,
    bloodGlucose: latestGlucose?.value,
    bloodPressureRecordCount: input.payload.summary.bloodPressurePoints.length,
    bloodGlucoseRecordCount: input.payload.summary.bloodGlucosePoints.length,
    acceptedItems: input.draft.suggestions
      .filter((item) => item.accepted)
      .map((item) => ({
        itemId: item.id,
        category: item.category,
        title: item.title,
        detail: item.detail,
        reason: item.reason,
      })),
  };
}

export function buildAnnualAssessmentSnapshotRequest(
  input: AnnualAssessmentSnapshotInput,
): ChronicArtifactSnapshotRequest {
  return {
    ...buildCommonSnapshot(input, 'annual_assessment'),
    assessmentYear: input.assessment.year,
    summaryText: `${input.assessment.year} 年双慢病年度评估：血压记录 ${input.assessment.bloodPressurePoints.length} 条，血糖记录 ${input.assessment.bloodGlucosePoints.length} 条，用药事实 ${input.assessment.medicationFacts.length} 项。`,
    systolicPressure: input.assessment.latestPressure?.systolic,
    diastolicPressure: input.assessment.latestPressure?.diastolic,
    bloodGlucose: input.assessment.latestGlucose?.value,
    bloodPressureRecordCount: input.assessment.bloodPressurePoints.length,
    bloodGlucoseRecordCount: input.assessment.bloodGlucosePoints.length,
    acceptedItems: [],
  };
}
