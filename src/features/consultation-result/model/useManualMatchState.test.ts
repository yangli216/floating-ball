import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';

describe('useManualMatchState', () => {
  it('opens a matched free item with a neutral search keyword so general alternatives remain visible', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    const { useManualMatchState } = await import('./useManualMatchState');
    const state = useManualMatchState();
    const item = {
      type: 'lab_test',
      name: '血常规（五分类）（免费）',
      reason: '',
      matchedItem: { id: 'free-item' },
    } as TreatmentRecommendation;

    expect(state.getManualMatchKeyword(item)).toBe('血常规（五分类）');
  });
});
