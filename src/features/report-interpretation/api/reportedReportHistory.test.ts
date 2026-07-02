import { describe, expect, it } from 'vitest';
import {
  buildStructuredLabAbnormalItems,
  resolveLabItemDirection,
  serializeExamReport,
  serializeLabReport,
} from './reportedReportHistory';

describe('reported report serialization', () => {
  it('preserves lab values, units, ranges and abnormal flags', () => {
    const text = serializeLabReport({
      reportName: '血常规',
      reportTime: '2026-06-30 09:30:00',
      items: [{
        itemName: '白细胞计数',
        result: '12.8',
        unit: '10^9/L',
        referenceRange: '3.5-9.5',
        abnormalFlag: 'H',
      }],
    });

    expect(text).toContain('白细胞计数：12.8 10^9/L');
    expect(text).toContain('参考范围：3.5-9.5');
    expect(text).toContain('异常标记：H');
  });

  it('preserves imaging findings and conclusions', () => {
    const text = serializeExamReport({
      examName: '胸部CT',
      finding: '右下肺见片状高密度影。',
      conclusion: '考虑感染性病变。',
    });

    expect(text).toContain('检查所见：右下肺见片状高密度影。');
    expect(text).toContain('检查结论：考虑感染性病变。');
  });

  it('does not promote a normal item into the abnormal list', () => {
    const items = buildStructuredLabAbnormalItems([{
      itemName: 'C-反应蛋白',
      result: '5',
      unit: 'mg/L',
      referenceLow: '0',
      referenceHigh: '10',
      referenceRange: '0-10',
      abnormalFlag: 'N',
    }]);

    expect(items).toEqual([]);
  });

  it('preserves direction and range for a structured abnormal item', () => {
    const items = buildStructuredLabAbnormalItems([{
      itemName: '白细胞计数',
      result: '12.8',
      unit: '10^9/L',
      referenceLow: '3.5',
      referenceHigh: '9.5',
      abnormalFlag: 'H',
    }]);

    expect(items).toEqual([expect.objectContaining({
      name: '白细胞计数',
      result: '12.8 10^9/L',
      direction: 'up',
      referenceRange: '3.5-9.5',
    })]);
  });

  it('falls back to numeric limits when the old HIS response has no direction', () => {
    expect(resolveLabItemDirection({
      result: '2.1',
      referenceLow: '3.5',
      referenceHigh: '9.5',
    })).toBe('down');

    expect(resolveLabItemDirection({
      result: '12.8',
      referenceRange: '3.5-9.5',
    })).toBe('up');
  });

  it('corrects a conflicting normal marker when the qualitative result is positive', () => {
    const item = {
      itemName: '尿糖',
      result: '阳性',
      referenceRange: '阴性',
      abnormal: false,
      direction: 'normal' as const,
    };

    expect(resolveLabItemDirection(item)).toBe('positive');
    expect(buildStructuredLabAbnormalItems([item])).toEqual([
      expect.objectContaining({
        name: '尿糖',
        result: '阳性',
        direction: 'positive',
      }),
    ]);
  });

  it('keeps a qualitative negative result normal', () => {
    expect(resolveLabItemDirection({
      result: '阴性',
      referenceRange: '阴性',
      abnormal: false,
      direction: 'normal',
    })).toBe('normal');
  });
});
