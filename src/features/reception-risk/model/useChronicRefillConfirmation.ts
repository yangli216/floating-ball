import { computed, ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { ClinicalResultInput } from '@features/clinical-result';
import {
  buildConfirmedAnswers,
  type ChronicRefillConfirmationPlan,
} from '../lib/chronicRefillConfirmation';
import {
  getChronicRefillConditionOptions,
  scopeChronicRefillCandidate,
  type ChronicRefillCandidate,
} from '../lib/chronicRefillAssessment';

export interface ChronicRefillConfirmationDependencies {
  patient: AppPatient;
  candidate: ChronicRefillCandidate;
  generatePlan: (
    patient: AppPatient,
    candidate: ChronicRefillCandidate,
  ) => Promise<ChronicRefillConfirmationPlan>;
  generateRecord: (
    patient: AppPatient,
    candidate: ChronicRefillCandidate,
    confirmation: {
      supplementText?: string;
      answers: ReturnType<typeof buildConfirmedAnswers>;
    },
  ) => Promise<ClinicalResultInput>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  transcribe: (audio: Blob) => Promise<string>;
  getRecordingErrorMessage: (error: unknown) => string;
}

export function useChronicRefillConfirmation(
  dependencies: ChronicRefillConfirmationDependencies,
) {
  const plan = ref<ChronicRefillConfirmationPlan | null>(null);
  const selections = ref<Record<string, string>>({});
  const conditionOptions = getChronicRefillConditionOptions(dependencies.candidate);
  const selectedConditionIds = ref<string[]>(
    conditionOptions.length === 1 ? [conditionOptions[0].id] : [],
  );
  const confirmedCandidate = ref<ChronicRefillCandidate | null>(null);
  const supplementText = ref('');
  const loadingPlan = ref(false);
  const generatingRecord = ref(false);
  const isRecording = ref(false);
  const isTranscribing = ref(false);
  const recordingSeconds = ref(0);
  const errorMessage = ref('');
  let timerId: ReturnType<typeof setInterval> | null = null;

  const isBusy = computed(() => (
    loadingPlan.value
    || generatingRecord.value
    || isTranscribing.value
  ));

  const canGenerate = computed(() => Boolean(
    confirmedCandidate.value
    && plan.value
    && plan.value.items.length > 0
    && !isBusy.value
    && !isRecording.value,
  ));

  const conditionsConfirmed = computed(() => Boolean(confirmedCandidate.value));
  const canConfirmConditions = computed(() => (
    selectedConditionIds.value.length > 0
    && !isBusy.value
    && !isRecording.value
  ));

  function toggleCondition(conditionId: string): void {
    if (conditionsConfirmed.value) return;
    selectedConditionIds.value = selectedConditionIds.value.includes(conditionId)
      ? selectedConditionIds.value.filter((id) => id !== conditionId)
      : [...selectedConditionIds.value, conditionId];
  }

  function selectOption(itemId: string, value: string): void {
    selections.value = { ...selections.value, [itemId]: value };
  }

  function applyRecommended(): void {
    if (!plan.value) return;
    selections.value = Object.fromEntries(
      plan.value.items.map((item) => [item.id, item.recommendedValue]),
    );
  }

  async function loadPlan(): Promise<void> {
    const scopedCandidate = confirmedCandidate.value || scopeChronicRefillCandidate(
      dependencies.candidate,
      selectedConditionIds.value,
    );
    if (!scopedCandidate) {
      errorMessage.value = '请先选择本次复诊涉及的慢病';
      return;
    }
    confirmedCandidate.value = scopedCandidate;
    loadingPlan.value = true;
    errorMessage.value = '';
    try {
      plan.value = await dependencies.generatePlan(
        dependencies.patient,
        scopedCandidate,
      );
      applyRecommended();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      loadingPlan.value = false;
    }
  }

  async function confirmConditions(): Promise<void> {
    if (!canConfirmConditions.value) return;
    plan.value = null;
    selections.value = {};
    await loadPlan();
  }

  function resetConditions(): void {
    if (isBusy.value || isRecording.value) return;
    confirmedCandidate.value = null;
    plan.value = null;
    selections.value = {};
    supplementText.value = '';
    errorMessage.value = '';
  }

  function startTimer(): void {
    stopTimer();
    const startedAt = Date.now();
    recordingSeconds.value = 0;
    timerId = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 250);
  }

  function stopTimer(): void {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  async function startVoiceSupplement(): Promise<void> {
    errorMessage.value = '';
    try {
      await dependencies.startRecording();
      isRecording.value = true;
      startTimer();
    } catch (error) {
      errorMessage.value = `无法开始录音：${dependencies.getRecordingErrorMessage(error)}`;
    }
  }

  async function stopVoiceSupplement(): Promise<void> {
    stopTimer();
    try {
      const audio = await dependencies.stopRecording();
      isRecording.value = false;
      isTranscribing.value = true;
      const text = (await dependencies.transcribe(audio)).trim();
      if (!text) {
        errorMessage.value = '未识别到有效语音，请重新录制或使用文字补充';
        return;
      }
      supplementText.value = supplementText.value.trim()
        ? `${supplementText.value.trim()}\n${text}`
        : text;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isRecording.value = false;
      isTranscribing.value = false;
    }
  }

  async function toggleVoiceSupplement(): Promise<void> {
    if (isRecording.value) {
      await stopVoiceSupplement();
    } else {
      await startVoiceSupplement();
    }
  }

  async function discardRecording(): Promise<void> {
    stopTimer();
    if (!isRecording.value) return;
    try {
      await dependencies.stopRecording();
    } catch (error) {
      console.warn('[ChronicRefill] Failed to discard supplement recording', error);
    } finally {
      isRecording.value = false;
      isTranscribing.value = false;
    }
  }

  async function generateRecord(): Promise<ClinicalResultInput | null> {
    if (!plan.value || !confirmedCandidate.value || !canGenerate.value) return null;
    generatingRecord.value = true;
    errorMessage.value = '';
    try {
      return await dependencies.generateRecord(
        dependencies.patient,
        confirmedCandidate.value,
        {
          supplementText: supplementText.value.trim() || undefined,
          answers: buildConfirmedAnswers(plan.value, selections.value),
        },
      );
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      generatingRecord.value = false;
    }
  }

  return {
    plan,
    selections,
    conditionOptions,
    selectedConditionIds,
    confirmedCandidate,
    supplementText,
    loadingPlan,
    generatingRecord,
    isRecording,
    isTranscribing,
    recordingSeconds,
    errorMessage,
    isBusy,
    canGenerate,
    conditionsConfirmed,
    canConfirmConditions,
    loadPlan,
    toggleCondition,
    confirmConditions,
    resetConditions,
    selectOption,
    applyRecommended,
    toggleVoiceSupplement,
    discardRecording,
    generateRecord,
  };
}
