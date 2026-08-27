import { computed, ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type {
  ClinicalResultChannel,
  ClinicalResultGenerationState,
  ClinicalResultRecommendationType,
} from '@features/clinical-result';

export type ClinicalResultDiagnosisRequestMode =
  | 'idle'
  | 'initial-recovery'
  | 'manual-refresh'
  | 'regeneration';

export interface ClinicalResultGenerationSequenceOptions {
  getChannel: () => ClinicalResultChannel;
  getGeneration: () => ClinicalResultGenerationState | undefined;
  getFormalDiagnosisCount: () => number;
  getSelectedDiagnosisKey: () => string;
  getLastTreatmentDiagnosisKey: () => string;
}

export function isDoctorOwnedTreatment(item: TreatmentRecommendation): boolean {
  return item.sourceType === 'explicit' || item.manualMatched === true;
}

export function mergeGeneratedTreatmentBranches(
  current: TreatmentRecommendation[],
  requestedTypes: ClinicalResultRecommendationType[],
  generatedItems: TreatmentRecommendation[],
): TreatmentRecommendation[] {
  const requested = new Set(requestedTypes);
  const preserved = current.filter((item) => (
    !requested.has(item.type as ClinicalResultRecommendationType)
    || isDoctorOwnedTreatment(item)
  ));
  const seen = new Set(preserved.map((item) => `${item.type}:${item.matchedItem?.id || item.name}`));
  const generated = generatedItems.filter((item) => {
    const key = `${item.type}:${item.matchedItem?.id || item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...preserved, ...generated];
}

/**
 * Keeps ordinary voice generation computationally parallel but clinically ordered.
 * Other result channels intentionally pass through their existing behavior.
 */
export function useClinicalResultGenerationSequence(
  options: ClinicalResultGenerationSequenceOptions,
) {
  const diagnosisRequestMode = ref<ClinicalResultDiagnosisRequestMode>('idle');
  const initialDiagnosisRecoveryAttempted = ref(false);
  const activeTreatmentDiagnosisKey = ref('');

  const isVoiceChannel = computed(() => options.getChannel() === 'voice');
  const diagnosisLoading = computed(() => diagnosisRequestMode.value !== 'idle');
  const initialDiagnosisPending = computed(() => (
    isVoiceChannel.value && diagnosisRequestMode.value === 'initial-recovery'
  ));
  const showBlockingDiagnosisLoading = computed(() => (
    initialDiagnosisPending.value
    || (diagnosisRequestMode.value === 'manual-refresh' && options.getFormalDiagnosisCount() === 0)
  ));
  const coreRecordEditable = computed(() => {
    if (!isVoiceChannel.value) return false;
    const generation = options.getGeneration();
    if (!generation || generation.status === 'error') return false;
    const ready = new Set(generation.readySections);
    return ready.has('record_core') && ready.has('history_context');
  });

  const canStartAutoTreatment = computed(() => {
    if (!isVoiceChannel.value) return true;
    if (!options.getSelectedDiagnosisKey() || diagnosisLoading.value) return false;

    const generation = options.getGeneration();
    if (!generation) return true;
    if (generation.status === 'error') return false;

    const ready = new Set(generation.readySections);
    if (generation.status === 'streaming') {
      return ready.has('diagnoses') && ready.has('recommendation_plan');
    }

    // A complete legacy result may not expose section metadata. Once it does,
    // both clinical dependencies must be present before treatment starts.
    if (ready.size === 0) return true;
    return ready.has('diagnoses') && ready.has('recommendation_plan');
  });

  const canShowGeneratedTreatments = computed(() => (
    !isVoiceChannel.value
    || (
      Boolean(options.getSelectedDiagnosisKey())
      && !initialDiagnosisPending.value
    )
  ));

  const treatmentGenerationIsInitial = computed(() => (
    isVoiceChannel.value
    && Boolean(activeTreatmentDiagnosisKey.value)
    && !options.getLastTreatmentDiagnosisKey()
  ));

  function shouldRecoverMissingDiagnosis(canRefresh: boolean): boolean {
    if (!isVoiceChannel.value || !canRefresh) return false;
    if (options.getFormalDiagnosisCount() > 0 || diagnosisLoading.value) return false;
    if (initialDiagnosisRecoveryAttempted.value) return false;

    const generation = options.getGeneration();
    if (!generation) return true;
    if (generation.status === 'streaming' || generation.status === 'error') return false;
    // An explicit diagnoses section is valid even when it intentionally contains
    // only differential directions or no formal diagnosis.
    return !generation.readySections.includes('diagnoses');
  }

  function beginDiagnosis(mode: Exclude<ClinicalResultDiagnosisRequestMode, 'idle'>): boolean {
    if (diagnosisLoading.value) return false;
    diagnosisRequestMode.value = mode;
    if (mode === 'initial-recovery') initialDiagnosisRecoveryAttempted.value = true;
    return true;
  }

  function finishDiagnosis(mode?: Exclude<ClinicalResultDiagnosisRequestMode, 'idle'>): void {
    if (mode && diagnosisRequestMode.value !== mode) return;
    diagnosisRequestMode.value = 'idle';
  }

  function beginTreatment(diagnosisKey: string): void {
    activeTreatmentDiagnosisKey.value = diagnosisKey;
  }

  function finishTreatment(diagnosisKey?: string): void {
    if (diagnosisKey && activeTreatmentDiagnosisKey.value !== diagnosisKey) return;
    activeTreatmentDiagnosisKey.value = '';
  }

  function reset(): void {
    diagnosisRequestMode.value = 'idle';
    initialDiagnosisRecoveryAttempted.value = false;
    activeTreatmentDiagnosisKey.value = '';
  }

  return {
    activeTreatmentDiagnosisKey,
    beginDiagnosis,
    beginTreatment,
    canShowGeneratedTreatments,
    canStartAutoTreatment,
    coreRecordEditable,
    diagnosisLoading,
    diagnosisRequestMode,
    finishDiagnosis,
    finishTreatment,
    initialDiagnosisPending,
    reset,
    shouldRecoverMissingDiagnosis,
    showBlockingDiagnosisLoading,
    treatmentGenerationIsInitial,
  };
}

export type ClinicalResultGenerationSequence = ReturnType<
  typeof useClinicalResultGenerationSequence
>;
