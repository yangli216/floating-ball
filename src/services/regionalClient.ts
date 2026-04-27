import { invoke } from '@tauri-apps/api/core';
import { getActiveUpdateChannel } from './updateConfig';
import {
  getCurrentClientVersion,
  isUpdateRequiredCode,
  notifyForceUpdateRequired,
} from './updatePolicy';

/**
 * 区域化客户端服务
 * 负责终端注册、配置下发（bootstrap）、心跳保活、JWT 管理
 *
 * 当区域化模式启用时，客户端启动即向 core-service 注册，
 * 获取 JWT 令牌和完整配置（LLM/语音/知识库等），无需用户手动配置。
 */

// ─── 类型定义 ─────────────────────────────────────────────────────────────

export interface RegionalConfig {
  /** core-service 基地址，如 http://192.168.1.100:8080 */
  baseUrl: string;
  /** 机构编码 */
  orgCode: string;
  /** 设备唯一编码（优先取设备 MAC，并本地持久化） */
  deviceCode: string;
}

export interface RegionalConnectionConfig extends RegionalConfig {
  enabled: boolean;
}

export interface RegisterRequest {
  cdDevice: string;
  naDevice: string;
  cdOrg: string;
  clientVersion: string;
  updateChannel: string;
  osInfo: string;
}

export interface RegisterResponse {
  idDevice: string;
  deviceToken: string;
  heartbeatInterval: number; // 秒
}

export interface BootstrapConfig {
  /** LLM 配置 */
  llm: {
    baseUrl: string;
    model: string;
    audioBaseUrl?: string;
    audioModel?: string;
  };
  /** 语音配置 */
  speech?: {
    provider: string; // 'dashscope' | 'whisper'
    model?: string;
  };
  /** 知识库配置 */
  knowledgeBase?: {
    enabled: boolean;
    baseUrl?: string;
  };
  /** 人卫知识库 */
  pmphai?: {
    enabled: boolean;
  };
  /** 事实核查 */
  reviewer?: {
    enabled: boolean;
    model?: string;
  };
  /** Feature flags */
  features: Record<string, boolean>;
  /** 模板版本号 */
  templateVersion: string;
  /** 数据包版本号 */
  dataPackageVersion: string;
  /** Prompt 版本号 */
  promptVersion: string;
}

export interface HeartbeatResponse {
  status: 'ok';
  serverTime: number;
}

// ─── 统一响应 ──────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
  requestId: string;
  timestamp: number;
}

interface RegionalErrorInfo {
  code?: string;
  message: string;
}

function parseRegionalError(rawText: string, fallback: string): RegionalErrorInfo {
  const text = rawText.trim();
  if (!text) return { message: fallback };

  try {
    const parsed = JSON.parse(text) as Partial<ApiResponse<unknown>> & {
      error?: { message?: string; code?: string };
    };
    return {
      code: parsed.code || parsed.error?.code,
      message: parsed.message || parsed.error?.message || fallback,
    };
  } catch {
    return { message: text };
  }
}

function parseRegionalErrorMessage(rawText: string, fallback: string): string {
  return parseRegionalError(rawText, fallback).message;
}

function parseUnexpectedSseBody(rawText: string, fallback: string): string {
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

export interface RegionalSpeechUploadPayload {
  audio: string;
  mimeType?: string;
  format?: string;
  fileName?: string;
  scene?: string;
}

function extractSseDataPayload(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  return line.slice(5).trimStart();
}

// ─── 状态管理 ──────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  REGIONAL_ENABLED: 'REGIONAL_ENABLED',
  REGIONAL_BASE_URL: 'REGIONAL_BASE_URL',
  REGIONAL_ORG_CODE: 'REGIONAL_ORG_CODE',
  DEVICE_CODE: 'REGIONAL_DEVICE_CODE',
  DEVICE_TOKEN: 'REGIONAL_DEVICE_TOKEN',
  DEVICE_ID: 'REGIONAL_DEVICE_ID',
  HEARTBEAT_INTERVAL: 'REGIONAL_HEARTBEAT_INTERVAL',
  BOOTSTRAP_CACHE: 'REGIONAL_BOOTSTRAP_CACHE',
  BOOTSTRAP_CACHE_TIME: 'REGIONAL_BOOTSTRAP_CACHE_TIME',
} as const;

