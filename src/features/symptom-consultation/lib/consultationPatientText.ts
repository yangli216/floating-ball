export type PatientTextSource = Record<string, unknown> | null | undefined;

export function readPatientText(
  source: PatientTextSource,
  keys: string[],
): string {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return '';
}

export function filterVisitSummaryText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^既往门诊记录[：:]/.test(value.trim())) return undefined;
  return value;
}

export function resolvePastMedicalHistoryFromSources(input: {
  record?: PatientTextSource;
  patient?: PatientTextSource;
  fallback?: string;
}): string {
  const fromRecord = readPatientText(input.record, ['pastMedicalHistory']);
  const fromPatient = readPatientText(input.patient, [
    'pastMedicalHistory',
    'past_medical_history',
    'pastMedicalHistoryText',
  ]);

  return (
    filterVisitSummaryText(fromRecord)
    || filterVisitSummaryText(fromPatient)
    || input.fallback
    || '未提供既往病史。'
  );
}
