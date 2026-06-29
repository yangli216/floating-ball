import type { AppPatient } from '@/types/appState';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function hasReportedApplyResult(detail: unknown): boolean {
  if (!isRecord(detail) || !Array.isArray(detail.applyList)) {
    return false;
  }

  return detail.applyList.some((apply) => {
    if (!isRecord(apply) || !Array.isArray(apply.items)) {
      return false;
    }
    return apply.items.some((item) => (
      isRecord(item) && String(item.sdApply || '').trim() === '3'
    ));
  });
}

export function hasPatientReportedLabOrExamResults(patient: AppPatient | null): boolean {
  return Boolean(patient?.hasReportedLabOrExamResults);
}