const DEFAULT_REGIONAL_BASE_URL = (
  import.meta.env.VITE_REGIONAL_BASE_URL
  || 'http://127.0.0.1:8080'
).trim().replace(/\/+$/, '');

// 机构编码默认回退 ORG001；仅保留本地构建覆盖入口，不依赖 GitHub Actions Repository Variables
const DEFAULT_REGIONAL_ORG_CODE = (
  import.meta.env.VITE_REGIONAL_ORG_CODE
  || 'ORG001'
).trim();

const DEFAULT_REGIONAL_ENABLED = !['false', '0', 'off'].includes(
  String(import.meta.env.VITE_REGIONAL_ENABLED ?? 'true').trim().toLowerCase()
);

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cachedBootstrap: BootstrapConfig | null = null;
let initialized = false;
let deviceCodeLoadPromise: Promise<string> | null = null;
let macLookupUnavailable = false;

function readStorageValue(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw == null) {
    return null;
  }
  const text = raw.trim();
  return text ? text : null;
}

function clearBootstrapCache(): void {
  cachedBootstrap = null;
  localStorage.removeItem(STORAGE_KEYS.BOOTSTRAP_CACHE);
  localStorage.removeItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME);
}

function clearDeviceRegistration(): void {
  localStorage.removeItem(STORAGE_KEYS.DEVICE_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.DEVICE_ID);
  localStorage.removeItem(STORAGE_KEYS.HEARTBEAT_INTERVAL);
}

function resetRegionalRuntime(clearRegistration = false): void {
  stopHeartbeat();
  initialized = false;
  clearBootstrapCache();
  if (clearRegistration) {
    clearDeviceRegistration();
  }
}

function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('AUTH-401') || /\b401\b/.test(message);
}

// ─── 区域化模式判断 ─────────────────────────────────────────────────────────

/**
 * 是否启用区域化模式
 */
export function isRegionalMode(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.REGIONAL_ENABLED);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return DEFAULT_REGIONAL_ENABLED;
}

/**
 * 切换区域化模式
 */
export function setRegionalMode(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.REGIONAL_ENABLED, enabled ? 'true' : 'false');
  if (!enabled) {
    resetRegionalRuntime(false);
  }
}

/**
 * 获取区域化基地址
 */
export function getRegionalBaseUrl(): string {
  return (
    readStorageValue(STORAGE_KEYS.REGIONAL_BASE_URL)
    || DEFAULT_REGIONAL_BASE_URL
  ).replace(/\/+$/, '');
}

/**
 * 获取机构编码
 */
export function getOrgCode(): string {
  return readStorageValue(STORAGE_KEYS.REGIONAL_ORG_CODE)
    || DEFAULT_REGIONAL_ORG_CODE;
}

export function getRegionalConnectionDefaults(): Pick<RegionalConnectionConfig, 'enabled' | 'baseUrl' | 'orgCode'> {
  return {
    enabled: DEFAULT_REGIONAL_ENABLED,
    baseUrl: DEFAULT_REGIONAL_BASE_URL,
    orgCode: DEFAULT_REGIONAL_ORG_CODE,
  };
}

export function ensureRegionalConnectionDefaults(): void {
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_BASE_URL)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_BASE_URL, DEFAULT_REGIONAL_BASE_URL);
  }
  if (!readStorageValue(STORAGE_KEYS.REGIONAL_ORG_CODE)) {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_ORG_CODE, DEFAULT_REGIONAL_ORG_CODE);
  }
  const enabledValue = localStorage.getItem(STORAGE_KEYS.REGIONAL_ENABLED);
  if (enabledValue !== 'true' && enabledValue !== 'false') {
    localStorage.setItem(STORAGE_KEYS.REGIONAL_ENABLED, DEFAULT_REGIONAL_ENABLED ? 'true' : 'false');
  }
}

