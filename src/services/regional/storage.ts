import type { BootstrapConfig } from './types';

export const STORAGE_KEYS = {
  REGIONAL_ENABLED: 'REGIONAL_ENABLED',
  REGIONAL_BASE_URL: 'REGIONAL_BASE_URL',
  REGIONAL_ORG_CODE: 'REGIONAL_ORG_CODE',
  DEVICE_CODE: 'REGIONAL_DEVICE_CODE',
  DEVICE_TOKEN: 'REGIONAL_DEVICE_TOKEN',
  DEVICE_ID: 'REGIONAL_DEVICE_ID',
  HEARTBEAT_INTERVAL: 'REGIONAL_HEARTBEAT_INTERVAL',
  BOOTSTRAP_CACHE: 'REGIONAL_BOOTSTRAP_CACHE',
  BOOTSTRAP_CACHE_TIME: 'REGIONAL_BOOTSTRAP_CACHE_TIME',
} as const;

let cachedBootstrap: BootstrapConfig | null = null;
let initialized = false;

export function readStorageValue(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw == null) {
    return null;
  }
  const text = raw.trim();
  return text ? text : null;
}

export function clearBootstrapCache(): void {
  cachedBootstrap = null;
  localStorage.removeItem(STORAGE_KEYS.BOOTSTRAP_CACHE);
  localStorage.removeItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME);
}

export function getCachedBootstrapMemory(): BootstrapConfig | null {
  return cachedBootstrap;
}

export function setCachedBootstrapMemory(config: BootstrapConfig | null): void {
  cachedBootstrap = config;
}

export function isRegionalInitialized(): boolean {
  return initialized;
}

export function setRegionalInitialized(nextValue: boolean): void {
  initialized = nextValue;
}

export function clearDeviceRegistration(): void {
  localStorage.removeItem(STORAGE_KEYS.DEVICE_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.DEVICE_ID);
  localStorage.removeItem(STORAGE_KEYS.HEARTBEAT_INTERVAL);
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
}

export function getDeviceId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

export function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('AUTH-401') || /\b401\b/.test(message);
}
