import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInpatientEmrTrace } from './inpatientEmrObservability';

describe('inpatient EMR trace creation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    'inpatient-emr-1723370400000',
    '123e4567-e89b-42d3-a456-426614174000',
  ])('preserves a safe technical trace seed: %s', (seed) => {
    expect(createInpatientEmrTrace(seed).traceId).toBe(seed);
  });

  it.each([
    ['patient-like id', '1234567890123456'],
    ['URL-shaped value', 'https://his.example/path?patient=123456'],
    ['free text', 'inpatient-emr-patient-ZhangSan'],
  ])('replaces an unsafe trace seed once: %s', (_label, seed) => {
    vi.spyOn(Date, 'now').mockReturnValue(1723370400000);

    const trace = createInpatientEmrTrace(seed);

    expect(trace.traceId).toBe('inpatient-emr-1723370400000');
    expect(trace.traceId).not.toContain(seed);
    expect(trace.startedAt).toBe(1723370400000);
  });
});
