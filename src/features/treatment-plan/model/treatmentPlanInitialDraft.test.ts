import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { mapTreatmentPlanInitialDraftItems } from './treatmentPlanInitialDraft';

const normalize = (
  recommendation: Partial<TreatmentRecommendation>,
): TreatmentRecommendation => recommendation as TreatmentRecommendation;

describe('mapTreatmentPlanInitialDraftItems', () => {
  it('preserves a confirmed HIS catalog item without rematching it by display name', () => {
    const assessCatalogMatch = vi.fn();
    const [result] = mapTreatmentPlanInitialDraftItems({
      items: [{
        sourceId: 'lab-1',
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        reason: '评估近期血糖控制',
        matchedItem: {
          id: 'lab-1',
          code: 'LAB001',
          name: '糖化血红蛋白测定',
          idSrv: 'SRV-LAB',
          raw: { idCli: 'CLI-LAB' },
        },
        matchStatus: 'exact',
      }],
      assessCatalogMatch,
      normalize,
    });

    expect(assessCatalogMatch).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      selected: true,
      matchStatus: 'exact',
      matchedItem: expect.objectContaining({
        idSrv: 'SRV-LAB',
        raw: { idCli: 'CLI-LAB' },
      }),
    }));
  });

  it('keeps the legacy name-matching fallback for older drafts', () => {
    const assessCatalogMatch = vi.fn(() => ({
      matchedItem: {
        id: 'exam-1',
        code: 'EX001',
        name: '眼底照相',
      },
      suggestedMatchItem: undefined,
      matchStatus: 'exact' as const,
    }));
    const [result] = mapTreatmentPlanInitialDraftItems({
      items: [{
        sourceId: 'legacy-exam',
        type: 'exam',
        name: '眼底检查',
        reason: '筛查视网膜病变',
      }],
      assessCatalogMatch,
      normalize,
    });

    expect(assessCatalogMatch).toHaveBeenCalledWith('exam', '眼底检查');
    expect(result.selected).toBe(true);
    expect(result.matchedItem?.name).toBe('眼底照相');
  });
});
