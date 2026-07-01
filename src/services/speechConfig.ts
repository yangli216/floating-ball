import { getCachedBootstrap } from './regionalClient';

export type SpeechProvider = 'aliyun-dashscope' | 'openai-compatible';

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
  return raw === 'openai-compatible' ? 'openai-compatible' : 'aliyun-dashscope';
}

export function getSpeechConfig(): SpeechConfig {
  const bootstrap = getCachedBootstrap();
  const provider = normalizeSpeechProvider(bootstrap?.speech?.provider);
  return {
    provider,
    model: bootstrap?.speech?.model
      || (provider === 'openai-compatible'
        ? bootstrap?.llm?.audioModel || 'whisper-1'
        : DEFAULT_SPEECH_CONFIG.model),
    sampleRate: DEFAULT_SPEECH_CONFIG.sampleRate,
    format: DEFAULT_SPEECH_CONFIG.format,
  };
}
