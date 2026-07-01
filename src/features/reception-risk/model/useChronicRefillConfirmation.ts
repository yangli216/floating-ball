import { computed, ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { ClinicalResultInput } from '@features/clinical-result';
import {
  buildConfirmedAnswers,
  type ChronicRefillConfirmationPlan,
} from '../lib/chronicRefillConfirmation';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';

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
    plan.value
    && plan.value.items.length > 0
    && !isBusy.value
    && !isRecording.value,
  ));

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
    loadingPlan.value = true;
    errorMessage.value = '';
    try {
      plan.value = await dependencies.generatePlan(
        dependencies.patient,
        dependencies.candidate,
      );
      applyRecommended();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      loadingPlan.value = false;
    }
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
    if (!plan.value || !canGenerate.value) return null;
    generatingRecord.value = true;
    errorMessage.value = '';
    try {
      return await dependencies.generateRecord(
        dependencies.patient,
        dependencies.candidate,
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
    supplementText,
    loadingPlan,
    generatingRecord,
    isRecording,
    isTranscribing,
    recordingSeconds,
    errorMessage,
    isBusy,
    canGenerate,
    loadPlan,
    selectOption,
    applyRecommended,
    toggleVoiceSupplement,
    discardRecording,
    generateRecord,
  };
}
