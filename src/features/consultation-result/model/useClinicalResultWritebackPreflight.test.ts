import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { useClinicalResultWritebackPreflight } from './useClinicalResultWritebackPreflight';

function createPreflight() {
  const notify = vi.fn();
  const diagnoses = ref<Diagnosis[]>([{
    name: '未匹配诊断',
    code: '',
    rate: '80%',
    rationale: '测试',
  }]);
  const treatments = ref<TreatmentRecommendation[]>([]);
  const preflight = useClinicalResultWritebackPreflight({
    selectedDiagnoses: diagnoses,
    treatments,
    ensureMedicineSelectable: vi.fn(async () => true),
    checkMedicineInventoryEnough: vi.fn(async () => true),
    hydrateMedicalItemDetail: vi.fn(async () => undefined),
    hasRequiredPharmacy: vi.fn(() => true),
    hasRequiredExecDept: vi.fn(() => true),
    hasRequiredBodySite: vi.fn(() => true),
    openPharmacySelector: vi.fn(),
    openExecDeptSelector: vi.fn(),
    openBodySiteSelector: vi.fn(),
    notify,
  });
  return { preflight, notify };
}

describe('useClinicalResultWritebackPreflight partial scope', () => {
  it('does not validate diagnosis when diagnosis is outside the writeback scope', async () => {
    const { preflight, notify } = createPreflight();

    const result = await preflight.run({ includeDiagnosis: false, treatments: [] });

    expect(result).toEqual({ ready: true, selected: [] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps the standard diagnosis gate when diagnosis is selected', async () => {
    const { preflight, notify } = createPreflight();

    const result = await preflight.run({ includeDiagnosis: true, treatments: [] });

    expect(result.ready).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      '未匹配诊断 未匹配标准诊断库，请先切换为标准诊断后再回写',
      'warning',
    );
  });
});
