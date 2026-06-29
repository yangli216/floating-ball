import { describe, expect, it } from 'vitest';
import { hasReportedApplyResult } from './reportedApplyResults';

describe('hasReportedApplyResult', () => {
  it('detects reported lab or exam apply items by sdApply=3', () => {
    expect(hasReportedApplyResult({
      applyList: [{
        items: [
          { naApply: '血常规', sdApply: '0' },
          { naApply: '胸部CT', sdApply: '3' },
        ],
      }],
    })).toBe(true);
  });

  it('does not treat ordered but unreported apply items as report follow-up evidence', () => {
    expect(hasReportedApplyResult({
      applyList: [{
        items: [
          { naApply: '血常规', sdApply: '0' },
        ],
      }],
      orderList: [{
        naOrd: '血常规（五分类）',
        sdOrd: '41',
      }],
    })).toBe(false);
  });

});
