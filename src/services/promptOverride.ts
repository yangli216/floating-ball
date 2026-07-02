/**
 * Prompt 远程覆盖层
 *
 * 管理端可以发布自定义 prompt 覆盖内置默认值。
 * 通过 bootstrap/delta 机制拉取，本地缓存在 localStorage。
 */
import { regionalGet } from './regionalClient';

// ─── 类型定义 ─────────────────────────────────────────────────────────────

export interface RemotePrompt {
  /** 场景编码，对应 PROMPTS 路径如 consultation.medicalRecordGeneration */
  cdPrompt: string;
  /** 系统 prompt */
  sysPrompt: string;
  /** 用户 prompt 模板（含占位符） */
  userTemplate?: string;
  /** 版本号 */
  versionNum: string;
}

interface PromptDeltaResponse {
  version: string;
  prompts: RemotePrompt[];
}

// ─── 本地缓存 ──────────────────────────────────────────────────────────────

const CACHE_KEY = 'REGIONAL_PROMPTS_CACHE';
const CACHE_VERSION_KEY = 'REGIONAL_PROMPTS_VERSION';

let promptOverrides: Map<string, RemotePrompt> | null = null;

function loadCachedOverrides(): Map<string, RemotePrompt> {
  if (promptOverrides) return promptOverrides;

  promptOverrides = new Map();
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const arr: RemotePrompt[] = JSON.parse(cached);
      for (const p of arr) {
        promptOverrides.set(p.cdPrompt, p);
      }
    }
  } catch { /* invalid cache */ }
  return promptOverrides;
}

function saveCacheOverrides(prompts: RemotePrompt[]): void {
  promptOverrides = new Map();
  for (const p of prompts) {
    promptOverrides.set(p.cdPrompt, p);
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(prompts));
}

// ─── 远程同步 ──────────────────────────────────────────────────────────────

/**
 * 从 core-service 拉取 prompt 增量更新
 */
export async function syncRemotePrompts(): Promise<void> {
  try {
    const currentVersion = localStorage.getItem(CACHE_VERSION_KEY) || '0';
    const resp = await regionalGet<PromptDeltaResponse>(
      `/v1/client/prompts/delta?version=${encodeURIComponent(currentVersion)}`
    );

    if (resp.prompts.length > 0) {
      // 合并到现有缓存
      const existing = loadCachedOverrides();
      for (const p of resp.prompts) {
        existing.set(p.cdPrompt, p);
      }
      const merged = Array.from(existing.values());
      saveCacheOverrides(merged);
      localStorage.setItem(CACHE_VERSION_KEY, resp.version);
      console.log(`[PromptOverride] Synced ${resp.prompts.length} prompts, version=${resp.version}`);
    }
  } catch (err) {
    console.warn('[PromptOverride] Sync failed, using cached:', err);
  }
}

// ─── 覆盖查询 ──────────────────────────────────────────────────────────────

/**
 * 获取指定场景的远程 prompt 覆盖（如果存在）
 * @param cdPrompt 场景编码，如 "medicalRecordGeneration"
 */
export function getPromptOverride(cdPrompt: string): RemotePrompt | null {
  const overrides = loadCachedOverrides();
  return overrides.get(cdPrompt) || null;
}

/**
 * 获取系统 prompt 覆盖值（如果存在）
 * 用于在构建消息时替换默认 system prompt
 */
export function getSystemPromptOverride(cdPrompt: string): string | null {
  const override = getPromptOverride(cdPrompt);
  return override?.sysPrompt || null;
}

/**
 * 合并远程 prompt 到本地 prompt 对象
 * 如果远程有值则覆盖 system，保留 buildUserPrompt 等函数逻辑
 */
export function withOverride(
  cdPrompt: string,
  localPrompt: { system: string; buildUserPrompt?: (...args: any[]) => string }
): { system: string; buildUserPrompt?: (...args: any[]) => string } {
  // 开发环境下禁用远程 Prompt 覆盖，以确保本地 prompts.ts 文件的修改可直接生效调试
  if (import.meta.env.DEV) {
    return localPrompt;
  }
  const override = getSystemPromptOverride(cdPrompt);
  if (!override) return localPrompt;

  return {
    ...localPrompt,
    system: override,
  };
}
