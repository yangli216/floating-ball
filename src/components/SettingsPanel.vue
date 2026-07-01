<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  getCachedBootstrap,
  getDeviceCode,
  getRegionalConnectionConfig,
  getRegionalConnectionDefaults,
  saveRegionalConnectionConfig,
} from '../services/regionalClient';
import { reinitializeRegionalRuntime } from '../services/regionalRuntime';
import { useTheme } from '../services/themeService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { trackClick, trackError, trackFormSubmit } from '../services/operationTracker';
import { setPreferredAudioInputDeviceId } from '../services/audioRecorder';
import {
  DEFAULT_AUDIO_INPUT_VALUE,
  SettingsGeneralTab,
  SettingsSaveBar,
  UpdateChecker,
  useSettingsAudioInput,
  useSettingsSaveState,
  useSettingsVoiceRecordingDirectory,
} from '@features/settings';
import Icon from '@shared/ui/Icon.vue';
import { formatUserFacingError } from '@shared/lib/errorMessages';

const emit = defineEmits<{
  'open-his-log': [];
  'open-medical-cache': [];
}>();

const showToast = inject('showToast') as ((msg: string, type: 'success' | 'error' | 'info') => void) | undefined;
const { currentTheme, themes, setTheme } = useTheme();

type TabType = 'general' | 'about';
const activeTab = ref<TabType>('general');
const tabs = [
  { id: 'general' as const, label: '通用设置', icon: 'lucide:settings-2' },
  { id: 'about' as const, label: '关于版本', icon: 'lucide:info' },
];

const alwaysOnTop = ref(true);
const regionalBaseUrl = ref('');
const regionalOrgCode = ref('');
const regionalDeviceCode = ref('');
const regionalDefaults = getRegionalConnectionDefaults();
const regionalConnectResult = ref<{ success: boolean; message: string } | null>(null);
const savingSettings = ref(false);
const testingRegionalConnection = ref(false);

const {
  audioDeviceError,
  audioDeviceLoading,
  audioInputDevices,
  audioInputOptions,
  handleAudioDeviceChange,
  hydrateAudioInputDevicesOnMount,
  refreshAudioInputDevices,
  resolveSelectedPreferredAudioInputDeviceId,
  selectedAudioInputDeviceId,
} = useSettingsAudioInput({
  trackRefresh: ({ requestPermission, deviceCount }) => {
    trackClick('settings_audio_devices_refresh', { requestPermission, deviceCount });
  },
  trackError,
});

const {
  handleClearVoiceRecordingDir,
  handlePickVoiceRecordingDir,
  loadVoiceRecordingDir,
  voicePickingDir,
  voiceRecordingDir,
} = useSettingsVoiceRecordingDirectory({ notify: showToast });

const currentSettingsSnapshot = computed(() => JSON.stringify({
  themeId: currentTheme.value.id,
  alwaysOnTop: alwaysOnTop.value,
  regionalBaseUrl: regionalBaseUrl.value,
  regionalOrgCode: regionalOrgCode.value,
  selectedAudioInputDeviceId: selectedAudioInputDeviceId.value,
}));

const {
  handleSaveShortcut,
  hasUnsavedChanges,
  markSettingsLoaded,
  saveBarDescription,
  saveShortcutLabel,
  shouldShowSaveBar,
  updateSavedSnapshot,
} = useSettingsSaveState({
  activeTab,
  saving: savingSettings,
  snapshot: currentSettingsSnapshot,
  save: () => saveSettings(),
});

function formatRegionalConnectionError(baseUrl: string, error: unknown): string {
  const message = formatUserFacingError(error, {
    fallback: `无法连接 ${baseUrl}，请确认 floating-ball-server 已启动，且该地址可访问。`,
  }).trim();
  if (message.includes('授权已失效') || message.includes('设备鉴权失败')) {
    return `参数已保存，但设备鉴权失败：${message}`;
  }
  if (message.includes('机构编码不存在')) {
    return `参数已保存，但机构编码未被后台识别：${message}`;
  }
  return `参数已保存，但当前连接失败：${message}`;
}

