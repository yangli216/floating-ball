import { getCachedBootstrap, isRegionalMode } from './regionalClient';

export type SpeechProvider = 'aliyun-dashscope' | 'openai-compatible';

export interface SpeechConfig {
  provider: SpeechProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  sampleRate: number;
  format: string;
}

export const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  provider: 'aliyun-dashscope',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'paraformer-realtime-v2',
  sampleRate: 16000,
  format: 'pcm',
};

const SPEECH_PROVIDER_STORAGE_KEY = 'SPEECH_PROVIDER';
const SPEECH_API_KEY_STORAGE_KEY = 'SPEECH_API_KEY';
const SPEECH_BASE_URL_STORAGE_KEY = 'SPEECH_BASE_URL';
const SPEECH_MODEL_STORAGE_KEY = 'SPEECH_MODEL';

function normalizeSpeechProvider(raw?: string | null): SpeechProvider {
  if (raw === 'openai-compatible' || raw === 'whisper') {
    return 'openai-compatible';
  }

  if (raw === 'aliyun-dashscope' || raw === 'dashscope') {
    return 'aliyun-dashscope';
  }

  return DEFAULT_SPEECH_CONFIG.provider;
}

function hasLegacyAliyunSpeechKey(): boolean {
  if (typeof localStorage === 'undefined') {
    return Boolean(import.meta.env.VITE_DASHSCOPE_API_KEY);
  }

  return Boolean(
    localStorage.getItem('DASHSCOPE_API_KEY')
    || import.meta.env.VITE_DASHSCOPE_API_KEY
  );
}

function hasLegacyOpenAICompatibleSpeechConfig(): boolean {
  if (typeof localStorage === 'undefined') {
    return Boolean(
      import.meta.env.VITE_LLM_AUDIO_BASE_URL
      || import.meta.env.VITE_LLM_AUDIO_MODEL
      || import.meta.env.VITE_OPENAI_API_KEY
      || import.meta.env.VITE_LLM_BASE_URL
    );
  }

  return Boolean(
    localStorage.getItem('LLM_AUDIO_BASE_URL')
    || localStorage.getItem('LLM_AUDIO_MODEL')
    || localStorage.getItem('OPENAI_API_KEY')
    || localStorage.getItem('LLM_BASE_URL')
    || import.meta.env.VITE_LLM_AUDIO_BASE_URL
    || import.meta.env.VITE_LLM_AUDIO_MODEL
    || import.meta.env.VITE_OPENAI_API_KEY
    || import.meta.env.VITE_LLM_BASE_URL
  );
}

function inferSpeechProvider(): SpeechProvider {
  if (typeof localStorage !== 'undefined') {
    const explicitProvider = localStorage.getItem(SPEECH_PROVIDER_STORAGE_KEY);
    if (explicitProvider) {
      return normalizeSpeechProvider(explicitProvider);
    }
  }

  const envProvider = import.meta.env.VITE_SPEECH_PROVIDER;
  if (envProvider) {
    return normalizeSpeechProvider(envProvider);
  }

  if (hasLegacyAliyunSpeechKey()) {
    return 'aliyun-dashscope';
  }

  if (hasLegacyOpenAICompatibleSpeechConfig()) {
    return 'openai-compatible';
  }

  return DEFAULT_SPEECH_CONFIG.provider;
}

function getSpeechStorageValue(key: string): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  return localStorage.getItem(key)?.trim() || '';
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function getLocalSpeechConfig(): SpeechConfig {
  const provider = inferSpeechProvider();
  const apiKey = (
    getSpeechStorageValue(SPEECH_API_KEY_STORAGE_KEY)
    || import.meta.env.VITE_SPEECH_API_KEY
    || (provider === 'aliyun-dashscope'
      ? getSpeechStorageValue('DASHSCOPE_API_KEY') || import.meta.env.VITE_DASHSCOPE_API_KEY || ''
      : getSpeechStorageValue('OPENAI_API_KEY') || import.meta.env.VITE_OPENAI_API_KEY || '')
  ).trim();

  const baseUrl = trimTrailingSlash(
    getSpeechStorageValue(SPEECH_BASE_URL_STORAGE_KEY)
    || import.meta.env.VITE_SPEECH_BASE_URL
    || getSpeechStorageValue('LLM_AUDIO_BASE_URL')
    || import.meta.env.VITE_LLM_AUDIO_BASE_URL
    || getSpeechStorageValue('LLM_BASE_URL')
    || import.meta.env.VITE_LLM_BASE_URL
    || DEFAULT_SPEECH_CONFIG.baseUrl
  );

  const model = (
    getSpeechStorageValue(SPEECH_MODEL_STORAGE_KEY)
    || import.meta.env.VITE_SPEECH_MODEL
    || (provider === 'openai-compatible'
      ? (
          getSpeechStorageValue('LLM_AUDIO_MODEL')
          || import.meta.env.VITE_LLM_AUDIO_MODEL
          || 'whisper-1'
        )
      : DEFAULT_SPEECH_CONFIG.model)
  ).trim();

  return {
    provider,
    apiKey,
    baseUrl,
    model: model || (provider === 'openai-compatible' ? 'whisper-1' : DEFAULT_SPEECH_CONFIG.model),
    sampleRate: DEFAULT_SPEECH_CONFIG.sampleRate,
    format: DEFAULT_SPEECH_CONFIG.format,
  };
}

function getRegionalSpeechConfig(): SpeechConfig {
  const bootstrap = getCachedBootstrap();
  const provider = normalizeSpeechProvider(bootstrap?.speech?.provider);

  return {
    provider,
    apiKey: '__REGIONAL_PROXY__',
    baseUrl: trimTrailingSlash(
      bootstrap?.llm?.audioBaseUrl
      || bootstrap?.llm?.baseUrl
      || DEFAULT_SPEECH_CONFIG.baseUrl
    ),
    model: bootstrap?.speech?.model
      || (provider === 'openai-compatible'
        ? bootstrap?.llm?.audioModel || 'whisper-1'
        : DEFAULT_SPEECH_CONFIG.model),
    sampleRate: DEFAULT_SPEECH_CONFIG.sampleRate,
    format: DEFAULT_SPEECH_CONFIG.format,
  };
}

export function getSpeechConfig(): SpeechConfig {
  if (isRegionalMode()) {
    return getRegionalSpeechConfig();
  }

  return getLocalSpeechConfig();
}

export function getSpeechConfigStorageKeys() {
  return {
    provider: SPEECH_PROVIDER_STORAGE_KEY,
    apiKey: SPEECH_API_KEY_STORAGE_KEY,
    baseUrl: SPEECH_BASE_URL_STORAGE_KEY,
    model: SPEECH_MODEL_STORAGE_KEY,
  };
}

export function getSpeechProviderOptions(): Array<{ value: SpeechProvider; label: string; description: string }> {
  return [
    {
      value: 'aliyun-dashscope',
      label: '阿里云 DashScope',
      description: '语音接诊优先使用实时识别，适合当前问诊主链路',
    },
    {
      value: 'openai-compatible',
      label: 'OpenAI 兼容接口',
      description: '统一走批量音频转写，适合作为兼容兜底通道',
    },
  ];
}
