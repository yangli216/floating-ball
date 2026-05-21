import { computed, watch, type Ref } from 'vue';
import {
  buildConsultationRenderPlan,
  type ConsultationRenderConfigLike,
  type ConsultationRenderMode,
} from '../lib/consultationRenderPlan';
import { filterSymptoms, type SymptomFilterItem } from '../lib/symptomFiltering';
import { useCompanionSymptoms } from './useCompanionSymptoms';
import { useSymptomCategoryFilter } from './useSymptomCategoryFilter';
import {
  useSymptomSelectionController,
  type SelectableSymptom,
  type SymptomSelectionTrackPayload,
} from './useSymptomSelectionController';

export interface SymptomCollectionItem extends SelectableSymptom, SymptomFilterItem {
  key: string;
  name: string;
}

export interface UseSymptomCollectionControllerInput<TSymptom extends SymptomCollectionItem> {
  symptoms: Ref<TSymptom[]>;
  selectedSymptoms: Ref<TSymptom[]>;
  formData: Ref<Record<string, unknown>>;
  searchQuery: Ref<string>;
  mode: Ref<ConsultationRenderMode>;
  generalConfig: TSymptom & ConsultationRenderConfigLike;
  tcmConfig: TSymptom & ConsultationRenderConfigLike;
  associations: Record<string, string[]>;
  maxSymptoms: number;
  getPatientGenderCode: () => string | undefined;
  notifyMaxReached?: (maxSymptoms: number) => void;
  onSelected?: (payload: SymptomSelectionTrackPayload) => void;
  onDeselected?: (payload: SymptomSelectionTrackPayload) => void;
  onRemoved?: (payload: SymptomSelectionTrackPayload) => void;
}

export function useSymptomCollectionController<TSymptom extends SymptomCollectionItem>(
  input: UseSymptomCollectionControllerInput<TSymptom>,
) {
  const categoryFilter = useSymptomCategoryFilter();
  const companionSymptoms = useCompanionSymptoms({
    associations: input.associations,
    getSymptoms: () => input.symptoms.value,
    getSelectedSymptoms: () => input.selectedSymptoms.value,
  });
  const selection = useSymptomSelectionController({
    selectedSymptoms: input.selectedSymptoms,
    formData: input.formData,
    maxSymptoms: input.maxSymptoms,
    notifyMaxReached: input.notifyMaxReached,
    onSelected: input.onSelected,
    onDeselected: input.onDeselected,
    onRemoved: input.onRemoved,
    onUpgradeFromCompanion: companionSymptoms.removeCompanionSymptom,
  });

  const allSymptoms = computed(() => input.symptoms.value);
  const filteredSymptoms = computed(() =>
    filterSymptoms({
      symptoms: input.symptoms.value,
      searchQuery: input.searchQuery.value,
      selectedCategories: categoryFilter.selectedCategories.value,
      patientGenderCode: input.getPatientGenderCode(),
    }),
  );
  const renderPlan = computed(() =>
    buildConsultationRenderPlan({
      selectedSymptoms: input.selectedSymptoms.value,
      mode: input.mode.value,
      formData: input.formData.value,
      generalConfig: input.generalConfig,
      tcmConfig: input.tcmConfig,
    }),
  );
  const renderList = computed(() => renderPlan.value.items);

  watch(renderPlan, (plan) => {
    plan.ensureKeys.forEach((key) => {
      if (key === input.generalConfig.key) {
        selection.initFormData(input.generalConfig);
      } else if (key === input.tcmConfig.key) {
        selection.initFormData(input.tcmConfig);
      }
    });

    plan.clearKeys.forEach((key) => {
      delete input.formData.value[key];
    });
  }, { immediate: true });

  function clearCollection(): void {
    selection.clearSelection();
    companionSymptoms.resetCompanionSymptoms();
    categoryFilter.resetCategoryFilter();
  }

  return {
    allSymptoms,
    categoryButtonText: categoryFilter.categoryButtonText,
    categoryFilterRef: categoryFilter.categoryFilterRef,
    clearCollection,
    clearSelection: selection.clearSelection,
    closeCategoryDropdown: categoryFilter.closeCategoryDropdown,
    companionSymptomNames: companionSymptoms.companionSymptomNames,
    companionSymptoms: companionSymptoms.companionSymptoms,
    filteredSymptoms,
    getSymptomRecommendations: companionSymptoms.getSymptomRecommendations,
    initFormData: selection.initFormData,
    isCategoryDropdownOpen: categoryFilter.isCategoryDropdownOpen,
    isCompanionSelected: companionSymptoms.isCompanionSelected,
    removeSymptom: selection.removeSymptom,
    renderList,
    resetCategoryFilter: categoryFilter.resetCategoryFilter,
    resetCompanionSymptoms: companionSymptoms.resetCompanionSymptoms,
    selectSymptom: selection.selectSymptom,
    selectedCategories: categoryFilter.selectedCategories,
    toggleCategory: categoryFilter.toggleCategory,
    toggleCategoryDropdown: categoryFilter.toggleCategoryDropdown,
    toggleCompanionSymptom: companionSymptoms.toggleCompanionSymptom,
    uniqueCategories: categoryFilter.uniqueCategories,
  };
}

export type SymptomCollectionController = ReturnType<typeof useSymptomCollectionController>;
