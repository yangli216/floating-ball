import { invoke } from '@tauri-apps/api/core';
import {
  readPersistentString,
  writePersistentString,
} from '../persistentStore';
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

export async function rotateFallbackDeviceCode(): Promise<string> {
  macLookupUnavailable = true;
  deviceCodeLoadPromise = null;
  return persistDeviceCode(generateFallbackDeviceCode());
}

function persistDeviceCodeLocally(nextCode: string): string {
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

async function mirrorDeviceCodeToPersistentStore(code: string): Promise<void> {
  try {
    await writePersistentString(STORAGE_KEYS.DEVICE_CODE, code);
  } catch (error) {
    console.warn('[RegionalClient] Failed to persist device code to Tauri store.', error);
  }
}

async function readPersistentDeviceCode(): Promise<string> {
  try {
    const stored = await readPersistentString(STORAGE_KEYS.DEVICE_CODE);
    return stored ? normalizeDeviceCode(stored) : '';
  } catch (error) {
    console.warn('[RegionalClient] Failed to read device code from Tauri store.', error);
    return '';
  }
}

async function persistDeviceCode(nextCode: string): Promise<string> {
  const normalizedCode = persistDeviceCodeLocally(nextCode);
  if (normalizedCode) {
    await mirrorDeviceCodeToPersistentStore(normalizedCode);
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
      await mirrorDeviceCodeToPersistentStore(storedCode);
      return storedCode;
    }

    const persistentCode = await readPersistentDeviceCode();
    if (persistentCode) {
      return persistDeviceCode(persistentCode);
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
