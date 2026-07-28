import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getMatchedMedicalItemClientId,
  getMatchedOrderServiceId,
} from './recordConfirmedPayload';

function buildLabRecommendation(
  matchedItem: NonNullable<TreatmentRecommendation['matchedItem']>,
): TreatmentRecommendation {
  return {
    type: 'lab_test',
    name: matchedItem.name || '糖化血红蛋白测定',
    reason: '评估近期血糖控制',
    selected: true,
    matchedItem,
  };
}

describe('recordConfirmedPayload medical item IDs', () => {
  it('uses the current HIS catalog idSrv for writeback when optional idCli enrichment is absent', () => {
    const recommendation = buildLabRecommendation({
      id: 'catalog-row-1',
      code: 'CATALOG-CODE',
      idSrv: 'HIS-SRV-1',
      name: '糖化血红蛋白测定',
    });

    expect(getMatchedOrderServiceId(recommendation)).toBe('HIS-SRV-1');
    expect(getMatchedMedicalItemClientId(recommendation)).toBe('CATALOG-CODE');
  });

  it('prefers the PHIS idCli enrichment when loadVis returned one', () => {
    const recommendation = buildLabRecommendation({
      id: 'catalog-row-1',
      code: 'CATALOG-CODE',
      idSrv: 'HIS-SRV-1',
      idCli: 'PHIS-CLI-1',
      name: '糖化血红蛋白测定',
      raw: {
        idSrv: 'HIS-SRV-1',
        idCli: 'PHIS-CLI-1',
      },
    });

    expect(getMatchedOrderServiceId(recommendation)).toBe('PHIS-CLI-1');
    expect(getMatchedMedicalItemClientId(recommendation)).toBe('PHIS-CLI-1');
  });
});
