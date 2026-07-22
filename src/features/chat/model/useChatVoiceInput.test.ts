import { describe, expect, it, vi } from 'vitest';
import {
  useChatVoiceInput,
  type ChatVoiceAudioRecorder,
  type ChatVoiceSpeechSession,
} from './useChatVoiceInput';

function createHarness() {
  const calls: string[] = [];
  let onAudioChunk: ((pcmData: Int16Array) => void) | undefined;

  const recorder: ChatVoiceAudioRecorder = {
    setOnAudioChunk: vi.fn((callback) => {
      onAudioChunk = callback;
      calls.push(callback ? 'recorder:listen' : 'recorder:unlisten');
    }),
    start: vi.fn(async () => {
      calls.push('recorder:start');
    }),
    stop: vi.fn(async () => {
      calls.push('recorder:stop');
      return new Blob([], { type: 'audio/wav' });
    }),
  };

  const session: ChatVoiceSpeechSession = {
    start: vi.fn(async () => {
      calls.push('session:start');
    }),
    sendAudio: vi.fn(() => {
      calls.push('session:audio');
    }),
    finish: vi.fn(async () => {
      calls.push('session:finish');
      return '识别结果';
    }),
    close: vi.fn(() => {
      calls.push('session:close');
    }),
  };

  const voiceInput = useChatVoiceInput({
    recorder,
    createSpeechSession: () => session,
  });

  return {
    calls,
    emitAudio: (pcmData: Int16Array) => onAudioChunk?.(pcmData),
    recorder,
    session,
    voiceInput,
  };
}

describe('useChatVoiceInput', () => {
  it('starts the regional speech session before microphone capture and streams PCM chunks', async () => {
    const harness = createHarness();

    await harness.voiceInput.startRecording();
    const pcmData = new Int16Array([1, -1]);
    harness.emitAudio(pcmData);

    expect(harness.calls.slice(0, 3)).toEqual([
      'session:start',
      'recorder:listen',
      'recorder:start',
    ]);
    expect(harness.session.sendAudio).toHaveBeenCalledWith(pcmData);
    expect(harness.voiceInput.recording.value).toBe(true);
  });

  it('stops microphone capture before finalizing the realtime transcript', async () => {
    const harness = createHarness();
    await harness.voiceInput.startRecording();

    const text = await harness.voiceInput.stopRecording();

    expect(text).toBe('识别结果');
    expect(harness.calls.slice(-4)).toEqual([
      'recorder:unlisten',
      'recorder:stop',
      'session:finish',
      'session:close',
    ]);
    expect(harness.voiceInput.recording.value).toBe(false);
  });

  it('cleans up the speech session when microphone capture fails', async () => {
    const harness = createHarness();
    vi.mocked(harness.recorder.start).mockRejectedValueOnce(new Error('麦克风不可用'));

    await expect(harness.voiceInput.startRecording()).rejects.toThrow('麦克风不可用');

    expect(harness.session.close).toHaveBeenCalledOnce();
    expect(harness.voiceInput.recording.value).toBe(false);
  });

  it('discards an active recording without requesting a transcript', async () => {
    const harness = createHarness();
    await harness.voiceInput.startRecording();

    await harness.voiceInput.discardRecording();

    expect(harness.recorder.stop).toHaveBeenCalledOnce();
    expect(harness.session.finish).not.toHaveBeenCalled();
    expect(harness.session.close).toHaveBeenCalledOnce();
    expect(harness.voiceInput.recording.value).toBe(false);
  });
});
