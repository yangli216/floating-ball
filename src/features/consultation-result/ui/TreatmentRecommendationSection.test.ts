import { describe, expect, it } from 'vitest';
import source from './TreatmentRecommendationSection.vue?raw';

describe('TreatmentRecommendationSection match adjustment', () => {
  it('keeps the directory picker available after an item has matched', () => {
    expect(source).toContain(':show-manual-match-button="true"');
    expect(source).toContain('item.manualMatched ? \'已更换\'');
    expect(source).toContain('v-if="isManualMatchOpen(item)"');
  });
});
