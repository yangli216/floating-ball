import { describe, expect, it } from 'vitest';
import {
  CHRONIC_REFILL_HISTORY_QUERY_LIMIT,
  buildChronicRefillHistoryQuery,
} from './chronicRefillHistoryWindow';

describe('buildChronicRefillHistoryQuery', () => {
  it('builds a full-day window that includes a prescription from exactly 90 days ago', () => {
    const query = buildChronicRefillHistoryQuery(new Date(2026, 7, 4, 15, 26, 30));

    expect(query).toEqual({
      limit: CHRONIC_REFILL_HISTORY_QUERY_LIMIT,
      dateRange: ['2026-05-06 00:00:00', '2026-08-04 23:59:59'],
    });
  });
});

