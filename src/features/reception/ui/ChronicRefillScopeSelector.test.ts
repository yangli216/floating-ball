import { describe, expect, it } from 'vitest';
// @ts-expect-error Node built-ins are provided by Vitest but @types/node is not a direct project dependency.
import { readFileSync } from 'node:fs';

describe('ChronicRefillScopeSelector', () => {
  it('uses diagnosis selection as confirmation and keeps medicine attribution silent', () => {
    const source = readFileSync(new URL('./ChronicRefillScopeSelector.vue', import.meta.url), 'utf8');
    expect(source).toContain(':disabled="selectedConditionIds.length === 0"');
    expect(source).toContain("props.candidate.medicationAttributionStatus === 'loading'");
    expect(source).toContain('submitQueued.value = true');
    expect(source).toContain('watch(medicationAttributionPending');
    expect(source).toContain("emit('submit', {");
    expect(source).toContain('conditionIds: [...selectedConditionIds.value]');
    expect(source).not.toContain('AI 自动识别历史用药');
    expect(source).not.toContain('正在根据所选诊断识别历史用药');
    expect(source).not.toContain('已匹配 {{');
    expect(source).not.toContain('识别暂不可用');
    expect(source).not.toContain('未找到可可靠归入所选诊断');
    expect(source).not.toContain('rcs-attribution');
    expect(source).not.toContain('confirmedMedicationAttributionIds');
    expect(source).not.toContain('toggleMedicationAttribution');
    expect(source).not.toContain('rcs-attribution-item');
    expect(source).not.toContain("from '@/services/llm'");
    expect(source).not.toContain('chatFast(');
  });
});
