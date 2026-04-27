import { invoke } from '@tauri-apps/api/core';

export type HisIntegrationLogDirection = 'inbound' | 'outbound';
export type HisIntegrationLogStatus = 'success' | 'error' | 'pending' | 'business_error';

export interface HisIntegrationLogEntry {
  id: string;
  traceId: string;
  direction: HisIntegrationLogDirection;
  operation: string;
  method: string;
  path: string;
  url?: string;
  status: HisIntegrationLogStatus | string;
  httpStatus?: number;
  businessCode?: string;
  businessMessage?: string;
  durationMs?: number;
  requestSummary?: unknown;
  responseSummary?: unknown;
  patientId?: string;
  consultationId?: string;
  requestId?: string;
  errorMessage?: string;
  createdAt: number;
}

export interface HisIntegrationLogInput {
  traceId?: string;
  direction: HisIntegrationLogDirection;
  operation: string;
  method: string;
  path: string;
  url?: string;
  status: HisIntegrationLogStatus;
  httpStatus?: number;
  businessCode?: string;
  businessMessage?: string;
  durationMs?: number;
  requestSummary?: unknown;
  responseSummary?: unknown;
  patientId?: string;
  consultationId?: string;
  requestId?: string;
  errorMessage?: string;
}

export interface HisIntegrationLogQuery {
  traceId?: string;
  keyword?: string;
  direction?: HisIntegrationLogDirection | '';
  status?: HisIntegrationLogStatus | '';
  limit?: number;
}

const MAX_STRING_LENGTH = 600;
const SENSITIVE_KEYWORDS = [
  'token',
  'authorization',
  'cookie',
  'password',
  'secret',
  'apikey',
  'api_key',
  'mobile',
  'phone',
  'idcard',
  'id_card',
  'certno',
];

export function createHisTraceId(): string {
  const randomPart = Math.random().toString(16).slice(2, 10);
  return `his-${Date.now()}-${randomPart}`;
}

export function summarizeHisPayload(value: unknown): unknown {
  return sanitizeValue(value);
}

export async function recordHisIntegrationLog(entry: HisIntegrationLogInput): Promise<string | null> {
  try {
    return await invoke<string>('record_his_integration_log', { entry });
  } catch (error) {
    console.warn('[HisIntegrationLog] Failed to record log', error);
    return null;
  }
}

export async function listHisIntegrationLogs(query?: HisIntegrationLogQuery): Promise<HisIntegrationLogEntry[]> {
  return await invoke<HisIntegrationLogEntry[]>('list_his_integration_logs', { query });
}

export async function clearHisIntegrationLogs(): Promise<void> {
  await invoke('clear_his_integration_logs');
}

export async function exportHisIntegrationLogs(query?: HisIntegrationLogQuery): Promise<string | null> {
  return await invoke<string | null>('export_his_integration_logs', { query });
}

export function getHisBusinessCode(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const raw = (response as { code?: unknown; status?: unknown }).code;
  if (raw === undefined || raw === null || raw === '') return undefined;
  return String(raw);
}

export function getHisBusinessMessage(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const record = response as { message?: unknown; msg?: unknown; error?: unknown };
  const raw = record.msg ?? record.message ?? record.error;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function resolveHisLogStatus(response: unknown): HisIntegrationLogStatus {
  const code = getHisBusinessCode(response);
  if (!code) return 'success';
  return code === '200' || code === '0' ? 'success' : 'business_error';
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return '***';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncate(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 12) {
      return {
        arrayLength: value.length,
        sample: value.slice(0, 3).map((item) => sanitizeValue(item)),
      };
    }
    return value.map((item) => sanitizeValue(item));
  }

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = sanitizeValue(childValue, childKey);
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...(truncated)`;
}
