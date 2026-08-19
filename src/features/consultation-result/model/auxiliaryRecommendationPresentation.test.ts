import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  buildAuxiliaryRecommendationGroups,
  getAuxiliaryNecessityLabel,
  getAuxiliaryRecommendationPurpose,
} from './auxiliaryRecommendationPresentation';

function createItem(overrides: Partial<TreatmentRecommendation> = {}): TreatmentRecommendation {
  return {
    type: 'lab_test',
    name: '血常规',
    reason: '结合发热和咳嗽表现，评估感染情况',
    selected: false,
    ...overrides,
  };
}

describe('auxiliaryRecommendationPresentation', () => {
  it('shows an explicit goal before falling back to a concise reason', () => {
    expect(getAuxiliaryRecommendationPurpose(createItem({ goal: '评估感染及血细胞变化' })))
      .toBe('评估感染及血细胞变化');
    expect(getAuxiliaryRecommendationPurpose(createItem({ goal: '', reason: '开立依据：排查肺部感染；用于鉴别诊断' })))
      .toBe('排查肺部感染');
  });

  it('groups auxiliary items by clinical goal and places core items first', () => {
    const supplementary = createItem({
      name: '降钙素原',
      goalGroup: '感染与炎症评估',
      goalGroupPurpose: '判断感染证据并评估炎症程度',
      necessity: 'supplementary',
    });
    const core = createItem({
      name: 'C反应蛋白',
      goalGroup: '感染与炎症评估',
      necessity: 'core',
    });

    const groups = buildAuxiliaryRecommendationGroups('lab_test', [supplementary, core]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      title: '感染与炎症评估',
      purpose: '判断感染证据并评估炎症程度',
      showHeader: true,
    });
    expect(groups[0].items.map((item) => item.name)).toEqual(['C反应蛋白', '降钙素原']);
    expect(getAuxiliaryNecessityLabel(core)).toBe('优先');
    expect(getAuxiliaryNecessityLabel(supplementary)).toBe('可选');
  });

  it('does not add goal headers to medicine sections', () => {
    const medicine = createItem({ type: 'medicine', name: '阿莫西林胶囊' });
    expect(buildAuxiliaryRecommendationGroups('medicine', [medicine]))
      .toEqual([{ key: 'all', title: '', purpose: '', showHeader: false, items: [medicine] }]);
  });
});