export function getRegionalConnectionConfig(): RegionalConnectionConfig {
  return {
    enabled: isRegionalMode(),
    baseUrl: getRegionalBaseUrl(),
    orgCode: getOrgCode(),
    deviceCode: getStoredDeviceCode(),
  };
}

export function hasRegionalConnectionConfig(): boolean {
  const { baseUrl, orgCode } = getRegionalConnectionConfig();
  return Boolean(baseUrl && orgCode);
}

export function saveRegionalConnectionConfig(config: {
  enabled: boolean;
  baseUrl: string;
  orgCode: string;
}): void {
  const nextBaseUrl = (config.baseUrl || DEFAULT_REGIONAL_BASE_URL).trim().replace(/\/+$/, '');
  const nextOrgCode = (config.orgCode || DEFAULT_REGIONAL_ORG_CODE).trim();
  const currentBaseUrl = getRegionalBaseUrl();
  const currentOrgCode = getOrgCode();
  const endpointChanged = nextBaseUrl !== currentBaseUrl || nextOrgCode !== currentOrgCode;

  localStorage.setItem(STORAGE_KEYS.REGIONAL_BASE_URL, nextBaseUrl);
  localStorage.setItem(STORAGE_KEYS.REGIONAL_ORG_CODE, nextOrgCode);
  setRegionalMode(config.enabled);

  if (config.enabled) {
    resetRegionalRuntime(endpointChanged);
  }
}

// ─── 设备编码（优先取设备 MAC） ────────────────────────────────────────────

function getStoredDeviceCode(): string {
  return readStorageValue(STORAGE_KEYS.DEVICE_CODE) || '';
}

function normalizeDeviceCode(code: string): string {
  const trimmedCode = code.trim().toUpperCase();
  if (/^[0-9A-F]{2}([:-][0-9A-F]{2}){5}$/.test(trimmedCode)) {
    return trimmedCode.replace(/-/g, ':');
  }
  return trimmedCode;
}

