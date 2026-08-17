import { describe, expect, it } from 'vitest';
import source from './MedicationPrescriptionHistoryReview.vue?raw';

describe('MedicationPrescriptionHistoryReview', () => {
  it('shows compact evidence, expandable details and cautious insurer guidance', () => {
    expect(source).toContain('近${props.history.lookbackDays}天开药');
    expect(source).toContain('同单位累计');
    expect(source).toContain('本次拟开');
    expect(source).toContain('历史总量单位不一致，未自动累计');
    expect(source).toContain('医保周期和限量以院内实时规则为准');
    expect(source).toContain('@click="expanded = !expanded"');
  });
});
