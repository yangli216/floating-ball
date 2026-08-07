import { computed, ref } from 'vue';
import { audioRecorder, getMicrophoneErrorMessage } from '@/services/audioRecorder';
import { transcribeSpeech } from '@/services/aliyunSpeech';

export interface ClinicalResultSupplementRecorder {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
}

export interface UseClinicalResultSupplementInputOptions {
  recorder?: ClinicalResultSupplementRecorder;
  transcribe?: (blob: Blob) => Promise<string>;
}

export function useClinicalResultSupplementInput(
  options: UseClinicalResultSupplementInputOptions = {},
) {
  const recorder = options.recorder || audioRecorder;
  const transcribe = options.transcribe || transcribeSpeech;
  const text = ref('');
  const error = ref('');
  const recording = ref(false);
  const transcribing = ref(false);
  const recordingSeconds = ref(0);
  let timerId: ReturnType<typeof setInterval> | null = null;

  const busy = computed(() => recording.value || transcribing.value);
  const voiceButtonText = computed(() => {
    if (transcribing.value) return '识别中...';
    return recording.value ? '停止并识别' : '语音录入';
  });
  const recordingDuration = computed(() => {
    const minutes = Math.floor(recordingSeconds.value / 60);
    const seconds = recordingSeconds.value % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  function clearTimer(): void {
    if (timerId !== null) {
      globalThis.clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer(): void {
    clearTimer();
    recordingSeconds.value = 0;
    const startedAt = Date.now();
    timerId = globalThis.setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 250);
  }

  function appendText(value: string): void {
    const normalized = value.trim();
    if (!normalized) return;
    text.value = text.value.trim()
      ? `${text.value.trim()}\n${normalized}`
      : normalized;
  }

  async function startRecording(): Promise<void> {
    if (busy.value) return;
    error.value = '';
    try {
      await recorder.start();
      recording.value = true;
      startTimer();
    } catch (cause) {
      error.value = `无法开始录音：${getMicrophoneErrorMessage(cause)}`;
    }
  }

  async function stopRecording(): Promise<void> {
    if (!recording.value || transcribing.value) return;
    clearTimer();
    recording.value = false;
    transcribing.value = true;
    error.value = '';
    try {
      const blob = await recorder.stop();
      const transcription = await transcribe(blob);
      if (!transcription.trim()) {
        error.value = '未识别到有效语音内容，请重新录制或手动输入';
        return;
      }
      appendText(transcription);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      transcribing.value = false;
    }
  }

  async function toggleRecording(): Promise<void> {
    if (recording.value) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  async function discardRecording(): Promise<void> {
    clearTimer();
    if (!recording.value) return;
    recording.value = false;
    try {
      await recorder.stop();
    } catch (cause) {
      console.warn('[ClinicalResultSupplement] discard recording failed', cause);
    }
  }

  async function reset(): Promise<void> {
    await discardRecording();
    text.value = '';
    error.value = '';
    transcribing.value = false;
    recordingSeconds.value = 0;
  }

  return {
    appendText,
    busy,
    discardRecording,
    error,
    recording,
    recordingDuration,
    reset,
    text,
    toggleRecording,
    transcribing,
    voiceButtonText,
  };
}
