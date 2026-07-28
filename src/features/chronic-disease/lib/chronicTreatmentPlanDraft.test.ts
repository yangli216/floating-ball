import { describe, expect, it } from 'vitest';
import type { ChronicAiRecommendation } from '../types';
import {
  mergeChronicVisCliLoadedItems,
} from './chronicTreatmentPlanDraft';

function buildRecommendation(input: {
  id: string;
  name: string;
  idSrv: string;
}): ChronicAiRecommendation {
  return {
    id: input.id,
    type: 'lab_test',
    name: input.name,
    reason: '测试推荐',
    matchedItem: {
      id: input.id,
      name: input.name,
      idSrv: input.idSrv,
    },
  };
}

describe('chronicTreatmentPlanDraft HIS mapping', () => {
  it('enriches mapped recommendations and preserves current catalog items without extra mappings', () => {
    const mapped = buildRecommendation({
      id: 'lab-1',
      name: '糖化血红蛋白测定',
      idSrv: 'SRV-LAB',
    });
    const localOnly = buildRecommendation({
      id: 'lab-static',
      name: '血浆凝血因子XIII活性测定',
      idSrv: 'STATIC-28350',
    });

    const result = mergeChronicVisCliLoadedItems(
      [mapped, localOnly],
      [{
        idSrv: 'SRV-LAB',
        idCli: 'CLI-LAB',
        naApply: '糖化血红蛋白',
        idDeptExec: 'DEPT-LAB',
        priceSale: 31,
      }],
    );

    expect(result).toEqual([
      expect.objectContaining({
        name: '糖化血红蛋白',
        matchedItem: expect.objectContaining({
          id: 'CLI-LAB',
          idSrv: 'SRV-LAB',
          idCli: 'CLI-LAB',
          idDeptExec: 'DEPT-LAB',
          priceSale: 31,
        }),
      }),
      localOnly,
    ]);
  });

  it('keeps a selected current catalog item when loadVis returns no mapping', () => {
    const localOnly = buildRecommendation({
      id: 'lab-static',
      name: '血浆凝血因子XIII活性测定',
      idSrv: 'STATIC-28350',
    });

    expect(mergeChronicVisCliLoadedItems([localOnly], []))
      .toEqual([localOnly]);
  });

  it('merges useful loadVis fields without inventing a missing idCli', () => {
    const mapped = buildRecommendation({
      id: 'lab-1',
      name: '糖化血红蛋白测定',
      idSrv: 'SRV-LAB',
    });
    const loadedWithoutIdCli = [{
      idSrv: 'SRV-LAB',
      naApply: '糖化血红蛋白测定',
    }];

    expect(mergeChronicVisCliLoadedItems(
      [mapped],
      loadedWithoutIdCli,
    )).toEqual([
      expect.objectContaining({
        matchedItem: expect.objectContaining({
          id: 'lab-1',
          idSrv: 'SRV-LAB',
        }),
      }),
    ]);
    const [result] = mergeChronicVisCliLoadedItems([mapped], loadedWithoutIdCli);
    expect(result.matchedItem).not.toHaveProperty('idCli');
  });
});
