/**
 * 语音结果页 editorSnapshot 持久化 controller。
 *
 * 只负责快照的节流 / 立即写入和 pending timer 清理；
 * 快照内容与患者来源由页面显式注入，快照恢复仍留在页面编排。
 */

import type { AppPatient } from '@/types/appState';
import type { VoiceEditorSnapshot } from './voiceConsultationCache';

export interface VoiceEditorSnapshotPersistenceOptions {
  getPatient: () => AppPatient | null | undefined;
  shouldPersist: () => boolean;
  getSnapshot: () => VoiceEditorSnapshot;
  persist: (patient: AppPatient, snapshot: VoiceEditorSnapshot) => void;
  delayMs?: number;
}

export function useVoiceEditorSnapshotPersistence(options: VoiceEditorSnapshotPersistenceOptions) {
  const delayMs = options.delayMs ?? 600;
  let snapshotPersistTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingSnapshotPersist(): void {
    if (!snapshotPersistTimer) {
      return;
    }
    clearTimeout(snapshotPersistTimer);
    snapshotPersistTimer = null;
  }

  function canPersistSnapshot(): boolean {
    return options.shouldPersist() && Boolean(options.getPatient());
  }

  function persistSnapshotNow(): void {
    if (!canPersistSnapshot()) {
      return;
    }

    const patient = options.getPatient();
    if (!patient) {
      return;
    }

    options.persist(patient, options.getSnapshot());
  }

  function schedulePersistEditorSnapshot(): void {
    if (!canPersistSnapshot()) {
      return;
    }

    clearPendingSnapshotPersist();
    snapshotPersistTimer = setTimeout(() => {
      snapshotPersistTimer = null;
      persistSnapshotNow();
    }, delayMs);
  }

  function persistEditorSnapshotImmediate(): void {
    clearPendingSnapshotPersist();
    persistSnapshotNow();
  }

  return {
    clearPendingSnapshotPersist,
    persistEditorSnapshotImmediate,
    schedulePersistEditorSnapshot,
  };
}
