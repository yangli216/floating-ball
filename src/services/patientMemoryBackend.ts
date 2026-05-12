/**
 * 患者长期记忆后端抽象
 *
 * 该层把"记忆数据"的读写从具体存储介质解耦：
 *
 * - `local-sqlite`：默认。通过 Tauri command 走桌面端 SQLite（`patient_memory.db`）。
 *   命令实现见 `src-tauri/src/commands/patient_memory.rs`。
 *
 * - `regional-http`：预留。未来区域化部署时把记忆放到区域服务端，桌面端只持有薄客户端。
 *   通过 `window.__REGIONAL_MEMORY_BACKEND__ = { mode: 'regional', baseUrl }` 注入。
 *
 * - `local-storage`：兜底。Tauri invoke 不可用（如 vite dev 在浏览器里跑、或 SQLite
 *   初始化失败）时退回到 `localStorage`，行为与旧版一致，保证页面不直接报错。
 *
 * 调用方（patientMemoryStore.ts）只面向 `MemoryBackend` 接口编程，今后切换形态对上层透明。
 */

import { invoke } from '@tauri-apps/api/core';
import type { PatientMemory, PatientProfile, PatientVisitSummary } from './patientMemoryTypes';

const STORAGE_PREFIX = 'PATIENT_MEMORY_V1';
const MAX_VISITS = 5;
const MAX_ALLERGY_ITEMS = 20;
const MAX_CHRONIC = 8;

export interface AppendVisitArgs {
  patientId: string;
  visit: PatientVisitSummary;
  allergyHistoryText: string | null;
  patientProfile?: PatientProfile | null;
}

export interface ReplaceMemorySnapshotArgs {
  patientId: string;
  patientProfile?: PatientProfile | null;
  allergyHistory: string[];
  chronicDiagnosisCandidates: string[];
  recentVisits: PatientVisitSummary[];
  updatedAt?: number | null;
}

export interface MemoryBackend {
  readonly mode: 'local-sqlite' | 'regional-http' | 'local-storage';
  get(patientId: string): Promise<PatientMemory | null>;
  appendVisit(args: AppendVisitArgs): Promise<PatientMemory | null>;
  replaceSnapshot(args: ReplaceMemorySnapshotArgs): Promise<PatientMemory | null>;
  clear(patientId: string): Promise<void>;
  clearAll(): Promise<void>;
}

const ACUTE_DIAGNOSIS_KEYWORDS = [
  '急性',
  '上呼吸道感染',
  '呼吸道感染',
  '感染',
  '感冒',
  '肺炎',
  '支气管炎',
  '咽炎',
  '扁桃体炎',
  '发热',
  '腹泻',
  '胃肠炎',
  '外伤',
  '挫伤',
  '术后',
  '复查',
];

// ---- Tauri SQLite backend ----

class TauriSqliteBackend implements MemoryBackend {
  readonly mode = 'local-sqlite' as const;

  async get(patientId: string): Promise<PatientMemory | null> {
    return ((await invoke('patient_memory_get', { patientId })) as PatientMemory | null) ?? null;
  }

  async appendVisit(args: AppendVisitArgs): Promise<PatientMemory | null> {
    return ((await invoke('patient_memory_append_visit', {
      input: {
        patientId: args.patientId,
        visit: args.visit,
        allergyHistoryText: args.allergyHistoryText,
        patientProfile: args.patientProfile ?? null,
      },
    })) as PatientMemory | null) ?? null;
  }

  async replaceSnapshot(args: ReplaceMemorySnapshotArgs): Promise<PatientMemory | null> {
    return ((await invoke('patient_memory_replace_snapshot', {
      input: {
        patientId: args.patientId,
        patientProfile: args.patientProfile ?? null,
        allergyHistory: args.allergyHistory,
        chronicDiagnosisCandidates: args.chronicDiagnosisCandidates,
        recentVisits: args.recentVisits,
        updatedAt: args.updatedAt ?? null,
      },
    })) as PatientMemory | null) ?? null;
  }

  async clear(patientId: string): Promise<void> {
    await invoke('patient_memory_clear', { patientId });
  }

  async clearAll(): Promise<void> {
    await invoke('patient_memory_clear_all');
  }
}

