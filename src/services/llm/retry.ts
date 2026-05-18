import { DEFAULT_RETRY_CONFIG, type RetryConfig } from './types';

function isRetryableError(error: any): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  if (error.status) {
    return [429, 500, 502, 503, 504].includes(error.status);
  }

  const errorMessage = error.message?.toLowerCase() || '';
  const retryableKeywords = ['rate limit', 'timeout', 'overloaded', 'unavailable', 'server error'];
  return retryableKeywords.some(keyword => errorMessage.includes(keyword));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt === config.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      );

      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      console.warn(`API 调用失败，${delay}ms 后进行第 ${attempt + 1} 次重试:`, error.message || error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
