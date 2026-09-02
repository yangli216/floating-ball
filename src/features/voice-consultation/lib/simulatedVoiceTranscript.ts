const MAX_SIMULATED_VOICE_TRANSCRIPT_LENGTH = 20_000;

export interface SimulatedVoiceTranscriptPayload {
  requestId: string;
  transcript: string;
}

export type SimulatedVoiceTranscriptResolution =
  | { kind: 'ready'; payload: SimulatedVoiceTranscriptPayload }
  | { kind: 'invalid'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isExactNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/**
 * Validate the debug-only transcript injection event without correcting any
 * caller value. The request ID must stay anchored to the active dynamic
 * outpatient template workflow so an old test run cannot affect a new visit.
 */
export function resolveSimulatedVoiceTranscript(
  value: unknown,
  expectedRequestId: string | null | undefined,
): SimulatedVoiceTranscriptResolution {
  if (!isRecord(value) || Object.keys(value).length !== 2) {
    return { kind: 'invalid', message: '模拟语音转写只接受 requestId 和 transcript。' };
  }
  if (!isExactNonEmptyString(expectedRequestId)) {
    return { kind: 'invalid', message: '当前没有可接收模拟转写的动态门诊模板语音会话。' };
  }
  if (!isExactNonEmptyString(value.requestId) || value.requestId !== expectedRequestId) {
    return { kind: 'invalid', message: '模拟语音转写 requestId 与当前模板会话不一致。' };
  }
  if (
    !isExactNonEmptyString(value.transcript)
    || value.transcript.length > MAX_SIMULATED_VOICE_TRANSCRIPT_LENGTH
  ) {
    return { kind: 'invalid', message: '模拟语音转写必须是 1–20000 字且无首尾空白的文本。' };
  }
  return {
    kind: 'ready',
    payload: {
      requestId: value.requestId,
      transcript: value.transcript,
    },
  };
}
