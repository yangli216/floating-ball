import {
  computed,
  readonly,
  shallowRef,
  watch,
  type Ref,
} from 'vue';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import { getHisAdapter } from '@/services/his';
import { generateChronicAiRecommendations } from '../api/chronicAiRecommendationService';
import {
  buildChronicTreatmentPlanInitialDraft,
  buildChronicVisCliQueryItems,
  mergeChronicVisCliLoadedItems,
} from '../lib/chronicTreatmentPlanDraft';
import {
  resolveChronicStandardDiagnoses,
} from '../lib/chronicStandardDiagnosis';
import type {
  ChronicAiRecommendation,
  ChronicDiseasePatientSummary,
} from '../types';
import type {
  TreatmentPlanInitialDraftRecordContext,
} from '@features/treatment-plan';

export interface UseChronicAiRecommendationsOptions {
  summary: Readonly<Ref<ChronicDiseasePatientSummary>>;
  patientAnchorId: Readonly<Ref<string>>;
  recordContext?: Readonly<Ref<TreatmentPlanInitialDraftRecordContext | undefined>>;
}

export function useChronicAiRecommendations(
  options: UseChronicAiRecommendationsOptions,
) {
  const items = shallowRef<ChronicAiRecommendation[]>([]);
  const selectedIds = shallowRef<string[]>([]);
  const loading = shallowRef(false);
  const loaded = shallowRef(false);
  const error = shallowRef('');
  const preparing = shallowRef(false);
  const prepareError = shallowRef('');
  let requestSequence = 0;

  const patientKey = computed(() => [
    options.patientAnchorId.value,
    options.summary.value.idPhr,
    options.summary.value.idRecord,
    options.summary.value.diseaseTags.map((item) => item.diseaseType).join(','),
  ].join('|'));
  const summaryText = computed(() => {
    if (!options.summary.value.hasSupportedDisease) return '当前患者无适用推荐';
    if (loading.value) return '正在读取 HIS 可开立项目';
    if (error.value) return '推荐生成失败 · 可重试';
    if (!loaded.value) return '展开后生成院内项目';
    if (items.value.length === 0) return '本次无可回写推荐';
    return `${selectedIds.value.length} 项已选 · ${selectedIds.value.length}/${items.value.length}`;
  });

  function reset(): void {
    requestSequence += 1;
    items.value = [];
    selectedIds.value = [];
    loading.value = false;
    loaded.value = false;
    error.value = '';
    preparing.value = false;
    prepareError.value = '';
  }

  watch(patientKey, reset);

  async function load(force = false): Promise<void> {
    if (!options.summary.value.hasSupportedDisease || loading.value) return;
    if (loaded.value && !force) return;

    const sequence = ++requestSequence;
    loading.value = true;
    error.value = '';
    try {
      const nextItems = await generateChronicAiRecommendations(
        options.summary.value,
        { forceCatalog: force },
      );
      if (sequence !== requestSequence) return;
      items.value = nextItems;
      selectedIds.value = nextItems.map((item) => item.id);
      loaded.value = true;
    } catch (cause) {
      if (sequence !== requestSequence) return;
      items.value = [];
      selectedIds.value = [];
      loaded.value = false;
      error.value = formatUserFacingError(cause, {
        context: 'AI 推荐生成失败',
        fallback: '请确认 HIS 已连接后重试。',
      });
    } finally {
      if (sequence === requestSequence) loading.value = false;
    }
  }

  function toggleSelection(id: string): void {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((item) => item !== id)
      : [...selectedIds.value, id];
  }

  async function prepareDraft(requestId: string) {
    const patientAnchorId = options.patientAnchorId.value.trim();
    if (!patientAnchorId) {
      throw new Error('缺少当前就诊标识，请重新接诊后再试');
    }
    const selected = new Set(selectedIds.value);
    const selectedItems = items.value.filter((item) => selected.has(item.id));
    if (selectedItems.length === 0) {
      throw new Error('请至少选择一项检查或检验');
    }
    const his = getHisAdapter();
    if (!his) {
      throw new Error('HIS 尚未连接，请返回医生站重新打开慢病插件');
    }

    preparing.value = true;
    prepareError.value = '';
    try {
      const mappingPromise = (async () => {
        try {
          return await his.loadVisCliList(buildChronicVisCliQueryItems(selectedItems));
        } catch (cause) {
          console.warn('[ChronicDisease] Optional loadVisCliList enrichment unavailable', {
            itemCount: selectedItems.length,
            cause: cause instanceof Error ? cause.name : typeof cause,
          });
          return [];
        }
      })();
      const [diagnosisCatalog, loadedItems] = await Promise.all([
        his.fetchDiagnosisCatalog(),
        mappingPromise,
      ]);
      const standardDiagnoses = resolveChronicStandardDiagnoses(
        options.summary.value.diseaseTags,
        diagnosisCatalog,
      );
      const preparedItems = mergeChronicVisCliLoadedItems(selectedItems, loadedItems);
      return buildChronicTreatmentPlanInitialDraft({
        patientAnchorId,
        suggestions: preparedItems,
        selectedIds: preparedItems.map((item) => item.id),
        requestId,
        standardDiagnoses,
        recordContext: options.recordContext?.value,
      });
    } catch (cause) {
      prepareError.value = formatUserFacingError(cause, {
        context: '医嘱调入准备失败',
        fallback: '请确认 HIS 已连接后重试。',
      });
      throw cause;
    } finally {
      preparing.value = false;
    }
  }

  return {
    items: readonly(items),
    selectedIds: readonly(selectedIds),
    loading: readonly(loading),
    loaded: readonly(loaded),
    error: readonly(error),
    summaryText,
    prepareDraft,
    prepareError: readonly(prepareError),
    preparing: readonly(preparing),
    load,
    reset,
    toggleSelection,
  };
}
