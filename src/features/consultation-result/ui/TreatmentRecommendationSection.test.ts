import { describe, expect, it } from 'vitest';
import source from './TreatmentRecommendationSection.vue?raw';

describe('TreatmentRecommendationSection match adjustment', () => {
  it('allows matched auxiliary items to change while limiting medicines to initial catalog alignment', () => {
    expect(source).toContain("item.type !== 'medicine' || !item.matchedItem");
    expect(source).toContain("if (item.type === 'medicine') return '匹配院内药品'");
    expect(source).toContain('仅用于将 AI 药名对齐到院内库存');
    expect(source).toContain(':show-reject-button="item.type === \'medicine\' && item.sourceType !== \'explicit\'"');
    expect(source).toContain('@toggle-rejected="emit(\'toggleRejected\', item, $event)"');
  });

  it('shows recent prescription review only while it still matches the current medicine', () => {
    expect(source).toContain('shouldShowPrescriptionHistory(item)');
    expect(source).toContain('history.matchedProductId === currentProductId');
    expect(source).toContain('<MedicationPrescriptionHistoryReview');
  });
});
