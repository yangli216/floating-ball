import { computed, ref } from 'vue';

export const DEFAULT_SYMPTOM_SYSTEM_CATEGORIES: Record<string, string> = {
  respiratory: '呼吸系统',
  circulatory: '循环系统',
  endocrine: '内分泌系统',
  digestive: '消化系统',
  urinary: '泌尿系统',
  reproductive: '生殖系统',
  nervous: '神经系统',
  motor: '运动系统',
  other: '其他',
};

export interface SymptomCategoryOption {
  key: string;
  label: string;
}

export function useSymptomCategoryFilter(
  categories: Record<string, string> = DEFAULT_SYMPTOM_SYSTEM_CATEGORIES,
) {
  const selectedCategories = ref<string[]>([]);
  const isCategoryDropdownOpen = ref(false);
  const categoryFilterRef = ref<HTMLElement | null>(null);

  const uniqueCategories = computed<SymptomCategoryOption[]>(() =>
    Object.keys(categories).map((key) => ({
      key,
      label: categories[key] || key,
    })),
  );

  const categoryButtonText = computed(() => {
    if (selectedCategories.value.length === 0) return '全部系统';
    if (selectedCategories.value.length === 1) {
      const cat = uniqueCategories.value.find((item) => item.key === selectedCategories.value[0]);
      return cat ? cat.label : selectedCategories.value[0];
    }
    return `已选 ${selectedCategories.value.length} 项`;
  });

  function toggleCategoryDropdown(): void {
    isCategoryDropdownOpen.value = !isCategoryDropdownOpen.value;
  }

  function closeCategoryDropdown(): void {
    isCategoryDropdownOpen.value = false;
  }

  function toggleCategory(key: string): void {
    if (key === 'all') {
      selectedCategories.value = [];
      return;
    }

    const index = selectedCategories.value.indexOf(key);
    if (index !== -1) {
      selectedCategories.value.splice(index, 1);
      return;
    }

    selectedCategories.value.push(key);
  }

  function closeCategoryDropdownIfOutside(target: Node | null): void {
    if (!categoryFilterRef.value || !target) {
      return;
    }
    if (!categoryFilterRef.value.contains(target)) {
      closeCategoryDropdown();
    }
  }

  function resetCategoryFilter(): void {
    selectedCategories.value = [];
    closeCategoryDropdown();
  }

  return {
    categoryButtonText,
    categoryFilterRef,
    closeCategoryDropdown,
    closeCategoryDropdownIfOutside,
    isCategoryDropdownOpen,
    resetCategoryFilter,
    selectedCategories,
    toggleCategory,
    toggleCategoryDropdown,
    uniqueCategories,
  };
}

export type SymptomCategoryFilter = ReturnType<typeof useSymptomCategoryFilter>;
