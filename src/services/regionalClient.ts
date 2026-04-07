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
  /** 设备唯一编码（本地持久化） */
  deviceCode: string;
}

export interface RegisterRequest {
  cdDevice: string;
  naDevice: string;
  cdOrg: string;
  clientVersion: string;
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

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cachedBootstrap: BootstrapConfig | null = null;
let initialized = false;

// ─── 区域化模式判断 ─────────────────────────────────────────────────────────

/**
 * 是否启用区域化模式
 */
export function isRegionalMode(): boolean {
  return localStorage.getItem(STORAGE_KEYS.REGIONAL_ENABLED) === 'true';
}

/**
 * 切换区域化模式
 */
export function setRegionalMode(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.REGIONAL_ENABLED, enabled ? 'true' : 'false');
  if (!enabled) {
    stopHeartbeat();
    cachedBootstrap = null;
    initialized = false;
  }
}

/**
 * 获取区域化基地址
 */
export function getRegionalBaseUrl(): string {
  return (
    localStorage.getItem(STORAGE_KEYS.REGIONAL_BASE_URL)
    || import.meta.env.VITE_REGIONAL_BASE_URL
    || ''
  ).replace(/\/+$/, '');
}

/**
 * 获取机构编码
 */
export function getOrgCode(): string {
  return localStorage.getItem(STORAGE_KEYS.REGIONAL_ORG_CODE)
    || import.meta.env.VITE_REGIONAL_ORG_CODE
    || '';
}

// ─── 设备编码（持久化） ────────────────────────────────────────────────────

function getDeviceCode(): string {
  let code = localStorage.getItem(STORAGE_KEYS.DEVICE_CODE);
  if (!code) {
    code = `FB-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_CODE, code);
  }
  return code;
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
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getRegionalBaseUrl();
  if (!baseUrl) throw new Error('区域化服务地址未配置');

  const token = getDeviceToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getOrgCode(),
    'X-Request-Id': crypto.randomUUID(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Regional API ${path} failed: ${res.status} ${text}`);
  }

  const body: ApiResponse<T> = await res.json();
  if (body.code !== '0') {
    throw new Error(`Regional API error: [${body.code}] ${body.message}`);
  }
  return body.data;
}

// ─── 终端注册 ──────────────────────────────────────────────────────────────

/**
 * 向 core-service 注册终端
 */
export async function registerDevice(): Promise<RegisterResponse> {
  const cdDevice = getDeviceCode();
  let naDevice = 'FloatingBall';
  let osInfo = 'unknown';
  let clientVersion = 'unknown';

  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    clientVersion = await getVersion();
  } catch { /* browser fallback */ }

  try {
    osInfo = `${navigator.platform} ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || ''}`.trim();
    naDevice = `FloatingBall-${navigator.platform}`;
  } catch { /* ignore */ }

  const resp = await regionalFetch<RegisterResponse>('/v1/client/register', {
    method: 'POST',
    body: JSON.stringify({
      cdDevice,
      naDevice,
      cdOrg: getOrgCode(),
      clientVersion,
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
export async function initializeRegionalClient(): Promise<BootstrapConfig | null> {
  if (!isRegionalMode()) return null;
  if (initialized) return getCachedBootstrap();

  try {
    const existingToken = getDeviceToken();
    if (!existingToken) {
      await registerDevice();
    }

    const config = await getBootstrapConfig(true);
    startHeartbeat();
    initialized = true;
    return config;
  } catch (err) {
    console.error('[RegionalClient] Initialization failed, falling back to local mode:', err);
    // 离线降级：返回缓存配置或 null
    return getCachedBootstrap();
  }
}

/**
 * 关闭区域化客户端
 */
export function shutdownRegionalClient(): void {
  stopHeartbeat();
  initialized = false;
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
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': getOrgCode(),
          'X-Request-Id': crypto.randomUUID(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        reject(new Error(`Regional SSE ${path} failed: ${res.status} ${text}`));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        reject(new Error('无法获取流式响应'));
        return;
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            resolve();
            return;
          }
          try {
            const json = JSON.parse(dataStr);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) onChunk(content);
          } catch { /* skip malformed SSE */ }
        }
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
