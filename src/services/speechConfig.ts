import { getCachedBootstrap } from './regionalClient';

export type SpeechProvider = 'aliyun-dashscope' | 'openai-compatible' | 'funasr-websocket';

export interface SpeechConfig {
  provider: SpeechProvider;
  model: string;
  sampleRate: number;
  format: string;
}

export const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  provider: 'aliyun-dashscope',
  model: 'paraformer-realtime-v2',
  sampleRate: 16000,
  format: 'pcm',
};

function normalizeSpeechProvider(raw?: string | null): SpeechProvider {
  if (raw === 'openai-compatible') return 'openai-compatible';
  if (raw === 'funasr-websocket' || raw === 'funasr') return 'funasr-websocket';
  return 'aliyun-dashscope';
}

export function supportsRealtimeSpeech(provider: SpeechProvider): boolean {
  return provider === 'aliyun-dashscope' || provider === 'funasr-websocket';
}

export function getSpeechConfig(): SpeechConfig {
  const bootstrap = getCachedBootstrap();
  const provider = normalizeSpeechProvider(bootstrap?.speech?.provider);
  return {
    provider,
    model: bootstrap?.speech?.model
      || (provider === 'openai-compatible'
        ? bootstrap?.llm?.audioModel || 'whisper-1'
        : provider === 'funasr-websocket'
          ? 'funasr-2pass'
          : DEFAULT_SPEECH_CONFIG.model),
    sampleRate: DEFAULT_SPEECH_CONFIG.sampleRate,
    format: DEFAULT_SPEECH_CONFIG.format,
  };
}
