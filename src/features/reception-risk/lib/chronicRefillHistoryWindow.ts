import type { HisPatientHistoryQuery } from '@/services/his/types';

export const CHRONIC_REFILL_HISTORY_LOOKBACK_DAYS = 90;
export const CHRONIC_REFILL_HISTORY_QUERY_LIMIT = 1000;

function formatLocalDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return [
    value.getFullYear(),
    '-',
    pad(value.getMonth() + 1),
    '-',
    pad(value.getDate()),
    ' ',
    pad(value.getHours()),
    ':',
    pad(value.getMinutes()),
    ':',
    pad(value.getSeconds()),
  ].join('');
}

/**
 * 复诊配药历史窗口：覆盖当前自然日，并向前包含恰好 90 天前的处方记录。
 * `limit` 仅作为 PHIS 查询的防御性技术上限，不能作为业务截断口径。
 */
export function buildChronicRefillHistoryQuery(
  referenceDate: Date = new Date(),
): Required<Pick<HisPatientHistoryQuery, 'dateRange' | 'limit'>> {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - CHRONIC_REFILL_HISTORY_LOOKBACK_DAYS);

  return {
    limit: CHRONIC_REFILL_HISTORY_QUERY_LIMIT,
    dateRange: [formatLocalDateTime(start), formatLocalDateTime(end)],
  };
}

