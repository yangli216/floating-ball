export interface UserFacingErrorOptions {
  fallback?: string;
  context?: string;
  code?: string;
  status?: number;
  requestId?: string;
}

interface ErrorMeta {
  message: string;
  code?: string;
  status?: number;
  requestId?: string;
  name?: string;
}

const DEFAULT_ERROR_MESSAGE = '操作失败，请稍后重试。';

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readObjectString(source: Record<string, unknown>, key: string): string | undefined {
  return readString(source[key]);
}

function readObjectNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractErrorMeta(error: unknown): ErrorMeta {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    return {
      message: error.message || '',
      code: readObjectString(record, 'code'),
      status: readObjectNumber(record, 'status'),
      requestId: readObjectString(record, 'requestId'),
      name: error.name,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const nestedError = record.error && typeof record.error === 'object'
      ? record.error as Record<string, unknown>
      : {};
    return {
      message: readObjectString(record, 'message') || readObjectString(nestedError, 'message') || String(error),
      code: readObjectString(record, 'code') || readObjectString(nestedError, 'code'),
      status: readObjectNumber(record, 'status') || readObjectNumber(record, 'statusCode'),
      requestId: readObjectString(record, 'requestId') || readObjectString(nestedError, 'requestId'),
      name: readObjectString(record, 'name'),
    };
  }

  return { message: String(error || '') };
}

function hasAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function normalizeMessage(meta: ErrorMeta, fallback: string): string {
  const raw = meta.message.trim();
  const lower = raw.toLowerCase();
  const code = (meta.code || '').toUpperCase();
  const status = meta.status;

  if (!raw || raw === 'undefined' || raw === 'null') {
    return fallback;
  }

  if (code === 'UPDATE-REQUIRED' || status === 426) {
    return '当前客户端版本过低，请先完成更新后继续使用。';
  }

  if (code === 'SIG-401' || lower.includes('signature') || raw.includes('签名')) {
    return '请求签名校验未通过，请重新连接后台；若仍失败，请联系管理员重新注册设备。';
  }

  if (code === 'AUTH-401' || status === 401 || raw.includes('令牌') || lower.includes('unauthorized')) {
    return '授权已失效，请重新连接后台或重新登录后重试。';
  }

  if (status === 403 || lower.includes('forbidden')) {
    return '当前账号或设备没有权限执行该操作，请联系管理员确认授权范围。';
  }

  if (status === 404 || lower.includes('not found')) {
    return '请求的服务接口不存在，请确认后台版本和地址配置是否匹配。';
  }

  if (
    meta.name === 'AbortError'
    || lower.includes('timeout')
    || lower.includes('timed out')
    || lower.includes('econnaborted')
  ) {
    return '请求超时，请稍后重试；如果反复出现，请检查后台服务状态。';
  }

  if (
    raw === 'Load failed'
    || raw === 'Failed to fetch'
    || lower.includes('networkerror')
    || lower.includes('network error')
    || lower.includes('failed to fetch')
    || lower.includes('load failed')
    || lower.includes('connection refused')
  ) {
    return '服务暂时无法连接，请检查后台服务地址、网络或 VPN 后重试。';
  }

  if (
    status && status >= 500
    || code === 'SYS-500'
    || raw === 'Internal Server Error'
    || lower.includes('internal server error')
  ) {
    return '后台服务处理失败，请稍后重试；若持续出现，请联系管理员查看日志。';
  }

  if (
    lower.includes('unexpected token')
    || lower.includes('json')
    || raw.includes('JSON解析失败')
    || raw.includes('JSON 解析失败')
  ) {
    return '服务返回内容格式异常，请稍后重试；若持续出现，请联系管理员查看日志。';
  }

  if (
    lower.includes('is not iterable')
    || lower.includes('is not a function')
    || lower.includes('cannot read properties of')
    || lower.includes('cannot read property')
    || lower.includes('undefined is not')
    || lower.includes('null is not')
  ) {
    return fallback;
  }

  if (
    /(^|\s)(java|org|com)\.[\w.]+/.test(raw)
    || /ORA-\d{5}/i.test(raw)
    || hasAny(lower, ['sqlexception', 'nullpointerexception', 'stack trace'])
  ) {
    return '后台服务处理失败，请稍后重试；若持续出现，请联系管理员查看日志。';
  }

  return raw;
}

export function formatUserFacingError(error: unknown, options: UserFacingErrorOptions = {}): string {
  const meta = extractErrorMeta(error);
  const mergedMeta: ErrorMeta = {
    ...meta,
    code: options.code || meta.code,
    status: options.status || meta.status,
    requestId: options.requestId || meta.requestId,
  };
  const base = normalizeMessage(mergedMeta, options.fallback || DEFAULT_ERROR_MESSAGE);
  const withContext = options.context ? `${options.context}：${base}` : base;
  return mergedMeta.requestId
    ? `${withContext}（请求ID：${mergedMeta.requestId}）`
    : withContext;
}
