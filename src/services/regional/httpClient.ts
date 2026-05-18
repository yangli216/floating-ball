import { getActiveUpdateChannel } from '../updateConfig';
import {
  getCurrentClientVersion,
  isUpdateRequiredCode,
  notifyForceUpdateRequired,
} from '../updatePolicy';
import { signRequest, type SignatureHeaders } from '../requestSigner';
import { getDeviceCode } from './device';
import { getOrgCode, getRegionalBaseUrl } from './config';
import { parseRegionalError } from './errors';
import {
  clearDeviceRegistration,
  getDeviceToken,
  setRegionalInitialized,
} from './storage';
import type { ApiResponse } from './types';

type RegisterDeviceFn = () => Promise<unknown>;

let registerDeviceHandler: RegisterDeviceFn | null = null;

export function setRegisterDeviceHandler(handler: RegisterDeviceFn): void {
  registerDeviceHandler = handler;
}

async function ensureRegisteredDevice(): Promise<void> {
  if (!registerDeviceHandler) {
    throw new Error('区域化注册服务未初始化');
  }
  await registerDeviceHandler();
}

export async function regionalFetch<T>(
  path: string,
  options: RequestInit = {},
  allowAuthRetry = true
): Promise<T> {
  const baseUrl = getRegionalBaseUrl();
  if (!baseUrl) throw new Error('区域化服务地址未配置');

  await getDeviceCode();

  let token = getDeviceToken();
  if (!token && path !== '/v1/client/register') {
    await ensureRegisteredDevice();
    token = getDeviceToken();
  }
  const clientVersion = await getCurrentClientVersion();
  const updateChannel = getActiveUpdateChannel();

  let signatureHeaders: SignatureHeaders = {} as SignatureHeaders;
  if (path !== '/v1/client/register') {
    const body = options.body ? String(options.body) : undefined;
    signatureHeaders = await signRequest(options.method || 'GET', path, body);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getOrgCode(),
    'X-Request-Id': crypto.randomUUID(),
    'X-Client-Version': clientVersion,
    'X-Update-Channel': updateChannel,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...signatureHeaders,
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && allowAuthRetry && path !== '/v1/client/register') {
      clearDeviceRegistration();
      setRegionalInitialized(false);
      await ensureRegisteredDevice();
      return regionalFetch<T>(path, options, false);
    }
    const text = await res.text().catch(() => '');
    const errorInfo = parseRegionalError(text, `区域化服务请求失败（${res.status}）`);
    if (res.status === 426 || isUpdateRequiredCode(errorInfo.code)) {
      notifyForceUpdateRequired({
        channel: updateChannel,
        currentVersion: clientVersion,
        message: errorInfo.message,
      });
    }
    throw new Error(errorInfo.message);
  }

  const body: ApiResponse<T> = await res.json();
  if (body.code !== '0') {
    if (isUpdateRequiredCode(body.code)) {
      notifyForceUpdateRequired({
        channel: updateChannel,
        currentVersion: clientVersion,
        message: body.message,
      });
    }
    throw new Error(body.message || '区域化服务返回异常');
  }
  return body.data;
}

export async function regionalGet<T>(path: string): Promise<T> {
  return regionalFetch<T>(path);
}

export async function regionalPost<T>(path: string, body: unknown): Promise<T> {
  return regionalFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
