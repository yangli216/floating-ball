import { describe, expect, it } from 'vitest';
import {
  findInvalidOutpatientEmrDictionaryValue,
  resolveOutpatientEmrBaselineDictionaryItem,
  resolveOutpatientEmrDictionaryItem,
  validateOutpatientEmrDictionaryItems,
} from './outpatientEmrDictionary';

const items = [
  { value: '0', text: '否认' },
  { value: '1', text: '有' },
];

describe('outpatient EMR dictionary resolution', () => {
  it('resolves either the template VALUE code or TEXT to the same canonical item', () => {
    expect(resolveOutpatientEmrDictionaryItem(items, '1')).toEqual({ value: '1', text: '有' });
    expect(resolveOutpatientEmrDictionaryItem(items, '有')).toEqual({ value: '1', text: '有' });
    expect(resolveOutpatientEmrDictionaryItem(items, '模型自造值')).toBeNull();
  });

  it('rejects definitions whose codes and texts cannot be matched uniquely', () => {
    expect(validateOutpatientEmrDictionaryItems([
      { value: '1', text: '有' },
      { value: '2', text: '有' },
    ])).toContain('无法唯一匹配');
    expect(validateOutpatientEmrDictionaryItems([
      { value: '有', text: '否认' },
      { value: '1', text: '有' },
    ])).toContain('无法唯一匹配');
  });

  it('accepts the current selection only when VALUE and TEXT identify the same item', () => {
    expect(resolveOutpatientEmrBaselineDictionaryItem({
      dictionaryItems: items,
      baselineDictionaryValue: '0',
      baselineValue: '否认',
    })).toEqual({ value: '0', text: '否认' });
    expect(resolveOutpatientEmrBaselineDictionaryItem({
      dictionaryItems: items,
      baselineDictionaryValue: '0',
      baselineValue: '有',
    })).toBeNull();
  });

  it('reports a missing or invalid final selection for every returned dictionary field', () => {
    const fields = [{
      id: '肝炎史标志',
      name: '肝炎史标志',
      dictionaryItems: items,
    }];
    expect(findInvalidOutpatientEmrDictionaryValue(fields, {})).toEqual({
      fieldId: '肝炎史标志',
      fieldName: '肝炎史标志',
      value: '',
    });
    expect(findInvalidOutpatientEmrDictionaryValue(fields, {
      肝炎史标志: '有',
    })).toBeNull();
  });
});
