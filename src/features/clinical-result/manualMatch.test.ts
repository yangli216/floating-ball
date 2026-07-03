import { describe, expect, it, vi } from 'vitest';
import type { MedicalItem, MedicineItem } from '../../services/medicalData';
import { toManualMatchCandidateView } from './manualMatch';

vi.mock('../../services/medicalData', () => ({
  medicalDataService: {},
}));

describe('toManualMatchCandidateView', () => {
  it('keeps medicine specs in candidate meta', () => {
    const candidate = {
      id: 'med-1',
      name: '阿莫西林胶囊',
      spec: '0.25g*24粒/盒',
    } satisfies MedicineItem;

    expect(toManualMatchCandidateView(candidate)).toEqual({
      id: 'med-1',
      name: '阿莫西林胶囊',
      meta: '0.25g*24粒/盒',
    });
  });

  it('does not expose internal codes for exam/lab/procedure candidates', () => {
    const candidate = {
      id: '1001A110000000000LONG',
      code: '1001A110000000000LONG',
      name: 'CT',
      category: '检查',
    } satisfies MedicalItem;

    const view = toManualMatchCandidateView(candidate);

    expect(view).toEqual({
      id: '1001A110000000000LONG',
      name: 'CT',
    });
    expect(view.meta).toBeUndefined();
  });
});
