import { describe, expect, it } from 'vitest';
import {
  normalizeRiskPresentationItem,
  normalizeRiskPresentationItems,
  RISK_CAPSULE_CONTENT_MAX_LENGTH,
} from './riskPresentation';

describe('riskPresentation', () => {
  it('removes disease definitions and keeps the most useful chronic risk point', () => {
    expect(normalizeRiskPresentationItem({
      level: 2,
      category: 'chronic',
      content: '系统性红斑狼疮：自身免疫性疾病，需长期随访及免疫抑制治疗，注意感染及器官受累风险',
    }).content).toBe('系统性红斑狼疮：关注感染及器官受累');
  });

  it('merges equally important monitoring points into one concise chronic summary', () => {
    expect(normalizeRiskPresentationItem({
      level: 2,
      category: 'chronic',
      content: '2型糖尿病：慢性代谢性疾病，需持续血糖监测与管理，防范并发症',
    }).content).toBe('2型糖尿病：关注血糖控制及并发症');
  });

  it('keeps short items and caps legacy long items before they enter the capsule', () => {
    const items = normalizeRiskPresentationItems([
      { level: 1, category: 'allergy', content: '青霉素过敏' },
      {
        level: 3,
        category: 'other',
        content: '这是一条来自旧缓存或外部事件的过长风险描述文本，不应该在患者胶囊中完整展示',
      },
    ]);

    expect(items[0].content).toBe('青霉素过敏');
    expect(items[1].content.length).toBeLessThanOrEqual(RISK_CAPSULE_CONTENT_MAX_LENGTH);
  });
});
