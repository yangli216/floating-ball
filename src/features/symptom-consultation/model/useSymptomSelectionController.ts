import type { Ref } from 'vue';
import { buildInitialSymptomFormData, type SymptomFormConfigLike } from '../lib/symptomFormData';

export interface SelectableSymptom extends SymptomFormConfigLike {
  key: string;
  name?: string;
}

export interface SymptomSelectionTrackPayload {
  symptomKey: string;
  symptomName?: string;
  totalSelected?: number;
}

export interface UseSymptomSelectionControllerInput<TSymptom extends SelectableSymptom> {
  selectedSymptoms: Ref<TSymptom[]>;
  formData: Ref<Record<string, unknown>>;
  maxSymptoms: number;
  notifyMaxReached?: (maxSymptoms: number) => void;
  onSelected?: (payload: SymptomSelectionTrackPayload) => void;
  onDeselected?: (payload: SymptomSelectionTrackPayload) => void;
  onRemoved?: (payload: SymptomSelectionTrackPayload) => void;
  onUpgradeFromCompanion?: (symptomKey: string) => void;
}

export function useSymptomSelectionController<TSymptom extends SelectableSymptom>(
  input: UseSymptomSelectionControllerInput<TSymptom>,
) {
  function initFormData(configItem: SymptomFormConfigLike): void {
    if (!configItem.key) {
      return;
    }
    input.formData.value[configItem.key] = buildInitialSymptomFormData(configItem);
  }

  function clearSelection(): void {
    input.selectedSymptoms.value = [];
    input.formData.value = {};
  }

  function removeSymptom(symptom: Pick<TSymptom, 'key' | 'name'>): void {
    input.onRemoved?.({
      symptomKey: symptom.key,
      symptomName: symptom.name,
    });

    const index = input.selectedSymptoms.value.findIndex((item) => item.key === symptom.key);
    if (index !== -1) {
      input.selectedSymptoms.value.splice(index, 1);
    }
  }

  function selectSymptom(symptom: TSymptom): void {
    const index = input.selectedSymptoms.value.findIndex((item) => item.key === symptom.key);
    if (index !== -1) {
      input.onDeselected?.({
        symptomKey: symptom.key,
        symptomName: symptom.name,
      });
      input.selectedSymptoms.value.splice(index, 1);
      return;
    }

    if (input.selectedSymptoms.value.length >= input.maxSymptoms) {
      input.notifyMaxReached?.(input.maxSymptoms);
      return;
    }

    const totalSelected = input.selectedSymptoms.value.length + 1;
    input.onSelected?.({
      symptomKey: symptom.key,
      symptomName: symptom.name,
      totalSelected,
    });
    input.selectedSymptoms.value.push(symptom);
    input.onUpgradeFromCompanion?.(symptom.key);
    if (!input.formData.value[symptom.key]) {
      initFormData(symptom);
    }
  }

  return {
    clearSelection,
    initFormData,
    removeSymptom,
    selectSymptom,
  };
}

export type SymptomSelectionController = ReturnType<typeof useSymptomSelectionController>;
