import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/audioRecorder', () => ({
  audioRecorder: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  getMicrophoneErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('@/services/aliyunSpeech', () => ({
  transcribeSpeech: vi.fn(),
}));

import {
  buildSupplementWaveformLevels,
  useClinicalResultSupplementInput,
} from './useClinicalResultSupplementInput';

describe('useClinicalResultSupplementInput', () => {
  it('maps microphone frequency data to visible waveform levels', () => {
    const levels = buildSupplementWaveformLevels(
      new Uint8Array([0, 32, 128, 255]),
      4,
    );

    expect(levels).toHaveLength(4);
    expect(levels[0]).toBe(0.08);
    expect(levels[3]).toBe(1);
    expect(levels[2]).toBeGreaterThan(levels[1]);
  });

  it('updates the recording waveform from the active microphone analyser', async () => {
    vi.useFakeTimers();
    try {
      const recorder = {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => new Blob()),
        getByteFrequencyData: vi.fn(() => new Uint8Array(64).fill(220)),
      };
      const input = useClinicalResultSupplementInput({
        recorder,
        transcribe: vi.fn(async () => ''),
      });

      await input.toggleRecording();
      await vi.advanceTimersByTimeAsync(100);

      expect(recorder.getByteFrequencyData).toHaveBeenCalled();
      expect(Math.min(...input.waveformLevels.value)).toBeGreaterThan(0.8);

      await input.discardRecording();
      expect(Math.max(...input.waveformLevels.value)).toBeLessThanOrEqual(0.12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('appends a voice transcript after existing manually entered text', async () => {
    const recorder = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => new Blob(['audio'], { type: 'audio/wav' })),
    };
    const transcribe = vi.fn(async () => '患者补充昨晚发热，最高38.6℃。');
    const input = useClinicalResultSupplementInput({ recorder, transcribe });
    input.text.value = '咳嗽较前加重。';

    await input.toggleRecording();
    expect(input.recording.value).toBe(true);

    await input.toggleRecording();

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
    expect(input.recording.value).toBe(false);
    expect(input.transcribing.value).toBe(false);
    expect(input.text.value).toBe('咳嗽较前加重。\n患者补充昨晚发热，最高38.6℃。');
  });

  it('does not change text when speech recognition fails', async () => {
    const input = useClinicalResultSupplementInput({
      recorder: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => new Blob()),
      },
      transcribe: vi.fn(async () => {
        throw new Error('语音识别服务暂不可用');
      }),
    });
    input.text.value = '保留原输入';

    await input.toggleRecording();
    await input.toggleRecording();

    expect(input.text.value).toBe('保留原输入');
    expect(input.error.value).toBe('语音识别服务暂不可用');
  });

  it('discards an active recording without requesting transcription', async () => {
    const recorder = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => new Blob()),
    };
    const transcribe = vi.fn(async () => '不应调用');
    const input = useClinicalResultSupplementInput({ recorder, transcribe });

    await input.toggleRecording();
    await input.discardRecording();

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(transcribe).not.toHaveBeenCalled();
    expect(input.recording.value).toBe(false);
  });
});
