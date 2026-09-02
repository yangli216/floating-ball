import { describe, expect, it } from 'vitest';
import { resolveSimulatedVoiceTranscript } from './simulatedVoiceTranscript';

describe('resolveSimulatedVoiceTranscript', () => {
  it('accepts the exact active template request and transcript', () => {
    expect(resolveSimulatedVoiceTranscript({
      requestId: 'voice-template-1',
      transcript: '医生：哪里不舒服？患者：咳嗽三天。',
    }, 'voice-template-1')).toEqual({
      kind: 'ready',
      payload: {
        requestId: 'voice-template-1',
        transcript: '医生：哪里不舒服？患者：咳嗽三天。',
      },
    });
  });

  it.each([
    [{ requestId: 'voice-template-1', transcript: '对话', extra: true }, 'voice-template-1'],
    [{ requestId: 'voice-template-2', transcript: '对话' }, 'voice-template-1'],
    [{ requestId: 'voice-template-1', transcript: ' 对话' }, 'voice-template-1'],
    [{ requestId: 'voice-template-1', transcript: '对话 ' }, 'voice-template-1'],
    [{ requestId: 'voice-template-1', transcript: '' }, 'voice-template-1'],
    [{ requestId: 'voice-template-1', transcript: '对话' }, null],
  ])('rejects invalid or cross-session debug input', (payload, expectedRequestId) => {
    expect(resolveSimulatedVoiceTranscript(payload, expectedRequestId).kind).toBe('invalid');
  });
});
