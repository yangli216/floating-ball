import { invoke } from '@tauri-apps/api/core';
import {
  clearDeviceRegistration,
  readStorageValue,
  setRegionalInitialized,
  STORAGE_KEYS,
} from './storage';

let deviceCodeLoadPromise: Promise<string> | null = null;
let macLookupUnavailable = false;
let heartbeatStopper: (() => void) | null = null;

export function registerDeviceHeartbeatStopper(stopper: () => void): void {
  heartbeatStopper = stopper;
}

export function getStoredDeviceCode(): string {
  return readStorageValue(STORAGE_KEYS.DEVICE_CODE) || '';
}

function normalizeDeviceCode(code: string): string {
  const trimmedCode = code.trim().toUpperCase();
  if (/^[0-9A-F]{2}([:-][0-9A-F]{2}){5}$/.test(trimmedCode)) {
    return trimmedCode.replace(/-/g, ':');
  }
  return trimmedCode;
}

function generateFallbackDeviceCode(): string {
  return `FB-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
}

export function rotateFallbackDeviceCode(): string {
  macLookupUnavailable = true;
  deviceCodeLoadPromise = null;
  return persistDeviceCode(generateFallbackDeviceCode());
}

function persistDeviceCode(nextCode: string): string {
  const normalizedCode = normalizeDeviceCode(nextCode);
  if (!normalizedCode) {
    return '';
  }

  const previousCode = getStoredDeviceCode();
  if (previousCode !== normalizedCode) {
    localStorage.setItem(STORAGE_KEYS.DEVICE_CODE, normalizedCode);
    if (previousCode) {
      heartbeatStopper?.();
      setRegionalInitialized(false);
      clearDeviceRegistration();
    }
  }

  return normalizedCode;
}

async function detectDeviceMacAddress(): Promise<string | null> {
  if (macLookupUnavailable) {
    return null;
  }

  try {
    const deviceMac = normalizeDeviceCode(await invoke<string>('get_device_mac_address'));
    return deviceMac || null;
  } catch (error) {
    macLookupUnavailable = true;
    console.warn('[RegionalClient] Failed to detect device MAC address, using fallback device code.', error);
    return null;
  }
}

export async function getDeviceCode(): Promise<string> {
  if (deviceCodeLoadPromise) {
    return deviceCodeLoadPromise;
  }

  deviceCodeLoadPromise = (async () => {
    const storedCode = getStoredDeviceCode();
    if (storedCode) {
      return storedCode;
    }

    const deviceMac = await detectDeviceMacAddress();

    if (deviceMac) {
      return persistDeviceCode(deviceMac);
    }

    return persistDeviceCode(generateFallbackDeviceCode());
  })();

  try {
    return await deviceCodeLoadPromise;
  } finally {
    deviceCodeLoadPromise = null;
  }
}
