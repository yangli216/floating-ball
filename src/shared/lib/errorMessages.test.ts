import { describe, expect, it } from 'vitest';
import { formatUserFacingError } from './errorMessages';

describe('formatUserFacingError', () => {
  it('does not expose raw JavaScript runtime errors to clinical UI', () => {
    expect(formatUserFacingError(new TypeError('(intermediate value) is not iterable'), {
      context: '诊断鉴别生成失败',
      fallback: '请稍后重试。',
    })).toBe('诊断鉴别生成失败：请稍后重试。');
  });
});
