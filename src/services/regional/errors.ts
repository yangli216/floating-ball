import type { ApiResponse, RegionalErrorInfo } from './types';
import { formatUserFacingError } from '@shared/lib/errorMessages';

export function extractSseDataPayload(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  return line.slice(5).trimStart();
}

export function parseRegionalError(rawText: string, fallback: string): RegionalErrorInfo {
  const text = rawText.trim();
  if (!text) return { message: fallback };

  try {
    const parsed = JSON.parse(text) as Partial<ApiResponse<unknown>> & {
      error?: { message?: string; code?: string };
    };
    return {
      code: parsed.code || parsed.error?.code,
      message: parsed.message || parsed.error?.message || fallback,
      requestId: parsed.requestId,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
    };
  } catch {
    return { message: text };
  }
}

export function parseRegionalErrorMessage(rawText: string, fallback: string): string {
  return parseRegionalError(rawText, fallback).message;
}

export function parseUnexpectedSseBody(rawText: string, fallback: string): string {
  const text = rawText.trim();
  if (!text) return fallback;

  const sseDataLines = text
    .split('\n')
    .map(line => line.trim())
    .map(extractSseDataPayload)
    .filter((line): line is string => line !== null);

  if (sseDataLines.length > 0) {
    const merged = sseDataLines.filter(item => item !== '[DONE]').join('\n');
    if (merged) {
      return parseRegionalErrorMessage(merged, fallback);
    }
  }

  return parseRegionalErrorMessage(text, fallback);
}

export function createRegionalRequestError(
  errorInfo: RegionalErrorInfo,
  fallback: string,
  status?: number,
  requestId?: string
): Error {
  const error = new Error(formatUserFacingError(
    {
      message: errorInfo.message,
      code: errorInfo.code,
      status,
      requestId: errorInfo.requestId || requestId,
    },
    { fallback }
  )) as Error & {
    code?: string;
    status?: number;
    requestId?: string;
    rawMessage?: string;
  };
  error.code = errorInfo.code;
  error.status = status;
  error.requestId = errorInfo.requestId || requestId;
  error.rawMessage = errorInfo.message;
  return error;
}
