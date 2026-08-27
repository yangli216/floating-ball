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

  it('keeps real long evidence visible instead of dropping the purpose line', () => {
    const inferredPurpose = getAuxiliaryRecommendationPurpose(createItem({
      goal: '',
      reason: '开立依据：用于评估患者当前感染证据并结合病情判断是否需要进一步处置和动态复查。',
    }));
    const explicitPurpose = getAuxiliaryRecommendationPurpose(createItem({
      sourceType: 'explicit',
      goal: '',
      evidenceText: '医生在本次对话中明确提出复查血常规并关注白细胞变化',
      reason: '这是一段较长的自动生成推荐依据，不应覆盖更直接的对话证据',
    }));

    expect(inferredPurpose).toMatch(/^用于评估患者当前感染证据/u);
    expect(inferredPurpose.endsWith('…')).toBe(true);
    expect(explicitPurpose).toBe('对话明确：医生在本次对话中明确提出复查血常规并关注白细胞变化');
  });

  it('does not invent clinical purposes or goal groups when metadata is absent', () => {
    const item = createItem({ reason: '' });

    expect(getAuxiliaryRecommendationPurpose(item)).toBe('');
    expect(buildAuxiliaryRecommendationGroups('lab_test', [item])).toEqual([{
      key: 'ungrouped:lab_test',
      title: '',
      purpose: '',
      showHeader: false,
      items: [item],
    }]);
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

  it('separates explicit items by current live-catalog match state', () => {
    const matched = createItem({
      sourceType: 'explicit',
      matchedItem: { id: 'lab-1', name: '血常规' },
      matchStatus: 'exact',
    });
    const unmatched = createItem({
      name: '特殊感染筛查',
      sourceType: 'explicit',
      matchedItem: undefined,
      matchStatus: 'unmatched',
    });

    const groups = buildAuxiliaryRecommendationGroups('lab_test', [matched, unmatched]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: 'explicit:lab_test:matched',
      title: '对话明确项目',
      purpose: '本次问诊中已明确提出，已匹配当前可用目录',
      showHeader: true,
      items: [matched],
    });
    expect(groups[1]).toMatchObject({
      key: 'explicit:lab_test:unmatched',
      title: '对话明确项目（待匹配）',
      showHeader: true,
      items: [unmatched],
    });
  });

  it('shows context-completed explicit orders in a source-aware clinical goal group', () => {
    const item = createItem({
      type: 'exam',
      name: '肝胆胰脾肾彩超',
      originalName: 'B超',
      sourceType: 'explicit',
      matchedItem: { id: 'exam-1', name: '肝胆胰脾肾彩超' },
      matchStatus: 'exact',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
    });

    expect(buildAuxiliaryRecommendationGroups('exam', [item])).toEqual([{
      key: 'explicit:exam:matched:腹部影像评估',
      title: '对话明确 · 腹部影像评估',
      purpose: '结合上腹部症状定位腹部病变线索',
      showHeader: true,
      items: [item],
    }]);
    expect(getAuxiliaryRecommendationPurpose(item)).toBe('评估上腹部不适相关脏器情况');
  });

  it('does not add goal headers to medicine sections', () => {
    const medicine = createItem({ type: 'medicine', name: '阿莫西林胶囊' });
    expect(buildAuxiliaryRecommendationGroups('medicine', [medicine]))
      .toEqual([{ key: 'all', title: '', purpose: '', showHeader: false, items: [medicine] }]);
  });
});
