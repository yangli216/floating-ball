import { ref } from 'vue';
import {
  getVoiceRecordingDir,
  pickVoiceRecordingDir,
  setVoiceRecordingDir,
} from '@services/voiceRecordingStorage';

export interface SettingsVoiceRecordingDirectoryOptions {
  notify?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function useSettingsVoiceRecordingDirectory(
  options: SettingsVoiceRecordingDirectoryOptions = {}
) {
  const voiceRecordingDir = ref('');
  const voicePickingDir = ref(false);

  const loadVoiceRecordingDir = () => {
    voiceRecordingDir.value = getVoiceRecordingDir();
  };

  const handlePickVoiceRecordingDir = async () => {
    if (voicePickingDir.value) return;
    voicePickingDir.value = true;
    try {
      const picked = await pickVoiceRecordingDir();
      if (picked) {
        voiceRecordingDir.value = picked;
        setVoiceRecordingDir(picked);
        options.notify?.('录音保存目录已更新', 'success');
      }
    } catch (err) {
      console.error('[Settings] pickVoiceRecordingDir failed', err);
      options.notify?.(`选择目录失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      voicePickingDir.value = false;
    }
  };

  const handleClearVoiceRecordingDir = () => {
    voiceRecordingDir.value = '';
    setVoiceRecordingDir(null);
    options.notify?.('已恢复默认保存目录', 'info');
  };

  return {
    handleClearVoiceRecordingDir,
    handlePickVoiceRecordingDir,
    loadVoiceRecordingDir,
    voicePickingDir,
    voiceRecordingDir,
  };
}
