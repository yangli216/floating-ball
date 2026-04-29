/**
 * 最小化会话管理 Composable
 *
 * 当医生在症状问诊（consultation）或语音问诊（voice-consultation）未结束的状态下
 * 把窗口收起到悬浮球时，把这次会话作为「最小化」记录下来，便于通过：
 *  - 悬浮球对应的按钮
 *  - 双击悬浮球
 * 恢复回原界面。
 *
 * 设计要点：
 *  - 两个会话槽位（symptom / voice）各自独立，可以同时存在；
 *  - 切换患者时旧会话不丢弃，但跨自然日自动失效；
 *  - 由于内存中的组件状态依赖 `v-show` / `v-if` 在 currentView 不变时保留，
 *    本模块只记录"是否最小化、最近一次时间、对应患者就诊 ID"等元数据，
 *    具体业务状态由各组件自己维护或写入各自的缓存（参见 useVoiceConsultation 的 editorSnapshot）。
 *
 * @module composables/useMinimizedSessions
 */

import { computed, ref } from 'vue';
import type { AppPatient } from '../types/appState';

export type MinimizedSessionType = 'symptom' | 'voice';

interface MinimizedSessionRecord {
  type: MinimizedSessionType;
  /** 最小化时关联的就诊/患者锚点 ID（用于跨自然日比对、避免污染） */
  anchorId: string;
  /** 最小化时的患者快照（仅存关键信息，便于排错） */
  patientId?: string;
  patientName?: string;
  /** 最小化触发时间戳（ms） */
  recordedAt: number;
}

const STORAGE_KEY = 'MINIMIZED_SESSIONS_V1';

interface PersistedShape {
  symptom: MinimizedSessionRecord | null;
  voice: MinimizedSessionRecord | null;
}

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function resolveAnchorId(patient: AppPatient | null | undefined): string {
  return String(
    patient?.idVis
      || patient?.idPi
      || patient?.patientId
      || patient?.id
      || '',
  );
}

function loadPersisted(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { symptom: null, voice: null };
    const parsed = JSON.parse(raw) as PersistedShape;
    return {
      symptom: parsed?.symptom ?? null,
      voice: parsed?.voice ?? null,
    };
  } catch (error) {
    console.warn('[MinimizedSessions] Failed to read persisted state:', error);
    return { symptom: null, voice: null };
  }
}

function persist(state: PersistedShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[MinimizedSessions] Failed to persist state:', error);
  }
}

// 单例 state（应用内全局唯一）
const symptomSession = ref<MinimizedSessionRecord | null>(null);
const voiceSession = ref<MinimizedSessionRecord | null>(null);
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  const persisted = loadPersisted();
  // 初次加载时即做一轮跨自然日清理
  const now = Date.now();
  symptomSession.value = persisted.symptom && isSameLocalDay(persisted.symptom.recordedAt, now)
    ? persisted.symptom
    : null;
  voiceSession.value = persisted.voice && isSameLocalDay(persisted.voice.recordedAt, now)
    ? persisted.voice
    : null;
  // 把过期清理结果写回，避免下次启动还得清一遍
  persist({ symptom: symptomSession.value, voice: voiceSession.value });
}

function flush(): void {
  persist({ symptom: symptomSession.value, voice: voiceSession.value });
}

function pruneExpired(): void {
  const now = Date.now();
  let changed = false;
  if (symptomSession.value && !isSameLocalDay(symptomSession.value.recordedAt, now)) {
    symptomSession.value = null;
    changed = true;
  }
  if (voiceSession.value && !isSameLocalDay(voiceSession.value.recordedAt, now)) {
    voiceSession.value = null;
    changed = true;
  }
  if (changed) flush();
}

export function useMinimizedSessions() {
  ensureInitialized();
  pruneExpired();

  function getActive(type: MinimizedSessionType): MinimizedSessionRecord | null {
    pruneExpired();
    return type === 'symptom' ? symptomSession.value : voiceSession.value;
  }

  function record(type: MinimizedSessionType, patient: AppPatient | null | undefined): void {
    const anchorId = resolveAnchorId(patient);
    if (!anchorId) {
      // 没有可识别的就诊锚点，不写记录（无法做后续匹配/失效）
      return;
    }
    const entry: MinimizedSessionRecord = {
      type,
      anchorId,
      patientId: String(patient?.idPi || patient?.patientId || '') || undefined,
      patientName: String(patient?.name || patient?.naPi || '') || undefined,
      recordedAt: Date.now(),
    };
    if (type === 'symptom') {
      symptomSession.value = entry;
    } else {
      voiceSession.value = entry;
    }
    flush();
  }

  function clear(type: MinimizedSessionType): void {
    if (type === 'symptom') {
      symptomSession.value = null;
    } else {
      voiceSession.value = null;
    }
    flush();
  }

  function clearAll(): void {
    symptomSession.value = null;
    voiceSession.value = null;
    flush();
  }

  /** 最近一次最小化的会话类型；用于双击小球时决定恢复哪个 */
  const latestType = computed<MinimizedSessionType | null>(() => {
    const s = symptomSession.value;
    const v = voiceSession.value;
    if (!s && !v) return null;
    if (s && !v) return 'symptom';
    if (!s && v) return 'voice';
    return (s!.recordedAt >= v!.recordedAt) ? 'symptom' : 'voice';
  });

  return {
    symptomSession,
    voiceSession,
    hasSymptom: computed(() => symptomSession.value !== null),
    hasVoice: computed(() => voiceSession.value !== null),
    latestType,
    getActive,
    record,
    clear,
    clearAll,
  };
}
