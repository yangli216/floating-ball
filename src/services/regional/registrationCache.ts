import {
  readPersistentString,
  writePersistentString,
} from '../persistentStore';
import { getOrgCode, getRegionalBaseUrl } from './config';
import {
  getDeviceId,
  getDeviceToken,
  setDeviceToken,
  STORAGE_KEYS,
} from './storage';

interface RegistrationCacheRecord {
  baseUrl: string;
  orgCode: string;
  deviceCode: string;
  deviceToken: string;
  idDevice: string;
  heartbeatInterval: string;
  updatedAt: number;
}

type RegistrationCacheMap = Record<string, RegistrationCacheRecord>;

const REGISTRATION_CACHE_STORE_KEY = 'REGIONAL_DEVICE_REGISTRATION_CACHE_V1';
const MAX_REGISTRATION_CACHE_RECORDS = 20;

function normalizeScopePart(value: string): string {
  return value.trim();
}

function normalizeDeviceCode(value: string): string {
  return normalizeScopePart(value).toUpperCase();
}

function getRegistrationCacheScope(input: {
  baseUrl?: string;
  orgCode?: string;
  deviceCode: string;
}): string {
  return JSON.stringify([
    normalizeScopePart(input.baseUrl || getRegionalBaseUrl()).replace(/\/+$/, ''),
    normalizeScopePart(input.orgCode || getOrgCode()),
    normalizeDeviceCode(input.deviceCode),
  ]);
}

function normalizeHeartbeatInterval(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : '30';
}

function isUsableRecord(value: RegistrationCacheRecord | undefined): value is RegistrationCacheRecord {
  return Boolean(
    value?.deviceToken
    && value.idDevice
    && value.deviceCode
  );
}

async function readRegistrationCacheMap(): Promise<RegistrationCacheMap> {
  const raw = await readPersistentString(REGISTRATION_CACHE_STORE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as RegistrationCacheMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeRegistrationCacheMap(cache: RegistrationCacheMap): Promise<void> {
  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, MAX_REGISTRATION_CACHE_RECORDS);

  await writePersistentString(REGISTRATION_CACHE_STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export async function restoreCachedDeviceRegistration(deviceCode: string): Promise<boolean> {
  try {
    const cache = await readRegistrationCacheMap();
    const record = cache[getRegistrationCacheScope({ deviceCode })];

    if (!isUsableRecord(record)) {
      return false;
    }

    localStorage.setItem(STORAGE_KEYS.DEVICE_CODE, normalizeDeviceCode(record.deviceCode));
    setDeviceToken(record.deviceToken);
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, record.idDevice);
    localStorage.setItem(STORAGE_KEYS.HEARTBEAT_INTERVAL, normalizeHeartbeatInterval(record.heartbeatInterval));
    return true;
  } catch (error) {
    console.warn('[RegionalClient] Failed to restore cached device registration.', error);
    return false;
  }
}

export async function cacheDeviceRegistration(input: {
  deviceCode: string;
  deviceToken: string;
  idDevice: string;
  heartbeatInterval: number | string;
}): Promise<void> {
  try {
    const cache = await readRegistrationCacheMap();
    const deviceCode = normalizeDeviceCode(input.deviceCode);
    const scope = getRegistrationCacheScope({ deviceCode });

    cache[scope] = {
      baseUrl: getRegionalBaseUrl(),
      orgCode: getOrgCode(),
      deviceCode,
      deviceToken: input.deviceToken,
      idDevice: input.idDevice,
      heartbeatInterval: normalizeHeartbeatInterval(input.heartbeatInterval),
      updatedAt: Date.now(),
    };

    await writeRegistrationCacheMap(cache);
  } catch (error) {
    console.warn('[RegionalClient] Failed to cache device registration.', error);
  }
}

export async function cacheCurrentDeviceRegistration(deviceCode: string): Promise<void> {
  const deviceToken = getDeviceToken();
  const idDevice = getDeviceId();
  const heartbeatInterval = localStorage.getItem(STORAGE_KEYS.HEARTBEAT_INTERVAL) || '30';

  if (!deviceToken || !idDevice) {
    return;
  }

  await cacheDeviceRegistration({
    deviceCode,
    deviceToken,
    idDevice,
    heartbeatInterval,
  });
}
