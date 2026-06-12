export interface FetchTimeoutOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
}

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function createAbortTimeoutError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function getSignalReason(signal: AbortSignal): unknown {
  return (signal as AbortSignal & { reason?: unknown }).reason;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const callerSignal = init.signal;
  const timeoutMessage = options.timeoutMessage || `请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`;
  let timeoutReached = false;

  const abortFromCaller = () => {
    controller.abort(callerSignal ? getSignalReason(callerSignal) : undefined);
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else if (callerSignal) {
    callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    timeoutReached = true;
    controller.abort(createAbortTimeoutError(timeoutMessage));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timeoutReached) {
      throw createAbortTimeoutError(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  }
}
