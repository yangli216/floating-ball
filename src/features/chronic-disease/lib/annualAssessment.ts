import type {
  BloodGlucosePoint,
  BloodPressurePoint,
  ChronicDiseasePatientSummary,
  ChronicMedicationFact,
} from '../types';

export interface AnnualChronicAssessment {
  year: number;
  bloodPressurePoints: BloodPressurePoint[];
  bloodGlucosePoints: BloodGlucosePoint[];
  medicationFacts: ChronicMedicationFact[];
  latestPressure?: BloodPressurePoint;
  latestGlucose?: BloodGlucosePoint;
  latestDataAt?: string;
}

function isInYear(timestamp: string | undefined, year: number): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === year;
}

function latestTimestamp(timestamps: Array<string | undefined>): string | undefined {
  const sorted = timestamps
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return sorted[sorted.length - 1];
}

export function buildAnnualChronicAssessment(
  summary: ChronicDiseasePatientSummary,
  year: number,
): AnnualChronicAssessment {
  const bloodPressurePoints = summary.bloodPressurePoints.filter((point) => (
    isInYear(point.measuredAt, year)
  ));
  const bloodGlucosePoints = summary.bloodGlucosePoints.filter((point) => (
    isInYear(point.measuredAt, year)
  ));
  const medicationFacts = summary.recentMedicationFacts.filter((fact) => (
    isInYear(fact.observedAt, year)
  ));

  return {
    year,
    bloodPressurePoints,
    bloodGlucosePoints,
    medicationFacts,
    latestPressure: bloodPressurePoints[bloodPressurePoints.length - 1],
    latestGlucose: bloodGlucosePoints[bloodGlucosePoints.length - 1],
    latestDataAt: latestTimestamp([
      ...bloodPressurePoints.map((point) => point.measuredAt),
      ...bloodGlucosePoints.map((point) => point.measuredAt),
      ...medicationFacts.map((fact) => fact.observedAt),
    ]),
  };
}