async function loadConnectionSettings(): Promise<void> {
  const config = getRegionalConnectionConfig();
  regionalBaseUrl.value = config.baseUrl || regionalDefaults.baseUrl;
  regionalOrgCode.value = config.orgCode || regionalDefaults.orgCode;
  regionalDeviceCode.value = config.deviceCode || '读取中…';
  try {
    regionalDeviceCode.value = await getDeviceCode();
  } catch {
    regionalDeviceCode.value = config.deviceCode;
  }
}

async function applyAlwaysOnTop(): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(alwaysOnTop.value);
  } catch (error) {
    console.error('Failed to set always on top:', error);
  }
}

async function saveSettings(): Promise<void> {
  savingSettings.value = true;
  const baseUrl = regionalBaseUrl.value.trim() || regionalDefaults.baseUrl;
  const orgCode = regionalOrgCode.value.trim() || regionalDefaults.orgCode;
  try {
    localStorage.setItem('ALWAYS_ON_TOP', String(alwaysOnTop.value));
    setPreferredAudioInputDeviceId(resolveSelectedPreferredAudioInputDeviceId());
    saveRegionalConnectionConfig({ baseUrl, orgCode });

    try {
      await reinitializeRegionalRuntime();
      await loadConnectionSettings();
      regionalConnectResult.value = {
        success: true,
        message: `已连接到 ${baseUrl}，机构编码 ${orgCode}，设备编码 ${regionalDeviceCode.value}`,
      };
      trackFormSubmit('regional_connection_saved', { regionalBaseUrl: baseUrl, regionalOrgCode: orgCode });
      showToast?.('后台接入参数已保存并生效', 'success');
    } catch (error) {
      regionalConnectResult.value = { success: false, message: formatRegionalConnectionError(baseUrl, error) };
      trackError('regional_connection_reinitialize_failed', error, { regionalBaseUrl: baseUrl, regionalOrgCode: orgCode });
      showToast?.('接入参数已保存，但后台当前不可达', 'info');
    }

    await applyAlwaysOnTop();
    updateSavedSnapshot();
  } catch (error) {
    const message = formatUserFacingError(error, { fallback: '保存失败，请稍后重试。' });
    regionalConnectResult.value = { success: false, message };
    trackError('settings_save_failed', error);
    showToast?.(`保存失败：${message}`, 'error');
  } finally {
    savingSettings.value = false;
  }
}

async function testRegionalConnection(): Promise<void> {
  testingRegionalConnection.value = true;
  regionalConnectResult.value = null;
  const baseUrl = regionalBaseUrl.value.trim() || regionalDefaults.baseUrl;
  const orgCode = regionalOrgCode.value.trim() || regionalDefaults.orgCode;
  const previousConfig = getRegionalConnectionConfig();
  try {
    saveRegionalConnectionConfig({ baseUrl, orgCode });
    await reinitializeRegionalRuntime({ skipDataSync: true, skipAuditLog: true });
    await loadConnectionSettings();
    regionalConnectResult.value = {
      success: true,
      message: `桌面端已连通 ${baseUrl}，机构编码 ${orgCode}，设备编码 ${regionalDeviceCode.value}`,
    };
    trackClick('settings_regional_test', { success: true, regionalBaseUrl: baseUrl, regionalOrgCode: orgCode });
    updateSavedSnapshot();
  } catch (error) {
    regionalConnectResult.value = { success: false, message: formatRegionalConnectionError(baseUrl, error) };
    trackError('settings_regional_test_failed', error, { regionalBaseUrl: baseUrl, regionalOrgCode: orgCode });
    saveRegionalConnectionConfig({ baseUrl: previousConfig.baseUrl, orgCode: previousConfig.orgCode });
    try {
      await reinitializeRegionalRuntime({ skipDataSync: true, skipAuditLog: true });
    } catch {
      // 保留原始连通性错误；旧配置也不可达时由后续业务请求继续提示。
    }
    await loadConnectionSettings();
    updateSavedSnapshot();
  } finally {
    testingRegionalConnection.value = false;
  }
}

