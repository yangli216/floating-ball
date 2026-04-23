/**
 * 模板服务 - 管理中医/西医模板切换
 * 区域化模式下支持从后端增量同步模板
 */
import westernTemplates from '../assets/templates.json';
import tcmTemplates from '../assets/tcm-templates.json';
import { isRegionalMode, regionalGet } from './regionalClient';

export type MedicalMode = 'western' | 'tcm';

const MEDICAL_MODE_KEY = 'MEDICAL_MODE';
const REMOTE_TEMPLATES_KEY = 'REGIONAL_TEMPLATES_CACHE';
const REMOTE_TEMPLATES_VERSION_KEY = 'REGIONAL_TEMPLATES_VERSION';

// ─── 远程模板缓存 ──────────────────────────────────────────────────────────

interface RemoteTemplateData {
  western: any[];
  tcm: any[];
}

let remoteTemplateCache: RemoteTemplateData | null = null;

function loadRemoteTemplatesFromCache(): RemoteTemplateData | null {
  if (remoteTemplateCache) return remoteTemplateCache;
  try {
    const cached = localStorage.getItem(REMOTE_TEMPLATES_KEY);
    if (cached) {
      remoteTemplateCache = JSON.parse(cached);
      return remoteTemplateCache;
    }
  } catch { /* invalid cache */ }
  return null;
}

/**
 * 从 core-service 增量同步模板
 */
export async function syncRemoteTemplates(): Promise<void> {
  if (!isRegionalMode()) return;

  try {
    const currentVersion = localStorage.getItem(REMOTE_TEMPLATES_VERSION_KEY) || '0';
    let resp = await regionalGet<{
      version: string;
      western?: any[];
      tcm?: any[];
    }>(`/v1/client/templates/delta?version=${encodeURIComponent(currentVersion)}`);

    // 合并到缓存
    const existing = loadRemoteTemplatesFromCache();
    // 如果只剩版本号但缓存丢失，需要强制拉一次全量，避免误判为“已同步”
    if (!existing && resp.version === currentVersion && currentVersion !== '0') {
      resp = await regionalGet<{
        version: string;
        western?: any[];
        tcm?: any[];
      }>('/v1/client/templates/delta?version=0');
    }

    const merged = existing || { western: [], tcm: [] };
    if (resp.version !== currentVersion || !existing) {
      merged.western = Array.isArray(resp.western) ? resp.western : [];
      merged.tcm = Array.isArray(resp.tcm) ? resp.tcm : [];
    }

    remoteTemplateCache = merged;
    localStorage.setItem(REMOTE_TEMPLATES_KEY, JSON.stringify(merged));
    localStorage.setItem(REMOTE_TEMPLATES_VERSION_KEY, resp.version);
    console.log(`[TemplateService] Synced templates, version=${resp.version}`);
  } catch (err) {
    console.warn('[TemplateService] Template sync failed, using cached:', err);
  }
}

/**
 * 获取当前医学模式
 */
export function getMedicalMode(): MedicalMode {
  const saved = localStorage.getItem(MEDICAL_MODE_KEY);
  return (saved === 'tcm' || saved === 'western') ? saved : 'western';
}

/**
 * 设置医学模式
 */
export function setMedicalMode(mode: MedicalMode): void {
  localStorage.setItem(MEDICAL_MODE_KEY, mode);
}

/**
 * 获取当前模式的症状模板数据（统一返回症状数组）
 * 区域化模式下优先使用远程模板
 */
export function getTemplates(): any[] {
  const mode = getMedicalMode();

  // 区域化模式：优先使用远程模板
  if (isRegionalMode()) {
    const remote = loadRemoteTemplatesFromCache();
    if (remote) {
      if (mode === 'tcm') return remote.tcm;
      if (mode === 'western') return remote.western;
    }
  }

  // 本地 fallback
  if (mode === 'tcm') {
    return (tcmTemplates as any).symptoms || [];
  }
  return westernTemplates as any[];
}

/**
 * 获取西医模板（症状数组）
 */
export function getWesternTemplates(): any[] {
  if (isRegionalMode()) {
    const remote = loadRemoteTemplatesFromCache();
    if (remote) return remote.western;
  }
  return westernTemplates as any[];
}

/**
 * 获取中医模板（症状数组）
 */
export function getTCMTemplates(): any[] {
  if (isRegionalMode()) {
    const remote = loadRemoteTemplatesFromCache();
    if (remote) return remote.tcm;
  }
  return (tcmTemplates as any).symptoms || [];
}

/**
 * 判断当前是否为中医模式
 */
export function isTCMMode(): boolean {
  return getMedicalMode() === 'tcm';
}

/**
 * 获取模式显示名称
 */
export function getModeLabel(mode: MedicalMode): string {
  return mode === 'tcm' ? '中医' : '西医';
}
