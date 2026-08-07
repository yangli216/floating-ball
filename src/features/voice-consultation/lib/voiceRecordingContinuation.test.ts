import { describe, expect, it } from 'vitest';
import appSource from '@/App.vue?raw';
import voiceCapsuleSource from '../ui/VoiceCapsule.vue?raw';
import {
  appendVoiceTranscript,
  mergeVoiceRecordingSegments,
} from './voiceRecordingContinuation';

function createPcmWav(samples: number[], sampleRate = 16000): Blob {
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return new Blob([output], { type: 'audio/wav' });
}

describe('voice recording continuation', () => {
  it('exposes a continue action from the stopped review state', () => {
    expect(voiceCapsuleSource).toContain('音频采集完成');
    expect(voiceCapsuleSource).toContain('继续采集');
    expect(voiceCapsuleSource).toContain('@click="handleContinue"');
    expect(voiceCapsuleSource).toContain('mergeVoiceRecordingSegments');
  });

  it('requires confirmation before abandoning to the App patient-capsule route', () => {
    expect(voiceCapsuleSource).toContain('确认放弃本次语音问诊？');
    expect(voiceCapsuleSource).toContain("emit('abandon')");
    expect(appSource).toContain('@abandon="abandonVoiceCapture"');
    expect(appSource).toContain('openReceptionCapsule(getCurrentReceptionWindowSize())');
  });

  it('keeps reviewed text before appending the next segment', () => {
    expect(appendVoiceTranscript('第一段已人工修正', '第二段补充')).toBe(
      '第一段已人工修正\n第二段补充',
    );
    expect(appendVoiceTranscript('', ' 第二段 ')).toBe('第二段');
  });

  it('merges PCM data into one playable WAV instead of concatenating RIFF files', async () => {
    const merged = await mergeVoiceRecordingSegments([
      createPcmWav([100, 200]),
      createPcmWav([-300, 400, 500]),
    ]);
    const view = new DataView(await merged.arrayBuffer());

    expect(merged.type).toBe('audio/wav');
    expect(view.getUint32(4, true)).toBe(46);
    expect(view.getUint32(40, true)).toBe(10);
    expect(Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true)))
      .toEqual([100, 200, -300, 400, 500]);
  });

  it('rejects segments recorded with incompatible sample rates', async () => {
    await expect(mergeVoiceRecordingSegments([
      createPcmWav([100], 16000),
      createPcmWav([200], 48000),
    ])).rejects.toThrow('采样格式不一致');
  });
});
