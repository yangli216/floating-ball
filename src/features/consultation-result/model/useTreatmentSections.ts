import { computed, type ComputedRef, type Ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';

export interface TreatmentSection {
  type: TreatmentRecommendation['type'];
  title: string;
  items: TreatmentRecommendation[];
}

export interface TreatmentSectionsOptions {
  treatments: Ref<TreatmentRecommendation[]>;
  selectedDiagnosis: Ref<Diagnosis | null>;
  isRefreshNeeded: Ref<boolean> | ComputedRef<boolean>;
  getLastTreatmentDiagnosisKey: () => string;
}

const TREATMENT_SECTION_DEFINITIONS: Array<{
  type: TreatmentRecommendation['type'];
  title: string;
}> = [
  { type: 'medicine', title: '药品' },
  { type: 'exam', title: '检查项目' },
  { type: 'lab_test', title: '检验项目' },
];

export function useTreatmentSections(options: TreatmentSectionsOptions) {
  const treatmentSections = computed<TreatmentSection[]>(() =>
    TREATMENT_SECTION_DEFINITIONS
      .map((section) => ({
        ...section,
        items: options.treatments.value.filter((item) => item.type === section.type),
      }))
      .filter((section) => section.items.length > 0),
  );

  const hasTreatments = computed(() => options.treatments.value.length > 0);

  const treatmentEmptyText = computed(() => {
    if (!options.selectedDiagnosis.value) {
      return '请先选择诊断';
    }
    if (options.isRefreshNeeded.value || !options.getLastTreatmentDiagnosisKey()) {
      return '当前诊断暂无已加载的治疗方案，请点击上方刷新方案';
    }
    return '暂无治疗建议';
  });

  return {
    hasTreatments,
    treatmentEmptyText,
    treatmentSections,
  };
}