// ---- localStorage fallback ----
// 行为保持与旧实现一致，便于 web 预览和 SQLite 初始化未完成时的兜底。

function storageKeyOf(patientId: string): string {
  return `${STORAGE_PREFIX}:${patientId}`;
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const t = v.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function deriveChronicCandidates(visits: PatientVisitSummary[]): string[] {
  const counts = new Map<string, number>();
  visits.forEach(v => {
    new Set(v.diagnoses || []).forEach(d => {
      const t = d.trim();
      if (!t) return;
      if (ACUTE_DIAGNOSIS_KEYWORDS.some(keyword => t.includes(keyword))) return;
      counts.set(t, (counts.get(t) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHRONIC)
    .map(([d]) => d);
}

function isMeaninglessAllergy(s: string): boolean {
  return /^(无|否认|未发现|none|nkda)$/i.test(s.trim());
}

class LocalStorageBackend implements MemoryBackend {
  readonly mode = 'local-storage' as const;

  async get(patientId: string): Promise<PatientMemory | null> {
    try {
      const raw = localStorage.getItem(storageKeyOf(patientId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.patientId !== patientId) return null;
      return {
        patientId,
        patientProfile: parsed.patientProfile && typeof parsed.patientProfile === 'object'
          ? parsed.patientProfile as PatientProfile
          : null,
        allergyHistory: Array.isArray(parsed.allergyHistory) ? parsed.allergyHistory.filter((s: unknown) => typeof s === 'string') : [],
        chronicDiagnosisCandidates: Array.isArray(parsed.chronicDiagnosisCandidates)
          ? parsed.chronicDiagnosisCandidates.filter((s: unknown) => typeof s === 'string')
          : [],
        recentVisits: Array.isArray(parsed.recentVisits) ? parsed.recentVisits.slice(0, MAX_VISITS) : [],
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
    } catch (err) {
      console.warn('[patientMemory] ls read failed:', patientId, err);
      return null;
    }
  }

  async appendVisit(args: AppendVisitArgs): Promise<PatientMemory | null> {
    const previous = await this.get(args.patientId);
    const visits = [args.visit, ...(previous?.recentVisits || [])].slice(0, MAX_VISITS);
    const incomingAllergy = (args.allergyHistoryText || '')
      .split(/[、,，;；\n]/)
      .map(s => s.trim())
      .filter(s => s && !isMeaninglessAllergy(s));
    const allergyHistory = unique([...(previous?.allergyHistory || []), ...incomingAllergy]).slice(0, MAX_ALLERGY_ITEMS);
    const next: PatientMemory = {
      patientId: args.patientId,
      patientProfile: args.patientProfile ?? previous?.patientProfile ?? null,
      allergyHistory,
      chronicDiagnosisCandidates: deriveChronicCandidates(visits),
      recentVisits: visits,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(storageKeyOf(args.patientId), JSON.stringify(next));
    } catch (err) {
      console.warn('[patientMemory] ls write failed:', args.patientId, err);
    }
    return next;
  }

  async replaceSnapshot(args: ReplaceMemorySnapshotArgs): Promise<PatientMemory | null> {
    const recentVisits = [...args.recentVisits]
      .filter(visit => Number.isFinite(visit.completedAt))
      .sort((left, right) => right.completedAt - left.completedAt)
      .slice(0, MAX_VISITS);
    const next: PatientMemory = {
      patientId: args.patientId,
      patientProfile: args.patientProfile ?? null,
      allergyHistory: unique(args.allergyHistory).filter(item => !isMeaninglessAllergy(item)).slice(0, MAX_ALLERGY_ITEMS),
      chronicDiagnosisCandidates: unique(args.chronicDiagnosisCandidates).slice(0, MAX_CHRONIC),
      recentVisits,
      updatedAt: typeof args.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : Date.now(),
    };
    try {
      localStorage.setItem(storageKeyOf(args.patientId), JSON.stringify(next));
    } catch (err) {
      console.warn('[patientMemory] ls replaceSnapshot failed:', args.patientId, err);
    }
    return next;
  }

  async clear(patientId: string): Promise<void> {
    try {
      localStorage.removeItem(storageKeyOf(patientId));
    } catch (err) {
      console.warn('[patientMemory] ls clear failed:', patientId, err);
    }
  }

  async clearAll(): Promise<void> {
    try {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(`${STORAGE_PREFIX}:`)) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
    } catch (err) {
      console.warn('[patientMemory] ls clearAll failed:', err);
    }
  }
}

// ---- Regional HTTP placeholder ----
// 真实区域化模式接入时再补具体实现；现在只起类型/路由占位作用。

class RegionalHttpBackend implements MemoryBackend {
  readonly mode = 'regional-http' as const;
  constructor(private readonly _baseUrl: string) {}
  async get(_patientId: string): Promise<PatientMemory | null> {
    throw new Error(`[patientMemory] regional-http backend not implemented yet (baseUrl=${this._baseUrl})`);
  }
  async appendVisit(_args: AppendVisitArgs): Promise<PatientMemory | null> {
    throw new Error('[patientMemory] regional-http appendVisit not implemented');
  }
  async replaceSnapshot(_args: ReplaceMemorySnapshotArgs): Promise<PatientMemory | null> {
    throw new Error('[patientMemory] regional-http replaceSnapshot not implemented');
  }
  async clear(_patientId: string): Promise<void> {
    throw new Error('[patientMemory] regional-http clear not implemented');
  }
  async clearAll(): Promise<void> {
    throw new Error('[patientMemory] regional-http clearAll not implemented');
  }
}

// ---- Backend selection ----

let backend: MemoryBackend | null = null;

interface RegionalHint {
  mode?: 'regional' | 'local';
  baseUrl?: string;
}

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

function readRegionalHint(): RegionalHint | null {
  if (typeof window === 'undefined') return null;
  const hint = (window as unknown as { __REGIONAL_MEMORY_BACKEND__?: RegionalHint }).__REGIONAL_MEMORY_BACKEND__;
  return hint && typeof hint === 'object' ? hint : null;
}

export function getMemoryBackend(): MemoryBackend {
  if (backend) return backend;
  const hint = readRegionalHint();
  if (hint?.mode === 'regional' && hint.baseUrl) {
    backend = new RegionalHttpBackend(hint.baseUrl);
  } else if (isTauri()) {
    backend = new SafeBackendWrapper(new TauriSqliteBackend(), new LocalStorageBackend());
  } else {
    backend = new LocalStorageBackend();
  }
  return backend;
}

/**
 * 包装：主后端调用失败时（如 SQLite 还没初始化完、或命令未注册）自动降级到兜底后端。
 * 仅吞掉异常，记录警告，不让上层业务路径因记忆系统挂掉而中断。
 */
class SafeBackendWrapper implements MemoryBackend {
  readonly mode: MemoryBackend['mode'];
  constructor(private readonly primary: MemoryBackend, private readonly fallback: MemoryBackend) {
    this.mode = primary.mode;
  }
  async get(patientId: string): Promise<PatientMemory | null> {
    try {
      return await this.primary.get(patientId);
    } catch (err) {
      console.warn('[patientMemory] primary get failed, fallback:', err);
      return this.fallback.get(patientId);
    }
  }
  async appendVisit(args: AppendVisitArgs): Promise<PatientMemory | null> {
    try {
      return await this.primary.appendVisit(args);
    } catch (err) {
      console.warn('[patientMemory] primary appendVisit failed, fallback:', err);
      return this.fallback.appendVisit(args);
    }
  }
  async replaceSnapshot(args: ReplaceMemorySnapshotArgs): Promise<PatientMemory | null> {
    try {
      return await this.primary.replaceSnapshot(args);
    } catch (err) {
      console.warn('[patientMemory] primary replaceSnapshot failed, fallback:', err);
      return this.fallback.replaceSnapshot(args);
    }
  }
  async clear(patientId: string): Promise<void> {
    try {
      await this.primary.clear(patientId);
    } catch (err) {
      console.warn('[patientMemory] primary clear failed, fallback:', err);
      await this.fallback.clear(patientId);
    }
  }
  async clearAll(): Promise<void> {
    try {
      await this.primary.clearAll();
    } catch (err) {
      console.warn('[patientMemory] primary clearAll failed, fallback:', err);
      await this.fallback.clearAll();
    }
  }
}

/** 测试/调试用：强制重置已选择的后端（下次 getMemoryBackend 重新探测）。 */
export function __resetMemoryBackendForTests(): void {
  backend = null;
}
