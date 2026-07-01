import { getStoredDeviceCode } from './device';
import {
  clearBootstrapCache,
  clearDeviceRegistration,
  readStorageValue,
  setRegionalInitialized,
  STORAGE_KEYS,
} from './storage';
import type { RegionalConnectionConfig } from './types';

export const DEFAULT_REGIONAL_BASE_URL = (
  import.meta.env.VITE_REGIONAL_BASE_URL
  || 'http://127.0.0.1:8080'
).trim().replace(/\/+$/, '');

// 机构编码默认回退 ORG001；仅保留本地构建覆盖入口，不依赖 GitHub Actions Repository Variables
export const DEFAULT_REGIONAL_ORG_CODE = (
  import.meta.env.VITE_REGIONAL_ORG_CODE
  || 'ORG001'
).trim();

const LEGACY_LOCAL_MODE_STORAGE_KEYS = [
  'REGIONAL_ENABLED',
  'OPENAI_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_FAST_MODEL',
  'LLM_AUDIO_BASE_URL',
  'LLM_AUDIO_MODEL',
  'LLM_ENABLE_THINKING',
  'REVIEWER_ENABLED',
  'REVIEWER_API_KEY',
  'REVIEWER_BASE_URL',
  'REVIEWER_MODEL',
  'REVIEWER_CHECK_EXAMINATION_ENABLED',
  'SPEECH_PROVIDER',
  'SPEECH_API_KEY',
  'SPEECH_BASE_URL',
  'SPEECH_MODEL',
  'DASHSCOPE_API_KEY',
  'PMPHAI_APP_KEY',
  'PMPHAI_APP_SECRET',
  'PMPHAI_ENABLED',
  'KB_APP_KEY',
  'KB_APP_SECRET',
  'KB_BASE_URL',
] as const;

let heartbeatStopper: (() => void) | null = null;

export function registerRegionalHeartbeatStopper(stopper: () => void): void {
  heartbeatStopper = stopper;
}

export function resetRegionalRuntime(clearRegistration = false): void {
  heartbeatStopper?.();
  setRegionalInitialized(false);
  clearBootstrapCache();
  if (clearRegistration) {
    clearDeviceRegistration();
  }
}

export function getRegionalBaseUrl(): string {
  return (
    readStorageValue(STORAGE_KEYS.REGIONAL_BASE_URL)
    || DEFAULT_REGIONAL_BASE_URL
  ).replace(/\/+$/, '');
}

export function getOrgCode(): string {
  return readStorageValue(STORAGE_KEYS.REGIONAL_ORG_CODE)
    || DEFAULT_REGIONAL_ORG_CODE;
}

export function getRegionalConnectionDefaults(): Pick<RegionalConnectionConfig, 'baseUrl' | 'orgCode'> {
  return {
    baseUrl: DEFAULT_REGIONAL_BASE_URL,
    orgCode: DEFAULT_REGIONAL_ORG_CODE,
  };
}

export function ensureRegionalConnectionDefaults(): void {
  for (const key of LEGACY_LOCAL_MODE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_BASE_URL)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_BASE_URL, DEFAULT_REGIONAL_BASE_URL);
  }
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_ORG_CODE)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_ORG_CODE, DEFAULT_REGIONAL_ORG_CODE);
  }
}

export function getRegionalConnectionConfig(): RegionalConnectionConfig {
  return {
    baseUrl: getRegionalBaseUrl(),
    orgCode: getOrgCode(),
    deviceCode: getStoredDeviceCode(),
  };
}

export function hasRegionalConnectionConfig(): boolean {
  const { baseUrl, orgCode } = getRegionalConnectionConfig();
  return Boolean(baseUrl && orgCode);
}

export function saveRegionalConnectionConfig(config: {
  baseUrl: string;
  orgCode: string;
}): void {
  const nextBaseUrl = (config.baseUrl || DEFAULT_REGIONAL_BASE_URL).trim().replace(/\/+$/, '');
  const nextOrgCode = (config.orgCode || DEFAULT_REGIONAL_ORG_CODE).trim();
  const currentBaseUrl = getRegionalBaseUrl();
  const currentOrgCode = getOrgCode();
  const endpointChanged = nextBaseUrl !== currentBaseUrl || nextOrgCode !== currentOrgCode;

  localStorage.setItem(STORAGE_KEYS.REGIONAL_BASE_URL, nextBaseUrl);
  localStorage.setItem(STORAGE_KEYS.REGIONAL_ORG_CODE, nextOrgCode);
  resetRegionalRuntime(endpointChanged);
}
