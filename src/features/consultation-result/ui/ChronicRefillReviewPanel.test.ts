import { describe, expect, it } from 'vitest';
// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { readFileSync } from 'node:fs';

describe('ChronicRefillReviewPanel', () => {
  it('keeps recommendations unselected and explains that clicks create confirmed facts', () => {
    const source = readFileSync(new URL('./ChronicRefillReviewPanel.vue', import.meta.url), 'utf8');
    expect(source).toContain('点击选项后才会作为医生确认事实写入现病史');
    expect(source).toContain('item.recommendedValue === option.value && !selections[item.id]');
    expect(source).toContain("@click=\"emit('select', item.id, option)\"");
    expect(source).toContain('药品需由医生重新核查并选择');
    expect(source).toContain('refill-review-popover');
    expect(source).toContain("@keydown.esc.stop=\"emit('toggle', false)\"");
    expect(source).toContain(':disabled="disabled"');
  });
});
