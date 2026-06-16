import { getActiveUpdateChannel } from '../updateConfig';
import { getCurrentClientVersion } from '../updatePolicy';
import { loadOrGenerateKeyPair } from '../requestSigner';
import { getOrgCode } from './config';
import { getDeviceCode, rotateFallbackDeviceCode } from './device';
import { regionalFetch, setRegisterDeviceHandler } from './httpClient';
import { cacheDeviceRegistration } from './registrationCache';
import { setDeviceToken, STORAGE_KEYS } from './storage';
import type { RegisterRequest, RegisterResponse } from './types';

export async function registerDevice(): Promise<RegisterResponse> {
  return registerDeviceInternal(undefined);
}

export async function refreshDeviceRegistrationWithToken(deviceToken: string | undefined): Promise<RegisterResponse> {
  return registerDeviceInternal(deviceToken);
}

async function registerDeviceInternal(deviceToken: string | undefined): Promise<RegisterResponse> {
  const orgCode = getOrgCode();
  if (!orgCode) {
    throw new Error('区域化机构编码未配置');
  }
  const cdDevice = await getDeviceCode();
  return registerDeviceWithCode(cdDevice, !deviceToken, deviceToken);
}

async function registerDeviceWithCode(
  cdDevice: string,
  allowFallbackDeviceCodeRetry: boolean,
  deviceTokenProof: string | undefined
): Promise<RegisterResponse> {
  const orgCode = getOrgCode();
  let naDevice = 'FloatingBall';
  let osInfo = 'unknown';
  const clientVersion = await getCurrentClientVersion();
  const updateChannel = getActiveUpdateChannel();

  try {
    osInfo = `${navigator.platform} ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || ''}`.trim();
    naDevice = `FloatingBall-${navigator.platform}`;
  } catch { /* ignore */ }

  const { publicKeyBase64 } = await loadOrGenerateKeyPair();

  let resp: RegisterResponse;
  try {
    resp = await regionalFetch<RegisterResponse>('/v1/client/register', {
      method: 'POST',
      body: JSON.stringify({
        cdDevice,
        naDevice,
        cdOrg: orgCode,
        clientVersion,
        updateChannel,
        osInfo,
        publicKey: publicKeyBase64,
      } satisfies RegisterRequest),
      ...(deviceTokenProof
        ? { headers: { Authorization: `Bearer ${deviceTokenProof}` } }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    if (
      allowFallbackDeviceCodeRetry
      && errorCode !== 'DEVICE-KEY-ROTATION-UNAUTHORIZED'
      && message.includes('设备已注册')
    ) {
      const fallbackCode = await rotateFallbackDeviceCode();
      console.warn('[RegionalClient] Device code already registered, retrying with fallback device code.');
      return registerDeviceWithCode(fallbackCode, false, undefined);
    }
    throw error;
  }

  setDeviceToken(resp.deviceToken);
  localStorage.setItem(STORAGE_KEYS.DEVICE_ID, resp.idDevice);
  localStorage.setItem(STORAGE_KEYS.HEARTBEAT_INTERVAL, String(resp.heartbeatInterval));
  await cacheDeviceRegistration({
    deviceCode: cdDevice,
    deviceToken: resp.deviceToken,
    idDevice: resp.idDevice,
    heartbeatInterval: resp.heartbeatInterval,
  });

  console.log(`[RegionalClient] Device registered: ${resp.idDevice}`);
  return resp;
}

setRegisterDeviceHandler(registerDeviceInternal);
