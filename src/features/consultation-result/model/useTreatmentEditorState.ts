import { nextTick, ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';

interface Options {
  getEditorKey: (rec: TreatmentRecommendation) => string;
  getFieldKey: (rec: TreatmentRecommendation, field: string) => string;
  resetDependents?: () => void;
}

export function useTreatmentEditorState(options: Options) {
  const expandedTreatmentEditors = ref<Set<string>>(new Set());
  const activeEditableFieldKey = ref<string | null>(null);
  const editableFieldElements = new Map<string, HTMLInputElement | HTMLSelectElement>();

  function resetTreatmentEditorState(): void {
    expandedTreatmentEditors.value = new Set();
    activeEditableFieldKey.value = null;
    options.resetDependents?.();
  }

  function isTreatmentEditorExpanded(rec: TreatmentRecommendation): boolean {
    return expandedTreatmentEditors.value.has(options.getEditorKey(rec));
  }

  function toggleTreatmentEditor(rec: TreatmentRecommendation, event?: Event): void {
    event?.stopPropagation();
    const key = options.getEditorKey(rec);
    const nextEditors = new Set(expandedTreatmentEditors.value);
    if (nextEditors.has(key)) {
      nextEditors.delete(key);
    } else {
      nextEditors.add(key);
    }
    expandedTreatmentEditors.value = nextEditors;
  }

  function expandTreatmentEditor(rec: TreatmentRecommendation): void {
    const key = options.getEditorKey(rec);
    if (expandedTreatmentEditors.value.has(key)) {
      return;
    }
    expandedTreatmentEditors.value = new Set([...expandedTreatmentEditors.value, key]);
  }

  function collapseTreatmentEditor(rec: TreatmentRecommendation): void {
    const editorKey = options.getEditorKey(rec);
    if (!expandedTreatmentEditors.value.has(editorKey)) {
      return;
    }
    const nextEditors = new Set(expandedTreatmentEditors.value);
    nextEditors.delete(editorKey);
    expandedTreatmentEditors.value = nextEditors;
    if (activeEditableFieldKey.value?.startsWith(`${editorKey}:`)) {
      activeEditableFieldKey.value = null;
    }
  }

  function shouldShowTreatmentEditor(rec: TreatmentRecommendation): boolean {
    return isTreatmentEditorExpanded(rec);
  }

  function registerEditableFieldElement(key: string, element: unknown): void {
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      editableFieldElements.set(key, element);
      return;
    }
    editableFieldElements.delete(key);
  }

  function isEditableFieldActive(rec: TreatmentRecommendation, field: string): boolean {
    return activeEditableFieldKey.value === options.getFieldKey(rec, field);
  }

  function setActiveEditableField(rec: TreatmentRecommendation, field: string): void {
    activeEditableFieldKey.value = options.getFieldKey(rec, field);
  }

  function clearActiveEditableField(rec?: TreatmentRecommendation, field?: string): void {
    if (!rec || !field || isEditableFieldActive(rec, field)) {
      activeEditableFieldKey.value = null;
    }
  }

  function focusActiveEditableField(): void {
    const key = activeEditableFieldKey.value;
    if (!key) return;
    void nextTick(() => editableFieldElements.get(key)?.focus());
  }

  return {
    expandedTreatmentEditors,
    activeEditableFieldKey,
    resetTreatmentEditorState,
    isTreatmentEditorExpanded,
    toggleTreatmentEditor,
    expandTreatmentEditor,
    collapseTreatmentEditor,
    shouldShowTreatmentEditor,
    registerEditableFieldElement,
    isEditableFieldActive,
    setActiveEditableField,
    clearActiveEditableField,
    focusActiveEditableField,
  };
}

export type TreatmentEditorState = ReturnType<typeof useTreatmentEditorState>;
