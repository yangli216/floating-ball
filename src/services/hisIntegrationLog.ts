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

export function createHisTraceId(): string {
  const randomPart = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `his-${Date.now()}-${randomPart}`;
}

export function summarizeHisPayload(value: unknown): unknown {
  return sanitizeValue(value);
}

export function sanitizeHisLogUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const parsed = new URL(value, 'http://pcie-log.invalid');
    return parsed.pathname || '/';
  } catch {
    return undefined;
  }
}

export async function recordHisIntegrationLog(entry: HisIntegrationLogInput): Promise<string | null> {
  try {
    const projectedEntry: HisIntegrationLogInput = entry.direction === 'outbound'
      ? {
          traceId: sanitizeOutboundTraceId(entry.traceId),
          direction: 'outbound',
          operation: sanitizeHisLogUrl(entry.operation) || 'his-operation',
          method: sanitizeOutboundMethod(entry.method),
          path: sanitizeHisLogUrl(entry.path) || 'his-path',
          url: sanitizeHisLogUrl(entry.url),
          status: sanitizeOutboundStatus(entry.status),
          httpStatus: sanitizeHttpStatus(entry.httpStatus),
          businessCode: sanitizeBusinessCode(entry.businessCode),
          businessMessage: entry.businessMessage ? 'HIS 返回业务提示' : undefined,
          durationMs: sanitizeDurationMs(entry.durationMs),
          errorMessage: entry.errorMessage ? 'HIS 调用失败' : undefined,
          requestSummary: sanitizeValue(entry.requestSummary),
          responseSummary: sanitizeValue(entry.responseSummary),
        }
      : entry;
    return await invoke<string>('record_his_integration_log', { entry: projectedEntry });
  } catch {
    console.warn('[HisIntegrationLog] Failed to record log');
    return null;
  }
}

const SAFE_HIS_TRACE_ID_PATTERNS = [
  /^his-\d{10,16}-[0-9a-f]{1,16}$/i,
  /^inpatient-emr-\d{10,16}$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
];
const SAFE_BUSINESS_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,15}$/;
const SAFE_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']);
const SAFE_LOG_STATUSES = new Set<HisIntegrationLogStatus>([
  'success',
  'error',
  'pending',
  'business_error',
]);

function sanitizeOutboundTraceId(value: unknown): string {
  return typeof value === 'string' && SAFE_HIS_TRACE_ID_PATTERNS.some((pattern) => pattern.test(value))
    ? value
    : createHisTraceId();
}

function sanitizeOutboundMethod(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return SAFE_HTTP_METHODS.has(normalized) ? normalized : 'UNKNOWN';
}

function sanitizeOutboundStatus(value: unknown): HisIntegrationLogStatus {
  return typeof value === 'string' && SAFE_LOG_STATUSES.has(value as HisIntegrationLogStatus)
    ? value as HisIntegrationLogStatus
    : 'error';
}

function sanitizeHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function sanitizeBusinessCode(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && SAFE_BUSINESS_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

function sanitizeDurationMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000
    ? Math.round(value)
    : undefined;
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

type SummaryValueType = 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'bigint' | 'undefined' | 'other';

function summaryValueType(value: unknown): SummaryValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'bigint') return 'bigint';
  if (typeof value === 'undefined') return 'undefined';
  return 'other';
}

function countValueTypes(values: unknown[]): Partial<Record<SummaryValueType, number>> {
  return values.reduce<Partial<Record<SummaryValueType, number>>>((counts, value) => {
    const type = summaryValueType(value);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return { type: summaryValueType(value) };
  }

  if (typeof value === 'string') {
    return { type: 'string', length: value.length };
  }

  if (typeof value !== 'object') {
    return { type: summaryValueType(value) };
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemTypes: countValueTypes(value),
    };
  }

  const values = Object.values(value as Record<string, unknown>);
  return {
    type: 'object',
    fieldCount: values.length,
    valueTypes: countValueTypes(values),
  };
}
