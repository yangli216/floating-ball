import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'VOICE_RECORDING_DIR';

export interface VoiceRecordingSaveResult {
  audioPath: string;
  transcriptPath: string;
}

export function getVoiceRecordingDir(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY)?.trim() || '';
}

export function setVoiceRecordingDir(dir: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = dir?.trim();
  if (normalized) {
    localStorage.setItem(STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function pickVoiceRecordingDir(): Promise<string | null> {
  const result = await invoke<string | null>('pick_voice_recording_dir');
  return result ?? null;
}

/**
 * 保存语音录音以及对应的实时转写文本。
 * - 音频以 WAV 格式落盘
 * - 同名 .txt 保存转写文本（成对追溯）
 * - 当 saveDir 为空时，落到 `<app_data>/voice_recordings`
 */
export async function saveVoiceRecording(
  audioBlob: Blob,
  transcript: string,
  saveDir?: string,
): Promise<VoiceRecordingSaveResult> {
  const buffer = await audioBlob.arrayBuffer();
  const audio = Array.from(new Uint8Array(buffer));
  const trimmedDir = saveDir?.trim() || getVoiceRecordingDir() || undefined;
  return await invoke<VoiceRecordingSaveResult>('save_voice_recording', {
    audio,
    transcript: transcript || '',
    saveDir: trimmedDir ?? null,
  });
}
