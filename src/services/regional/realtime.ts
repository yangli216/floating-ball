import { getActiveUpdateChannel } from '../updateConfig';
import {
  getCurrentClientVersion,
  isUpdateRequiredCode,
  notifyForceUpdateRequired,
} from '../updatePolicy';
import { signRequest, signWebSocketParams } from '../requestSigner';
import { getOrgCode, getRegionalBaseUrl } from './config';
import { getDeviceCode } from './device';
import { parseRegionalError, parseUnexpectedSseBody, extractSseDataPayload } from './errors';
import { registerDevice } from './registration';
import {
  clearDeviceRegistration,
  getDeviceToken,
  setRegionalInitialized,
} from './storage';

export async function createRegionalWebSocketUrl(path: string): Promise<string> {
  const baseUrl = getRegionalBaseUrl();
  if (!baseUrl) throw new Error('区域化服务地址未配置');

  await getDeviceCode();
  let token = getDeviceToken();
  if (!token) {
    await registerDevice();
    token = getDeviceToken();
  }
  if (!token) {
    throw new Error('区域化设备令牌未初始化');
  }

  const url = new URL(path, `${baseUrl}/`);
  url.protocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  url.searchParams.set('clientVersion', await getCurrentClientVersion());
  url.searchParams.set('updateChannel', getActiveUpdateChannel());

  const sigParams = await signWebSocketParams(path);
  url.searchParams.set('ts', sigParams.ts);
  url.searchParams.set('nonce', sigParams.nonce);
  url.searchParams.set('sig', sigParams.sig);

  return url.toString();
}

export function createRegionalSSE(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const run = async (allowAuthRetry: boolean): Promise<void> => {
    const baseUrl = getRegionalBaseUrl();
    if (!baseUrl) throw new Error('区域化服务地址未配置');
    await getDeviceCode();
    let token = getDeviceToken();
    if (!token) {
      await registerDevice();
      token = getDeviceToken();
    }

    return new Promise(async (resolve, reject) => {
      try {
        const clientVersion = await getCurrentClientVersion();
        const updateChannel = getActiveUpdateChannel();

        const bodyStr = JSON.stringify(body);
        const signatureHeaders = await signRequest('POST', path, bodyStr);

        const res = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': getOrgCode(),
            'X-Request-Id': crypto.randomUUID(),
            'X-Client-Version': clientVersion,
            'X-Update-Channel': updateChannel,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...signatureHeaders,
          },
          body: bodyStr,
          signal,
        });

        if (!res.ok) {
          if (res.status === 401 && allowAuthRetry) {
            clearDeviceRegistration();
            setRegionalInitialized(false);
            await registerDevice();
            try {
              await run(false);
              resolve();
            } catch (retryError) {
              reject(retryError);
            }
            return;
          }
          const text = await res.text().catch(() => '');
          const errorInfo = parseRegionalError(text, `区域化流式请求失败（${res.status}）`);
          if (res.status === 426 || isUpdateRequiredCode(errorInfo.code)) {
            notifyForceUpdateRequired({
              channel: updateChannel,
              currentVersion: clientVersion,
              message: errorInfo.message,
            });
          }
          reject(new Error(errorInfo.message));
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          const text = await res.text().catch(() => '');
          reject(new Error(parseUnexpectedSseBody(text, '区域化服务返回了非流式响应')));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          reject(new Error('无法获取流式响应'));
          return;
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let receivedDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const dataStr = extractSseDataPayload(trimmed);
            if (dataStr == null) continue;
            if (dataStr === '[DONE]') {
              receivedDone = true;
              resolve();
              return;
            }
            try {
              const json = JSON.parse(dataStr);
              const errorMessage = json?.error?.message || json?.message;
              if (typeof errorMessage === 'string' && errorMessage.trim()) {
                reject(new Error(errorMessage.trim()));
                return;
              }
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) onChunk(content);
            } catch { /* skip malformed SSE */ }
          }
        }
        if (receivedDone) {
          resolve();
          return;
        }
        reject(new Error(parseUnexpectedSseBody(buffer, 'AI 服务响应已中断，请检查后台 AI 配置后重试')));
      } catch (err) {
        reject(err);
      }
    });
  };

  return run(true);
}
