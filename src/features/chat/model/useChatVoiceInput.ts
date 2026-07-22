import { shallowRef } from 'vue';

export interface ChatVoiceAudioRecorder {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  setOnAudioChunk: (callback: ((pcmData: Int16Array) => void) | undefined) => void;
}

export interface ChatVoiceSpeechSession {
  start: () => Promise<void>;
  sendAudio: (pcmData: Int16Array) => void;
  finish: () => Promise<string>;
  close: () => void;
}

export interface UseChatVoiceInputOptions {
  recorder: ChatVoiceAudioRecorder;
  createSpeechSession: () => ChatVoiceSpeechSession;
}

/**
 * Owns the chat microphone and speech-session lifecycle.
 * The UI remains responsible for user-facing messages and input-field updates.
 */
export function useChatVoiceInput(options: UseChatVoiceInputOptions) {
  const recording = shallowRef(false);

  let activeSession: ChatVoiceSpeechSession | null = null;
  let lifecycleVersion = 0;
  let starting = false;
  let stopping = false;

  async function startRecording(): Promise<void> {
    if (recording.value || starting || stopping) return;

    starting = true;
    const version = ++lifecycleVersion;
    const session = options.createSpeechSession();
    activeSession = session;

    try {
      // Establish the configured regional speech strategy before microphone
      // capture so the first PCM chunk cannot bypass the realtime session.
      await session.start();
      if (version !== lifecycleVersion || activeSession !== session) return;

      options.recorder.setOnAudioChunk((pcmData) => {
        if (activeSession === session) session.sendAudio(pcmData);
      });
      await options.recorder.start();
      if (version !== lifecycleVersion || activeSession !== session) {
        options.recorder.setOnAudioChunk(undefined);
        await options.recorder.stop();
        return;
      }

      recording.value = true;
    } catch (error) {
      options.recorder.setOnAudioChunk(undefined);
      session.close();
      if (activeSession === session) activeSession = null;
      throw error;
    } finally {
      starting = false;
    }
  }

  async function stopRecording(): Promise<string> {
    if (!recording.value || stopping) return '';

    stopping = true;
    recording.value = false;
    options.recorder.setOnAudioChunk(undefined);
    const session = activeSession;

    try {
      await options.recorder.stop();
      return session ? await session.finish() : '';
    } finally {
      session?.close();
      if (activeSession === session) activeSession = null;
      stopping = false;
    }
  }

  async function discardRecording(): Promise<void> {
    lifecycleVersion += 1;
    const session = activeSession;
    activeSession = null;
    options.recorder.setOnAudioChunk(undefined);

    try {
      if (recording.value) await options.recorder.stop();
    } finally {
      recording.value = false;
      session?.close();
    }
  }

  return {
    discardRecording,
    recording,
    startRecording,
    stopRecording,
  };
}
