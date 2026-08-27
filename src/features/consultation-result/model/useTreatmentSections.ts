import { computed, type ComputedRef, type Ref } from 'vue';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { ClinicalResultRecommendationType } from '@features/clinical-result';

export type TreatmentSectionGenerationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'deferred'
  | 'skipped'
  | 'error';

export interface TreatmentSection {
  type: ClinicalResultRecommendationType;
  title: string;
  items: TreatmentRecommendation[];
}

export interface TreatmentPresentationRow extends TreatmentSection {
  presentationKey: string;
  generationStatus: TreatmentSectionGenerationStatus;
  placeholder: 'loading' | 'error' | null;
}

export interface TreatmentSectionsOptions {
  treatments: Ref<TreatmentRecommendation[]>;
  selectedDiagnosis: Ref<Diagnosis | null>;
  isRefreshNeeded: Ref<boolean> | ComputedRef<boolean>;
  getLastTreatmentDiagnosisKey: () => string;
  generationStates?: Ref<Record<ClinicalResultRecommendationType, TreatmentSectionGenerationStatus>>
    | ComputedRef<Record<ClinicalResultRecommendationType, TreatmentSectionGenerationStatus>>;
  showGenerationPlaceholders?: Ref<boolean> | ComputedRef<boolean>;
}

const TREATMENT_SECTION_DEFINITIONS: Array<{
  type: ClinicalResultRecommendationType;
  title: string;
}> = [
  { type: 'medicine', title: '药品' },
  { type: 'exam', title: '检查项目' },
  { type: 'lab_test', title: '检验项目' },
];

const AUXILIARY_TYPES = ['exam', 'lab_test'] as const;

function isPlaceholderStatus(
  status: TreatmentSectionGenerationStatus,
): status is Extract<TreatmentSectionGenerationStatus, 'loading' | 'error'> {
  return status === 'loading' || status === 'error';
}

export function useTreatmentSections(options: TreatmentSectionsOptions) {
  const treatmentPresentationRows = computed<TreatmentPresentationRow[]>(() => {
    const showPlaceholders = options.showGenerationPlaceholders?.value === true;
    const sections = TREATMENT_SECTION_DEFINITIONS.map((section): TreatmentPresentationRow => {
      const items = options.treatments.value.filter((item) => item.type === section.type);
      const generationStatus = options.generationStates?.value[section.type] || 'idle';
      const showStandalonePlaceholder = section.type === 'medicine'
        && showPlaceholders
        && items.length === 0
        && isPlaceholderStatus(generationStatus);
      return {
        ...section,
        presentationKey: section.type,
        items,
        generationStatus,
        placeholder: showStandalonePlaceholder ? generationStatus : null,
      };
    });

    const medicineSection = sections.find((section) => section.type === 'medicine');
    const auxiliarySections = sections.filter((section) => (
      AUXILIARY_TYPES.includes(section.type as typeof AUXILIARY_TYPES[number])
    ));
    const activeAuxiliarySections = auxiliarySections.filter((section) => (
      isPlaceholderStatus(section.generationStatus)
    ));
    const auxiliaryPlaceholderStatus = activeAuxiliarySections.some(
      (section) => section.generationStatus === 'loading',
    )
      ? 'loading'
      : activeAuxiliarySections.some((section) => section.generationStatus === 'error')
        ? 'error'
        : null;
    const auxiliaryPlaceholderTitle = activeAuxiliarySections.length > 1
      ? '检查与检验'
      : activeAuxiliarySections[0]?.title || '检查与检验';
    const auxiliaryPlaceholder: TreatmentPresentationRow | null = showPlaceholders
      && auxiliaryPlaceholderStatus
      ? {
          presentationKey: 'auxiliary-generation',
          type: activeAuxiliarySections[0]?.type || 'exam',
          title: auxiliaryPlaceholderTitle,
          items: [],
          generationStatus: auxiliaryPlaceholderStatus,
          placeholder: auxiliaryPlaceholderStatus,
        }
      : null;

    return [
      medicineSection?.items.length || medicineSection?.placeholder ? medicineSection : null,
      auxiliaryPlaceholder,
      ...auxiliarySections.filter((section) => section.items.length > 0),
    ].filter((section): section is TreatmentPresentationRow => Boolean(section));
  });

  const treatmentSections = computed<TreatmentSection[]>(() => (
    treatmentPresentationRows.value
      .filter((section) => section.items.length > 0)
      .map(({ type, title, items }) => ({ type, title, items }))
  ));

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
    treatmentPresentationRows,
    treatmentSections,
  };
}
