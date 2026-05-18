import { loadOrGenerateKeyPair } from '../requestSigner';
import { getDeviceCode, registerDeviceHeartbeatStopper } from './device';
import {
  hasRegionalConnectionConfig,
  isRegionalMode,
  registerRegionalHeartbeatStopper,
  resetRegionalRuntime,
} from './config';
import { regionalFetch } from './httpClient';
import { registerDevice } from './registration';
import {
  clearDeviceRegistration,
  getCachedBootstrapMemory,
  getDeviceId,
  getDeviceToken,
  isRegionalInitialized,
  isUnauthorizedError,
  setCachedBootstrapMemory,
  setRegionalInitialized,
  STORAGE_KEYS,
} from './storage';
import type { BootstrapConfig, HeartbeatResponse } from './types';

const BOOTSTRAP_CACHE_TTL = 5 * 60 * 1000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export async function getBootstrapConfig(force = false): Promise<BootstrapConfig> {
  const cachedBootstrap = getCachedBootstrapMemory();
  if (!force && cachedBootstrap) {
    const cacheTime = Number(localStorage.getItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME) || '0');
    if (Date.now() - cacheTime < BOOTSTRAP_CACHE_TTL) {
      return cachedBootstrap;
    }
  }

  const config = await regionalFetch<BootstrapConfig>('/v1/client/bootstrap');

  setCachedBootstrapMemory(config);
  localStorage.setItem(STORAGE_KEYS.BOOTSTRAP_CACHE, JSON.stringify(config));
  localStorage.setItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME, String(Date.now()));

  console.log('[RegionalClient] Bootstrap config loaded:', {
    llmModel: config.llm.model,
    templateVersion: config.templateVersion,
    features: config.features,
  });

  return config;
}

export function getCachedBootstrap(): BootstrapConfig | null {
  const memoryValue = getCachedBootstrapMemory();
  if (memoryValue) return memoryValue;

  const cached = localStorage.getItem(STORAGE_KEYS.BOOTSTRAP_CACHE);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as BootstrapConfig;
      setCachedBootstrapMemory(parsed);
      return parsed;
    } catch { /* invalid cache */ }
  }
  return null;
}

function startHeartbeat(): void {
  stopHeartbeat();
  const interval = Number(localStorage.getItem(STORAGE_KEYS.HEARTBEAT_INTERVAL) || '30') * 1000;

  heartbeatTimer = setInterval(async () => {
    try {
      await regionalFetch<HeartbeatResponse>('/v1/client/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ idDevice: getDeviceId() }),
      });
    } catch (err) {
      console.warn('[RegionalClient] Heartbeat failed:', err);
    }
  }, interval);

  console.log(`[RegionalClient] Heartbeat started, interval=${interval}ms`);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

registerRegionalHeartbeatStopper(stopHeartbeat);
registerDeviceHeartbeatStopper(stopHeartbeat);

export async function initializeRegionalClient(options?: {
  allowCachedFallback?: boolean;
}): Promise<BootstrapConfig | null> {
  if (!isRegionalMode()) return null;
  if (!hasRegionalConnectionConfig()) {
    throw new Error('请先配置区域化服务地址和机构编码');
  }
  if (isRegionalInitialized()) return getCachedBootstrap();
  const allowCachedFallback = options?.allowCachedFallback !== false;

  try {
    await loadOrGenerateKeyPair();
    await getDeviceCode();
    const existingToken = getDeviceToken();
    if (!existingToken) {
      await registerDevice();
    }

    let config: BootstrapConfig;
    try {
      config = await getBootstrapConfig(true);
    } catch (error) {
      if (existingToken && isUnauthorizedError(error)) {
        clearDeviceRegistration();
        await registerDevice();
        config = await getBootstrapConfig(true);
      } else {
        throw error;
      }
    }

    startHeartbeat();
    setRegionalInitialized(true);
    return config;
  } catch (err) {
    console.error('[RegionalClient] Initialization failed, falling back to local mode:', err);
    if (allowCachedFallback) {
      return getCachedBootstrap();
    }
    throw err;
  }
}

export function shutdownRegionalClient(): void {
  resetRegionalRuntime(false);
}
