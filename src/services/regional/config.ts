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

export const DEFAULT_REGIONAL_ENABLED = !['false', '0', 'off'].includes(
  String(import.meta.env.VITE_REGIONAL_ENABLED ?? 'true').trim().toLowerCase()
);

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

export function isRegionalMode(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.REGIONAL_ENABLED);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return DEFAULT_REGIONAL_ENABLED;
}

export function setRegionalMode(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.REGIONAL_ENABLED, enabled ? 'true' : 'false');
  if (!enabled) {
    resetRegionalRuntime(false);
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

export function getRegionalConnectionDefaults(): Pick<RegionalConnectionConfig, 'enabled' | 'baseUrl' | 'orgCode'> {
  return {
    enabled: DEFAULT_REGIONAL_ENABLED,
    baseUrl: DEFAULT_REGIONAL_BASE_URL,
    orgCode: DEFAULT_REGIONAL_ORG_CODE,
  };
}

export function ensureRegionalConnectionDefaults(): void {
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_BASE_URL)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_BASE_URL, DEFAULT_REGIONAL_BASE_URL);
  }
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_ORG_CODE)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_ORG_CODE, DEFAULT_REGIONAL_ORG_CODE);
  }
  const enabledValue = localStorage.getItem(STORAGE_KEYS.REGIONAL_ENABLED);
  if (enabledValue !== 'true' && enabledValue !== 'false') {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_ENABLED, DEFAULT_REGIONAL_ENABLED ? 'true' : 'false');
  }
}

export function getRegionalConnectionConfig(): RegionalConnectionConfig {
  return {
    enabled: isRegionalMode(),
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
  enabled: boolean;
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
  setRegionalMode(config.enabled);

  if (config.enabled) {
    resetRegionalRuntime(endpointChanged);
  }
}
