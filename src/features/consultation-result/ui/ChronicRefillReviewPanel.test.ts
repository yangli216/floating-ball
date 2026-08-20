import { describe, expect, it } from 'vitest';
// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { readFileSync } from 'node:fs';

describe('ChronicRefillReviewPanel', () => {
  it('uses a compact non-blocking reference popover and keeps selections explicit', () => {
    const source = readFileSync(new URL('./ChronicRefillReviewPanel.vue', import.meta.url), 'utf8');
    expect(source).toContain('复诊参考');
    expect(source).toContain('可选 · 已处理');
    expect(source).toContain('item.recommendedValue === option.value && !selections[item.id]');
    expect(source).toContain("@click=\"emit('select', item.id, option)\"");
    expect(source).toContain('药品需由医生重新核查并选择');
    expect(source).toContain('refill-review-popover');
    expect(source).toContain('width: min(500px, 52vw)');
    expect(source).not.toContain('pendingCriticalCount');
    expect(source).not.toContain('refill-review-index');
    expect(source).not.toContain('refill-review-priority');
    expect(source).not.toContain('refill-review-footer');
    expect(source).toContain("@keydown.esc.stop=\"emit('toggle', false)\"");
    expect(source).toContain(':disabled="disabled"');
  });
});
