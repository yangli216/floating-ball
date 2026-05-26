import { getActiveUpdateChannel } from '../updateConfig';
import {
  getCurrentClientVersion,
  isUpdateRequiredCode,
  notifyForceUpdateRequired,
} from '../updatePolicy';
import { signRequest, signWebSocketParams, updateSignatureClockOffset } from '../requestSigner';
import { getOrgCode, getRegionalBaseUrl } from './config';
import { getDeviceCode } from './device';
import {
  createRegionalRequestError,
  parseRegionalError,
  parseUnexpectedSseBody,
  extractSseDataPayload,
} from './errors';
import { registerDevice } from './registration';
import { restoreCachedDeviceRegistration } from './registrationCache';
import {
  clearDeviceRegistration,
  getDeviceToken,
  setRegionalInitialized,
} from './storage';

export async function createRegionalWebSocketUrl(path: string): Promise<string> {
  const baseUrl = getRegionalBaseUrl();
  if (!baseUrl) throw new Error('区域化服务地址未配置');

  const deviceCode = await getDeviceCode();
  let token = getDeviceToken();
  if (!token) {
    await restoreCachedDeviceRegistration(deviceCode);
    token = getDeviceToken();
  }
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
  const run = async (allowAuthRetry: boolean, allowClockRetry: boolean): Promise<void> => {
    const baseUrl = getRegionalBaseUrl();
    if (!baseUrl) throw new Error('区域化服务地址未配置');
    const deviceCode = await getDeviceCode();
    let token = getDeviceToken();
    if (!token) {
      await restoreCachedDeviceRegistration(deviceCode);
      token = getDeviceToken();
    }
    if (!token) {
      await registerDevice();
      token = getDeviceToken();
    }

    return new Promise(async (resolve, reject) => {
      try {
        const clientVersion = await getCurrentClientVersion();
        const updateChannel = getActiveUpdateChannel();
        const requestId = crypto.randomUUID();

        const bodyStr = JSON.stringify(body);
        const signatureHeaders = await signRequest('POST', path, bodyStr);

        let res: Response;
        try {
          res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Id': getOrgCode(),
              'X-Request-Id': requestId,
              'X-Client-Version': clientVersion,
              'X-Update-Channel': updateChannel,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...signatureHeaders,
            },
            body: bodyStr,
            signal,
          });
        } catch (error) {
          reject(createRegionalRequestError(
            { message: error instanceof Error ? error.message : String(error) },
            '区域化流式服务暂时无法连接，请检查后台服务地址和网络后重试',
            undefined,
            requestId
          ));
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const errorInfo = parseRegionalError(text, `区域化流式请求失败（${res.status}）`);
          if (
            res.status === 401
            && errorInfo.code === 'SIG-401'
            && allowClockRetry
            && updateSignatureClockOffset(errorInfo.timestamp)
          ) {
            try {
              await run(allowAuthRetry, false);
              resolve();
            } catch (retryError) {
              reject(retryError);
            }
            return;
          }
          if (res.status === 401 && allowAuthRetry) {
            clearDeviceRegistration();
            setRegionalInitialized(false);
            await registerDevice();
            try {
              await run(false, allowClockRetry);
              resolve();
            } catch (retryError) {
              reject(retryError);
            }
            return;
          }
          if (res.status === 426 || isUpdateRequiredCode(errorInfo.code)) {
            notifyForceUpdateRequired({
              channel: updateChannel,
              currentVersion: clientVersion,
              message: errorInfo.message,
            });
          }
          reject(createRegionalRequestError(errorInfo, `区域化流式请求失败（${res.status}）`, res.status, requestId));
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          const text = await res.text().catch(() => '');
          reject(createRegionalRequestError(
            { message: parseUnexpectedSseBody(text, '区域化服务返回了非流式响应') },
            '区域化服务返回内容格式异常',
            res.status,
            requestId
          ));
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
                reject(createRegionalRequestError(
                  { message: errorMessage.trim() },
                  'AI 流式响应失败',
                  res.status,
                  requestId
                ));
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
        reject(createRegionalRequestError(
          { message: parseUnexpectedSseBody(buffer, 'AI 服务响应已中断，请检查后台 AI 配置后重试') },
          'AI 服务响应已中断，请检查后台 AI 配置后重试',
          res.status,
          requestId
        ));
      } catch (err) {
        reject(err);
      }
    });
  };

  return run(true, true);
}