function generateFallbackDeviceCode(): string {
  return `FB-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
}

function persistDeviceCode(nextCode: string): string {
  const normalizedCode = normalizeDeviceCode(nextCode);
  if (!normalizedCode) {
    return '';
  }

  const previousCode = getStoredDeviceCode();
  if (previousCode !== normalizedCode) {
    localStorage.setItem(STORAGE_KEYS.DEVICE_CODE, normalizedCode);
    if (previousCode) {
      stopHeartbeat();
      initialized = false;
      clearDeviceRegistration();
    }
  }

  return normalizedCode;
}

async function detectDeviceMacAddress(): Promise<string | null> {
  if (macLookupUnavailable) {
    return null;
  }

  try {
    const deviceMac = normalizeDeviceCode(await invoke<string>('get_device_mac_address'));
    return deviceMac || null;
  } catch (error) {
    macLookupUnavailable = true;
    console.warn('[RegionalClient] Failed to detect device MAC address, using fallback device code.', error);
    return null;
  }
}

export async function getDeviceCode(): Promise<string> {
  if (deviceCodeLoadPromise) {
    return deviceCodeLoadPromise;
  }

  deviceCodeLoadPromise = (async () => {
    const storedCode = getStoredDeviceCode();
    if (storedCode) {
      return storedCode;
    }

    const deviceMac = await detectDeviceMacAddress();

    if (deviceMac) {
      return persistDeviceCode(deviceMac);
    }

    return persistDeviceCode(generateFallbackDeviceCode());
  })();

  try {
    return await deviceCodeLoadPromise;
  } finally {
    deviceCodeLoadPromise = null;
  }
}

function getDeviceToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
}

function setDeviceToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
}

function getDeviceId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

// ─── HTTP 工具 ─────────────────────────────────────────────────────────────

async function regionalFetch<T>(
  path: string,
  options: RequestInit = {},
  allowAuthRetry = true
): Promise<T> {
  const baseUrl = getRegionalBaseUrl();
  if (!baseUrl) throw new Error('区域化服务地址未配置');

  await getDeviceCode();

  let token = getDeviceToken();
  if (!token && path !== '/v1/client/register') {
    await registerDevice();
    token = getDeviceToken();
  }
  const clientVersion = await getCurrentClientVersion();
  const updateChannel = getActiveUpdateChannel();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getOrgCode(),
    'X-Request-Id': crypto.randomUUID(),
    'X-Client-Version': clientVersion,
    'X-Update-Channel': updateChannel,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && allowAuthRetry && path !== '/v1/client/register') {
      clearDeviceRegistration();
      initialized = false;
      await registerDevice();
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

// ─── 终端注册 ──────────────────────────────────────────────────────────────

/**
 * 向 core-service 注册终端
 */
export async function registerDevice(): Promise<RegisterResponse> {
  const orgCode = getOrgCode();
  if (!orgCode) {
    throw new Error('区域化机构编码未配置');
  }
  const cdDevice = await getDeviceCode();
  let naDevice = 'FloatingBall';
  let osInfo = 'unknown';
  const clientVersion = await getCurrentClientVersion();
  const updateChannel = getActiveUpdateChannel();

  try {
    osInfo = `${navigator.platform} ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || ''}`.trim();
    naDevice = `FloatingBall-${navigator.platform}`;
  } catch { /* ignore */ }

  const resp = await regionalFetch<RegisterResponse>('/v1/client/register', {
    method: 'POST',
    body: JSON.stringify({
      cdDevice,
      naDevice,
      cdOrg: orgCode,
      clientVersion,
      updateChannel,
      osInfo,
    } satisfies RegisterRequest),
  });

  setDeviceToken(resp.deviceToken);
  localStorage.setItem(STORAGE_KEYS.DEVICE_ID, resp.idDevice);
  localStorage.setItem(STORAGE_KEYS.HEARTBEAT_INTERVAL, String(resp.heartbeatInterval));

  console.log(`[RegionalClient] Device registered: ${resp.idDevice}`);
  return resp;
}

// ─── Bootstrap 配置下发 ──────────────────────────────────────────────────

const BOOTSTRAP_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 获取 bootstrap 配置（带缓存）
 */
export async function getBootstrapConfig(force = false): Promise<BootstrapConfig> {
  if (!force && cachedBootstrap) {
    const cacheTime = Number(localStorage.getItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME) || '0');
    if (Date.now() - cacheTime < BOOTSTRAP_CACHE_TTL) {
      return cachedBootstrap;
    }
  }

  const config = await regionalFetch<BootstrapConfig>('/v1/client/bootstrap');

  cachedBootstrap = config;
  localStorage.setItem(STORAGE_KEYS.BOOTSTRAP_CACHE, JSON.stringify(config));
  localStorage.setItem(STORAGE_KEYS.BOOTSTRAP_CACHE_TIME, String(Date.now()));

  console.log('[RegionalClient] Bootstrap config loaded:', {
    llmModel: config.llm.model,
    templateVersion: config.templateVersion,
    features: config.features,
  });

  return config;
}

/**
 * 获取缓存的 bootstrap 配置（同步，用于快速读取）
 */
export function getCachedBootstrap(): BootstrapConfig | null {
  if (cachedBootstrap) return cachedBootstrap;

  const cached = localStorage.getItem(STORAGE_KEYS.BOOTSTRAP_CACHE);
  if (cached) {
    try {
      cachedBootstrap = JSON.parse(cached);
      return cachedBootstrap;
    } catch { /* invalid cache */ }
  }
  return null;
}

// ─── 心跳保活 ──────────────────────────────────────────────────────────────

function startHeartbeat(): void {
  stopHeartbeat();
  const interval = Number(localStorage.getItem(STORAGE_KEYS.HEARTBEAT_INTERVAL) || '30') * 1000;

  heartbeatTimer = setInterval(async () => {
    try {
      await regionalFetch<HeartbeatResponse>('/v1/client/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ idDevice: getDeviceId() }),
      });
    } catch (err) {
      console.warn('[RegionalClient] Heartbeat failed:', err);
    }
  }, interval);

  console.log(`[RegionalClient] Heartbeat started, interval=${interval}ms`);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── 初始化 ────────────────────────────────────────────────────────────────

/**
 * 初始化区域化客户端
 * - 如果已有 token 则直接拉取 bootstrap
 * - 否则先注册再 bootstrap
 */
export async function initializeRegionalClient(options?: {
  allowCachedFallback?: boolean;
}): Promise<BootstrapConfig | null> {
  if (!isRegionalMode()) return null;
  if (!hasRegionalConnectionConfig()) {
    throw new Error('请先配置区域化服务地址和机构编码');
  }
  if (initialized) return getCachedBootstrap();
  const allowCachedFallback = options?.allowCachedFallback !== false;

  try {
    await getDeviceCode();
    const existingToken = getDeviceToken();
    if (!existingToken) {
      await registerDevice();
    }

    let config: BootstrapConfig;
    try {
      config = await getBootstrapConfig(true);
    } catch (error) {
      if (existingToken && isUnauthorizedError(error)) {
        clearDeviceRegistration();
        await registerDevice();
        config = await getBootstrapConfig(true);
      } else {
        throw error;
      }
    }

    startHeartbeat();
    initialized = true;
    return config;
  } catch (err) {
    console.error('[RegionalClient] Initialization failed, falling back to local mode:', err);
    if (allowCachedFallback) {
      // 离线降级：返回缓存配置或 null
      return getCachedBootstrap();
    }
    throw err;
  }
}

/**
 * 关闭区域化客户端
 */
export function shutdownRegionalClient(): void {
  resetRegionalRuntime(false);
}

// ─── 带鉴权的通用请求（供其他模块使用） ──────────────────────────────────

/**
 * 带区域化鉴权的 GET 请求
 */
export async function regionalGet<T>(path: string): Promise<T> {
  return regionalFetch<T>(path);
}

/**
 * 带区域化鉴权的 POST 请求
 */
export async function regionalPost<T>(path: string, body: unknown): Promise<T> {
  return regionalFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function resolveAudioExtension(mimeType?: string, format?: string): string {
  if (mimeType === 'audio/webm') return '.webm';
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave') return '.wav';
  if (mimeType === 'audio/mpeg') return '.mp3';
  if (mimeType === 'audio/mp4') return '.m4a';
  if (mimeType === 'audio/ogg') return '.ogg';
  if (mimeType === 'audio/pcm' || format === 'pcm') return '.pcm';
  return '.bin';
}

export async function buildRegionalSpeechUploadPayload(
  blob: Blob,
  options: {
    mimeType?: string;
    format?: string;
    fileName?: string;
    scene?: string;
  } = {}
): Promise<RegionalSpeechUploadPayload> {
  const mimeType = options.mimeType || blob.type || (options.format === 'pcm' ? 'audio/pcm' : undefined);
  const scene = options.scene || 'speech';
  const fileName = options.fileName || `${scene}-${Date.now()}${resolveAudioExtension(mimeType, options.format)}`;

  return {
    audio: arrayBufferToBase64(await blob.arrayBuffer()),
    mimeType,
    format: options.format,
    fileName,
    scene,
  };
}

/**
 * 带区域化鉴权的 SSE 流式请求（用于 AI 代理）
 */
export function createRegionalSSE(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const baseUrl = getRegionalBaseUrl();
  const token = getDeviceToken();

  return new Promise(async (resolve, reject) => {
    try {
      const clientVersion = await getCurrentClientVersion();
      const updateChannel = getActiveUpdateChannel();
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': getOrgCode(),
          'X-Request-Id': crypto.randomUUID(),
          'X-Client-Version': clientVersion,
          'X-Update-Channel': updateChannel,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
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
}
