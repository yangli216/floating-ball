import { nextTick } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { SecondarySelectorField } from './useSecondarySelector';

export type TreatmentQuickSelectorField = Extract<
  SecondarySelectorField,
  'pharmacy' | 'execDept' | 'bodySite'
>;

export interface TreatmentQuickSelectorOptions {
  expandTreatmentEditor: (rec: TreatmentRecommendation) => void;
  openSecondarySelector: (rec: TreatmentRecommendation, field: SecondarySelectorField) => void;
  getEditorKey: (rec: TreatmentRecommendation) => string;
}

const INPUT_SELECTOR_BY_FIELD: Record<TreatmentQuickSelectorField, string> = {
  pharmacy: 'data-pharmacy-input',
  execDept: 'data-exec-dept-input',
  bodySite: 'data-body-site-input',
};

export function useTreatmentQuickSelector(options: TreatmentQuickSelectorOptions) {
  function openQuickSelector(
    rec: TreatmentRecommendation,
    field: TreatmentQuickSelectorField,
    event?: Event,
  ): void {
    event?.stopPropagation();
    options.expandTreatmentEditor(rec);
    options.openSecondarySelector(rec, field);
    void nextTick(() => {
      const selector = document.querySelector<HTMLInputElement>(
        `[${INPUT_SELECTOR_BY_FIELD[field]}="${options.getEditorKey(rec)}"]`,
      );
      selector?.focus();
      selector?.select();
    });
  }

  return {
    openQuickSelector,
  };
}
