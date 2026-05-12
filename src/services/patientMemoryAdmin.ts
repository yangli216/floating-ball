import { invoke } from '@tauri-apps/api/core';
import { getHisAdapter } from './his';
import { getMemoryBackend, type MemoryBackend } from './patientMemoryBackend';
import {
  clearAllPatientMemory,
  clearPatientMemory,
  getPatientMemory,
  mapHisPatientInfoToPatientProfile,
  syncPatientMemoryFromHis,
  type PatientMemory,
} from './patientMemoryStore';
import type { PatientProfile } from './patientMemoryTypes';

const STORAGE_PREFIX = 'PATIENT_MEMORY_V1';

interface TauriPatientMemoryDebugState {
  dbPath: string;
  patientCount: number;
  visitCount: number;
}

export interface PatientMemoryAdminState {
  mode: MemoryBackend['mode'];
  dbPath: string | null;
  patientCount: number;
  visitCount: number;
}

export interface PatientMemoryQueryResult {
  memory: PatientMemory | null;
  patientProfile: PatientProfile | null;
}

function normalizePatientId(patientId: string): string {
  return patientId.trim();
}

function buildLocalStorageDebugState(mode: MemoryBackend['mode']): PatientMemoryAdminState {
  let patientCount = 0;
  let visitCount = 0;

  if (typeof localStorage !== 'undefined') {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(`${STORAGE_PREFIX}:`)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { recentVisits?: unknown[] } | null;
        patientCount += 1;
        visitCount += Array.isArray(parsed?.recentVisits) ? parsed.recentVisits.length : 0;
      } catch (error) {
        console.warn('[patientMemoryAdmin] failed to inspect localStorage record:', key, error);
      }
    }
  }

  return {
    mode,
    dbPath: null,
    patientCount,
    visitCount,
  };
}

export async function getPatientMemoryAdminState(): Promise<PatientMemoryAdminState> {
  const backend = getMemoryBackend();

  if (backend.mode === 'local-sqlite') {
    try {
      const debugState = await invoke<TauriPatientMemoryDebugState>('patient_memory_get_debug_state');
      return {
        mode: backend.mode,
        dbPath: debugState.dbPath,
        patientCount: debugState.patientCount,
        visitCount: debugState.visitCount,
      };
    } catch (error) {
      console.warn('[patientMemoryAdmin] failed to load sqlite debug state, fallback to localStorage:', error);
    }
  }

  return buildLocalStorageDebugState(backend.mode);
}

export async function queryPatientMemoryByPatientId(patientId: string): Promise<PatientMemoryQueryResult> {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    return { memory: null, patientProfile: null };
  }

  const memory = await getPatientMemory(normalizedPatientId);
  if (memory?.patientProfile) {
    return { memory, patientProfile: memory.patientProfile };
  }

  const adapter = getHisAdapter();
  if (!adapter) {
    return { memory, patientProfile: null };
  }

  try {
    const hisInfo = await adapter.fetchPatientInfo(normalizedPatientId);
    return {
      memory,
      patientProfile: mapHisPatientInfoToPatientProfile(hisInfo),
    };
  } catch (error) {
    console.warn('[patientMemoryAdmin] failed to load patient profile from HIS:', normalizedPatientId, error);
    return { memory, patientProfile: null };
  }
}

export async function clearPatientMemoryByPatientId(patientId: string): Promise<void> {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    await clearAllPatientMemory();
    return;
  }
  await clearPatientMemory(normalizedPatientId);
}

export async function resyncPatientMemoryByPatientId(patientId: string): Promise<PatientMemoryQueryResult> {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    throw new Error('请先输入患者 ID');
  }

  const adapter = getHisAdapter();
  if (!adapter) {
    throw new Error('当前没有可用的 HIS 握手上下文，无法从 HIS 重同步患者记忆');
  }

  const hisInfo = await adapter.fetchPatientInfo(normalizedPatientId);
  const hisHistory = await adapter.fetchPatientHistory(normalizedPatientId);
  if (!hisHistory) {
    throw new Error('HIS 未返回该患者的历史记录，未执行重同步');
  }

  const patientProfile = mapHisPatientInfoToPatientProfile(hisInfo);
  await syncPatientMemoryFromHis(normalizedPatientId, hisHistory, { force: true, patientProfile });
  return {
    memory: await getPatientMemory(normalizedPatientId),
    patientProfile,
  };
}