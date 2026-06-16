/**
 * 最小化会话管理 Composable
 *
 * 当医生在症状问诊（consultation）、语音问诊（voice-consultation）或住院病历生成未结束的状态下
 * 把窗口收起到悬浮球时，把这次会话作为「最小化」记录下来，便于通过：
 *  - 悬浮球对应的按钮
 *  - 双击悬浮球
 * 恢复回原界面。
 *
 * 设计要点：
 *  - 会话槽位（symptom / voice / inpatient-emr）各自独立，可以同时存在；
 *  - 切换患者时旧会话不丢弃，但跨自然日自动失效；
 *  - 由于内存中的组件状态依赖 `v-show` / `v-if` 在 currentView 不变时保留，
 *    本模块只记录"是否最小化、最近一次时间、对应患者就诊 ID"等元数据，
 *    具体业务状态由各组件自己维护或写入各自的缓存（参见 useVoiceConsultation 的 editorSnapshot）。
 *
 * @module composables/useMinimizedSessions
 */

import { computed, ref } from 'vue';
import type { AppPatient } from '../types/appState';
import { getPatientContextAnchorId, getPatientContextId, getPatientContextName } from '../utils/patientContext';

export type MinimizedSessionType = 'symptom' | 'voice' | 'inpatient-emr';

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
  inpatientEmr: MinimizedSessionRecord | null;
}

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function resolveAnchorId(patient: AppPatient | null | undefined): string {
  return getPatientContextAnchorId(patient);
}

function loadPersisted(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { symptom: null, voice: null, inpatientEmr: null };
    const parsed = JSON.parse(raw) as PersistedShape;
    return {
      symptom: parsed?.symptom ?? null,
      voice: parsed?.voice ?? null,
      inpatientEmr: parsed?.inpatientEmr ?? null,
    };
  } catch (error) {
    console.warn('[MinimizedSessions] Failed to read persisted state:', error);
    return { symptom: null, voice: null, inpatientEmr: null };
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
const inpatientEmrSession = ref<MinimizedSessionRecord | null>(null);
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
  inpatientEmrSession.value = persisted.inpatientEmr && isSameLocalDay(persisted.inpatientEmr.recordedAt, now)
    ? persisted.inpatientEmr
    : null;
  // 把过期清理结果写回，避免下次启动还得清一遍
  persist({ symptom: symptomSession.value, voice: voiceSession.value, inpatientEmr: inpatientEmrSession.value });
}

function flush(): void {
  persist({ symptom: symptomSession.value, voice: voiceSession.value, inpatientEmr: inpatientEmrSession.value });
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
  if (inpatientEmrSession.value && !isSameLocalDay(inpatientEmrSession.value.recordedAt, now)) {
    inpatientEmrSession.value = null;
    changed = true;
  }
  if (changed) flush();
}

export function useMinimizedSessions() {
  ensureInitialized();
  pruneExpired();

  function getActive(type: MinimizedSessionType): MinimizedSessionRecord | null {
    pruneExpired();
    if (type === 'symptom') return symptomSession.value;
    if (type === 'voice') return voiceSession.value;
    return inpatientEmrSession.value;
  }

  function recordByAnchor(
    type: MinimizedSessionType,
    anchorId: string,
    meta: { patientId?: string; patientName?: string } = {},
  ): void {
    if (!anchorId) {
      return;
    }
    const entry: MinimizedSessionRecord = {
      type,
      anchorId,
      patientId: meta.patientId,
      patientName: meta.patientName,
      recordedAt: Date.now(),
    };
    if (type === 'symptom') {
      symptomSession.value = entry;
    } else if (type === 'voice') {
      voiceSession.value = entry;
    } else {
      inpatientEmrSession.value = entry;
    }
    flush();
  }

  function record(type: Exclude<MinimizedSessionType, 'inpatient-emr'>, patient: AppPatient | null | undefined): void {
    const anchorId = resolveAnchorId(patient);
    if (!anchorId) {
      // 没有可识别的就诊锚点，不写记录（无法做后续匹配/失效）
      return;
    }
    recordByAnchor(type, anchorId, {
      patientId: getPatientContextId(patient) || undefined,
      patientName: getPatientContextName(patient) || undefined,
    });
  }

  function clear(type: MinimizedSessionType): void {
    if (type === 'symptom') {
      symptomSession.value = null;
    } else if (type === 'voice') {
      voiceSession.value = null;
    } else {
      inpatientEmrSession.value = null;
    }
    flush();
  }

  function clearAll(): void {
    symptomSession.value = null;
    voiceSession.value = null;
    inpatientEmrSession.value = null;
    flush();
  }

  /** 最近一次最小化的会话类型；用于双击小球时决定恢复哪个 */
  const latestType = computed<MinimizedSessionType | null>(() => {
    const sessions = [symptomSession.value, voiceSession.value, inpatientEmrSession.value]
      .filter((session): session is MinimizedSessionRecord => Boolean(session));
    if (sessions.length === 0) return null;
    return sessions.reduce((latest, session) => (
      session.recordedAt >= latest.recordedAt ? session : latest
    )).type;
  });

  return {
    symptomSession,
    voiceSession,
    inpatientEmrSession,
    hasSymptom: computed(() => symptomSession.value !== null),
    hasVoice: computed(() => voiceSession.value !== null),
    hasInpatientEmr: computed(() => inpatientEmrSession.value !== null),
    latestType,
    getActive,
    record,
    recordByAnchor,
    clear,
    clearAll,
  };
}
