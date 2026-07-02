import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import { useTreatmentEditorState } from './useTreatmentEditorState';

function createTreatment(name: string): TreatmentRecommendation {
  return {
    type: 'medicine',
    name,
    reason: '测试',
    dosage: '1',
  };
}

describe('useTreatmentEditorState', () => {
  it('keeps only one editor expanded without clearing edited values', () => {
    const resetDependents = vi.fn();
    const state = useTreatmentEditorState({
      getEditorKey: (rec) => rec.name,
      getFieldKey: (rec, field) => `${rec.name}:${field}`,
      resetDependents,
    });
    const first = createTreatment('药品 A');
    const second = createTreatment('药品 B');

    state.expandTreatmentEditor(first);
    state.setActiveEditableField(first, 'dosage');
    first.dosage = '2';
    state.expandTreatmentEditor(second);

    expect(state.isTreatmentEditorExpanded(first)).toBe(false);
    expect(state.isTreatmentEditorExpanded(second)).toBe(true);
    expect(state.expandedTreatmentEditors.value).toEqual(new Set(['药品 B']));
    expect(state.activeEditableFieldKey.value).toBeNull();
    expect(first.dosage).toBe('2');
    expect(resetDependents).toHaveBeenCalledTimes(2);
  });

  it('uses the same explicit action to open and close an editor', () => {
    const state = useTreatmentEditorState({
      getEditorKey: (rec) => rec.name,
      getFieldKey: (rec, field) => `${rec.name}:${field}`,
    });
    const treatment = createTreatment('药品 A');

    state.toggleTreatmentEditor(treatment);
    expect(state.isTreatmentEditorExpanded(treatment)).toBe(true);

    state.toggleTreatmentEditor(treatment);
    expect(state.isTreatmentEditorExpanded(treatment)).toBe(false);
  });
});
