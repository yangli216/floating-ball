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

import { useClinicalResultSupplementInput } from './useClinicalResultSupplementInput';

describe('useClinicalResultSupplementInput', () => {
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