onMounted(async () => {
  await loadConnectionSettings();
  alwaysOnTop.value = localStorage.getItem('ALWAYS_ON_TOP') !== 'false';
  loadVoiceRecordingDir();
  await hydrateAudioInputDevicesOnMount();
  updateSavedSnapshot();
  markSettingsLoaded();
  navigator.mediaDevices?.addEventListener?.('devicechange', handleAudioDeviceChange);
  window.addEventListener('keydown', handleSaveShortcut);
  if (getCachedBootstrap()) {
    regionalConnectResult.value = {
      success: true,
      message: `已连接服务端，机构编码 ${regionalOrgCode.value}，设备编码 ${regionalDeviceCode.value}`,
    };
  }
});

onUnmounted(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', handleAudioDeviceChange);
  window.removeEventListener('keydown', handleSaveShortcut);
});

watch(activeTab, tab => trackClick('settings_tab_change', { tab }));
watch([regionalBaseUrl, regionalOrgCode], () => { regionalConnectResult.value = null; });
</script>

<template>
  <div class="settings-panel">
    <div class="tabs-header">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <Icon :icon="tab.icon" :size="18" class="tab-icon" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="settings-content">
      <SettingsGeneralTab
        v-if="activeTab === 'general'"
        v-model:always-on-top="alwaysOnTop"
        v-model:regional-base-url="regionalBaseUrl"
        v-model:regional-org-code="regionalOrgCode"
        v-model:selected-audio-input-device-id="selectedAudioInputDeviceId"
        :audio-device-error="audioDeviceError"
        :audio-device-loading="audioDeviceLoading"
        :audio-input-devices="audioInputDevices"
        :audio-input-options="audioInputOptions"
        :current-theme="currentTheme"
        :default-audio-input-value="DEFAULT_AUDIO_INPUT_VALUE"
        :regional-connect-result="regionalConnectResult"
        :regional-defaults="regionalDefaults"
        :regional-device-code="regionalDeviceCode"
        :testing-regional-connection="testingRegionalConnection"
        :themes="themes"
        :voice-picking-dir="voicePickingDir"
        :voice-recording-dir="voiceRecordingDir"
        @clear-voice-recording-dir="handleClearVoiceRecordingDir"
        @open-his-log="emit('open-his-log')"
        @open-medical-cache="emit('open-medical-cache')"
        @pick-voice-recording-dir="handlePickVoiceRecordingDir"
        @refresh-audio-input-devices="refreshAudioInputDevices"
        @select-theme="theme => { trackClick('settings_theme_change', { themeId: theme.id }); void setTheme(theme); }"
        @test-regional-connection="testRegionalConnection"
      />
      <div v-else class="tab-pane"><UpdateChecker /></div>
    </div>

    <SettingsSaveBar
      v-if="shouldShowSaveBar"
      :description="saveBarDescription"
      :dirty="hasUnsavedChanges"
      :saving="savingSettings"
      :shortcut-label="saveShortcutLabel"
      @save="saveSettings"
    />
  </div>
</template>

<style scoped>
.settings-panel {
  --medical-primary: #0891b2;
  --medical-primary-hover: #0e7490;
  --medical-success: #059669;
  --medical-text-primary: #164e63;
  --medical-text-secondary: #0f172a;
  --medical-text-muted: #475569;
  --medical-bg-primary: #fff;
  --medical-bg-secondary: #f8fafc;
  --medical-bg-tertiary: #f1f5f9;
  --medical-border-light: #e2e8f0;
  --medical-border-medium: #cbd5e1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--medical-bg-secondary);
}

.tabs-header {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
  border-bottom: 1px solid var(--medical-border-light);
  background: var(--medical-bg-primary);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--medical-text-muted);
  cursor: pointer;
}

.tab-btn.active {
  border-bottom-color: var(--medical-primary);
  color: var(--medical-primary);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-pane {
  height: 100%;
}
</style>
