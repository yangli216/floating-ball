import type { AppPatient } from '@/types/appState';
import type { HisPatientHistory, HisVisitRecord } from '@/services/his/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function hasReportedApplyResult(detail: unknown): boolean {
  console.log('[reportedApplyResults] checking hasReportedApplyResult with detail:', detail);
  if (!isRecord(detail)) {
    console.log('[reportedApplyResults] detail is not a record/object');
    return false;
  }
  if (!Array.isArray(detail.applyList)) {
    console.log('[reportedApplyResults] detail.applyList is not an array, keys in detail:', Object.keys(detail));
    return false;
  }

  console.log('[reportedApplyResults] applyList length:', detail.applyList.length);
  const matched = detail.applyList.some((apply, idx) => {
    if (!isRecord(apply) || !Array.isArray(apply.items)) {
      console.log(`[reportedApplyResults] applyList[${idx}] items is not an array`);
      return false;
    }
    return apply.items.some((item, itemIdx) => {
      const sdApply = String(item.sdApply || '').trim();
      const match = sdApply === '3';
      console.log(`[reportedApplyResults] applyList[${idx}].items[${itemIdx}] - naApply: ${item.naApply}, sdApply: ${item.sdApply}, trimmed: "${sdApply}", match: ${match}`);
      return match;
    });
  });
  console.log('[reportedApplyResults] final hasReportedApplyResult decision:', matched);
  return matched;
}

export function hasPatientReportedLabOrExamResults(patient: AppPatient | null): boolean {
  return Boolean(patient?.hasReportedLabOrExamResults);
}

export function getRecentReportedVisits(
  history: HisPatientHistory | null | undefined,
  now = new Date(),
): HisVisitRecord[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return (history?.visits || [])
    .filter((visit) => Boolean(
      visit.visitId
      && visit.visitTime >= start.getTime()
      && visit.visitTime <= end.getTime()
      && visit.reportedApplications?.length,
    ))
    .sort((left, right) => right.visitTime - left.visitTime);
}
