<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue';
import { getLLMConfig, DEFAULT_LLM_CONFIG, testLLMConnection } from '../services/llm';
import { getPMPHAIConfig, pmphaiService } from '../services/pmphai';
import {
  DEFAULT_SPEECH_CONFIG,
  getSpeechConfig,
  getSpeechConfigStorageKeys,
  getSpeechProviderOptions,
  type SpeechProvider,
} from '../services/speechConfig';
import {
  getCachedBootstrap,
  getDeviceCode,
  getRegionalConnectionConfig,
  getRegionalConnectionDefaults,
  isRegionalMode,
  saveRegionalConnectionConfig,
} from '../services/regionalClient';
import {
  reinitializeRegionalRuntime,
  shutdownRegionalRuntime,
} from '../services/regionalRuntime';
import { useTheme } from '../services/themeService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { trackClick, trackError, trackFormSubmit } from '../services/operationTracker';
import {
  setPreferredAudioInputDeviceId,
} from '../services/audioRecorder';
import {
  DEFAULT_AUDIO_INPUT_VALUE,
  SettingsGeneralTab,
  SettingsModelTab,
  SettingsSaveBar,
  UpdateChecker,
  useSettingsAudioInput,
  useSettingsSaveState,
  useSettingsVoiceRecordingDirectory,
} from '@features/settings';
import Icon from '@shared/ui/Icon.vue';
import { formatUserFacingError } from '@shared/lib/errorMessages';

const emit = defineEmits<{
  'open-symptom-manage': [];
  'open-his-log': [];
  'open-medical-cache': [];
}>();

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

const { currentTheme, themes, setTheme } = useTheme();


type TabType = 'general' | 'model' | 'about';
type TabDefinition = {
  id: TabType;
  label: string;
  icon: string;
};

const activeTab = ref<TabType>('general');
const regionalMode = ref(false);
const tabs = computed<TabDefinition[]>(() => [
  { id: 'general', label: '通用设置', icon: 'lucide:settings-2' },
  ...(!regionalMode.value ? [{ id: 'model' as const, label: '模型配置', icon: 'lucide:brain' }] : []),
  { id: 'about', label: '关于版本', icon: 'lucide:info' },
]);

const PROVIDER_PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '百川智能', baseUrl: 'https://api.baichuan-ai.com/v1', model: 'Baichuan-M3' },
  { name: '阿里通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '月之暗面 (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
];

const applyPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
  baseUrl.value = preset.baseUrl;
  model.value = preset.model;
  trackClick('settings_apply_preset', { provider: preset.name });
};

const apiKey = ref('');
const baseUrl = ref('');
const model = ref('');
const fastModel = ref('');
const enableThinking = ref(false);
const alwaysOnTop = ref(true);
const regionalBaseUrl = ref('');
const regionalOrgCode = ref('');
const regionalDeviceCode = ref('');
const regionalDefaults = getRegionalConnectionDefaults();
const regionalConnectResult = ref<{ success: boolean; message: string } | null>(null);
const savingSettings = ref(false);
const testingRegionalConnection = ref(false);

const modelTesting = ref(false);
const modelTestResult = ref<{ success: boolean; message: string } | null>(null);

const reviewerEnabled = ref(true);
const reviewerApiKey = ref('');
const reviewerBaseUrl = ref('');
const reviewerModel = ref('');
const reviewerCheckExaminationEnabled = ref(true);

const reviewerTesting = ref(false);
const reviewerTestResult = ref<{ success: boolean; message: string } | null>(null);

const pmphaiAppKey = ref('');
const pmphaiAppSecret = ref('');
const pmphaiEnabled = ref(true);
const pmphaiTesting = ref(false);
const pmphaiTestResult = ref<{ success: boolean; message: string } | null>(null);
const pmphaiSearchMode = ref<'rag' | 'list'>('rag');

const speechTestMode = ref(false);
const speechConfigStorageKeys = getSpeechConfigStorageKeys();
const speechProviderOptions = getSpeechProviderOptions();
const speechProvider = ref<SpeechProvider>(DEFAULT_SPEECH_CONFIG.provider);
const speechApiKey = ref('');
const speechBaseUrl = ref(DEFAULT_SPEECH_CONFIG.baseUrl);
const speechModel = ref(DEFAULT_SPEECH_CONFIG.model);

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

const handleSelectTheme = (theme: (typeof themes)[number]) => {
  trackClick('settings_theme_change', { themeId: theme.id });
  void setTheme(theme);
};

const handleOpenSymptomManage = () => {
  trackClick('settings_open_symptom_manage');
  emit('open-symptom-manage');
};

const handleOpenMedicalCache = () => {
  trackClick('settings_open_medical_catalog_cache');
  emit('open-medical-cache');
};

const handleOpenHisLog = () => {
  trackClick('settings_open_his_integration_log');
  emit('open-his-log');
};

function formatRegionalConnectionError(baseUrlValue: string, error: unknown): string {
  const message = formatUserFacingError(error, {
    fallback: `无法连接 ${baseUrlValue}，请确认 floating-ball-server 已启动，且该地址可访问。`,
  }).trim();

  if (!message || message.includes('服务暂时无法连接')) {
    return `接入参数已保存，但当前无法连接 ${baseUrlValue}。请确认 floating-ball-server 已启动，且该地址可访问。`;
  }

  if (message.includes('授权已失效') || message.includes('设备鉴权失败')) {
    return `接入参数已保存，但设备鉴权失败。请重新确认 ${baseUrlValue} 的服务状态后重试。`;
  }

  if (message.includes('机构编码不存在')) {
    return `接入参数已保存，但机构编码未被后台识别：${message}`;
  }

  return `接入参数已保存，但当前连接失败：${message}`;
}

function formatRegionalConnectionToast(error: unknown): string {
  const message = formatUserFacingError(error, {
    fallback: '当前后台暂不可达',
  }).trim();

  if (!message || message.includes('服务暂时无法连接')) {
    return '区域化接入参数已保存，但当前后台暂不可达';
  }

  if (message.includes('授权已失效') || message.includes('设备鉴权失败')) {
    return '区域化接入参数已保存，但设备鉴权失败';
  }

  if (message.includes('机构编码不存在')) {
    return '区域化接入参数已保存，但机构编码未被后台识别';
  }

  if (message.includes('/v1/client/register failed: 500')) {
    return '区域化接入参数已保存，但设备注册失败，请查看下方详情';
  }

  if (message.includes('/v1/client/bootstrap failed: 500')) {
    return '区域化接入参数已保存，但后台初始化失败，请查看下方详情';
  }

  return '区域化接入参数已保存，但当前连接失败，请查看下方详情';
}

async function loadRegionalDraftSettings(): Promise<void> {
  const regionalConfig = getRegionalConnectionConfig();
  regionalMode.value = regionalConfig.enabled;
  regionalBaseUrl.value = regionalConfig.baseUrl || regionalDefaults.baseUrl;
  regionalOrgCode.value = regionalConfig.orgCode || regionalDefaults.orgCode;
  regionalDeviceCode.value = regionalConfig.deviceCode || '读取中...';

  try {
    regionalDeviceCode.value = await getDeviceCode();
  } catch {
    regionalDeviceCode.value = regionalConfig.deviceCode;
  }
}

function loadModeDependentSettings(): void {
  const bootstrap = getCachedBootstrap();
  const pmphaiConfig = getPMPHAIConfig();

  if (regionalMode.value) {
    apiKey.value = '';
    baseUrl.value = bootstrap?.llm?.baseUrl || '';
    model.value = bootstrap?.llm?.model || '';
    fastModel.value = bootstrap?.llm?.fastModel || bootstrap?.llm?.model || '';
    enableThinking.value = bootstrap?.llm?.enableThinking ?? false;

    const speechConfig = getSpeechConfig();
    speechProvider.value = speechConfig.provider;
    speechApiKey.value = '';
    speechBaseUrl.value = speechConfig.baseUrl;
    speechModel.value = speechConfig.model;

    reviewerEnabled.value = bootstrap?.reviewer?.enabled ?? false;
    reviewerApiKey.value = '';
    reviewerBaseUrl.value = '';
    reviewerModel.value = bootstrap?.reviewer?.model || '';
    reviewerCheckExaminationEnabled.value = bootstrap?.reviewer?.checkExaminationEnabled ?? (bootstrap?.reviewer?.enabled ?? false);

    pmphaiAppKey.value = '';
    pmphaiAppSecret.value = '';
    pmphaiEnabled.value = bootstrap?.pmphai?.enabled ?? false;
    return;
  }

  const config = getLLMConfig();
  const speechConfig = getSpeechConfig();
  apiKey.value = config.apiKey;
  baseUrl.value = config.baseUrl;
  model.value = config.model;
  fastModel.value = localStorage.getItem('LLM_FAST_MODEL') || import.meta.env.VITE_LLM_FAST_MODEL || '';
  enableThinking.value = config.enableThinking;
  speechProvider.value = speechConfig.provider;
  speechApiKey.value = speechConfig.apiKey === '__REGIONAL_PROXY__' ? '' : speechConfig.apiKey;
  speechBaseUrl.value = speechConfig.baseUrl;
  speechModel.value = speechConfig.model;

  const reviewerEnabledSaved = localStorage.getItem('REVIEWER_ENABLED');
  reviewerEnabled.value = reviewerEnabledSaved === null ? true : reviewerEnabledSaved === 'true';
  reviewerApiKey.value = localStorage.getItem('REVIEWER_API_KEY') || '';
  reviewerBaseUrl.value = localStorage.getItem('REVIEWER_BASE_URL') || '';
  reviewerModel.value = localStorage.getItem('REVIEWER_MODEL') || '';
  const reviewerCheckExaminationEnabledSaved = localStorage.getItem('REVIEWER_CHECK_EXAMINATION_ENABLED');
  reviewerCheckExaminationEnabled.value = reviewerCheckExaminationEnabledSaved === null ? true : reviewerCheckExaminationEnabledSaved === 'true';

  pmphaiAppKey.value = pmphaiConfig.appKey;
  pmphaiAppSecret.value = pmphaiConfig.appSecret;
  pmphaiEnabled.value = pmphaiConfig.enabled;
}

function loadLocalPreferences(): void {
  const savedTop = localStorage.getItem('ALWAYS_ON_TOP');
  alwaysOnTop.value = savedTop === null || savedTop === 'true';
  pmphaiSearchMode.value = (localStorage.getItem('PMPHAI_SEARCH_MODE') as 'rag' | 'list') || 'rag';
  speechTestMode.value = localStorage.getItem('SPEECH_TEST_MODE') === 'true'
    || import.meta.env.VITE_SPEECH_TEST_MODE === 'true';
  loadVoiceRecordingDir();
}

const currentSettingsSnapshot = computed(() => JSON.stringify({
  themeId: currentTheme.value.id,
  alwaysOnTop: alwaysOnTop.value,
  regionalMode: regionalMode.value,
  regionalBaseUrl: regionalBaseUrl.value,
  regionalOrgCode: regionalOrgCode.value,
  selectedAudioInputDeviceId: selectedAudioInputDeviceId.value,
  apiKey: apiKey.value,
  baseUrl: baseUrl.value,
  model: model.value,
  fastModel: fastModel.value,
  enableThinking: enableThinking.value,
  speechProvider: speechProvider.value,
  speechApiKey: speechApiKey.value,
  speechBaseUrl: speechBaseUrl.value,
  speechModel: speechModel.value,
  reviewerEnabled: reviewerEnabled.value,
  reviewerApiKey: reviewerApiKey.value,
  reviewerBaseUrl: reviewerBaseUrl.value,
  reviewerModel: reviewerModel.value,
  reviewerCheckExaminationEnabled: reviewerCheckExaminationEnabled.value,
  pmphaiEnabled: pmphaiEnabled.value,
  pmphaiAppKey: pmphaiAppKey.value,
  pmphaiAppSecret: pmphaiAppSecret.value,
  pmphaiSearchMode: pmphaiSearchMode.value,
  speechTestMode: speechTestMode.value,
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
  regionalMode,
  saving: savingSettings,
  snapshot: currentSettingsSnapshot,
  save: () => saveSettings(),
});

watch(speechProvider, (nextProvider, previousProvider) => {
  if (nextProvider === previousProvider) {
    return;
  }

  if (nextProvider === 'openai-compatible') {
    if (!speechBaseUrl.value) {
      speechBaseUrl.value = DEFAULT_SPEECH_CONFIG.baseUrl;
    }
    if (!speechModel.value || speechModel.value === DEFAULT_SPEECH_CONFIG.model) {
      speechModel.value = 'whisper-1';
    }
    return;
  }

  if (!speechModel.value || speechModel.value === 'whisper-1') {
    speechModel.value = DEFAULT_SPEECH_CONFIG.model;
  }
});

onMounted(async () => {
  await loadRegionalDraftSettings();
  loadModeDependentSettings();
  loadLocalPreferences();
  await hydrateAudioInputDevicesOnMount();
  updateSavedSnapshot();
  markSettingsLoaded();

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', handleAudioDeviceChange);
  }
  window.addEventListener('keydown', handleSaveShortcut);

  if (isRegionalMode() && getCachedBootstrap()) {
    regionalConnectResult.value = {
      success: true,
      message: `已连接区域后台，机构编码 ${regionalOrgCode.value || '未配置'}，设备编码 ${regionalDeviceCode.value}`,
    };
  }
});

onUnmounted(() => {
  if (navigator.mediaDevices?.removeEventListener) {
    navigator.mediaDevices.removeEventListener('devicechange', handleAudioDeviceChange);
  }

  window.removeEventListener('keydown', handleSaveShortcut);
});

async function saveSettings() {
  savingSettings.value = true;
  let regionalToastMessage: string | null = null;

  try {
    const nextRegionalBaseUrl = regionalBaseUrl.value.trim() || regionalDefaults.baseUrl;
    const nextRegionalOrgCode = regionalOrgCode.value.trim() || regionalDefaults.orgCode;

    localStorage.setItem('ALWAYS_ON_TOP', String(alwaysOnTop.value));
    localStorage.setItem('PMPHAI_SEARCH_MODE', pmphaiSearchMode.value);

    if (!regionalMode.value) {
      const nextFastModel = fastModel.value.trim();
      localStorage.setItem('OPENAI_API_KEY', apiKey.value);
      localStorage.setItem('LLM_BASE_URL', baseUrl.value);
      localStorage.setItem('LLM_MODEL', model.value);
      if (nextFastModel) {
        localStorage.setItem('LLM_FAST_MODEL', nextFastModel);
      } else {
        localStorage.removeItem('LLM_FAST_MODEL');
      }
      localStorage.setItem('LLM_ENABLE_THINKING', String(enableThinking.value));
      localStorage.setItem(speechConfigStorageKeys.provider, speechProvider.value);
      localStorage.setItem(speechConfigStorageKeys.apiKey, speechApiKey.value);
      localStorage.setItem(speechConfigStorageKeys.baseUrl, speechBaseUrl.value);
      localStorage.setItem(speechConfigStorageKeys.model, speechModel.value);

      if (speechProvider.value === 'aliyun-dashscope') {
        localStorage.setItem('DASHSCOPE_API_KEY', speechApiKey.value);
        localStorage.removeItem('LLM_AUDIO_BASE_URL');
        localStorage.removeItem('LLM_AUDIO_MODEL');
      } else {
        localStorage.setItem('LLM_AUDIO_BASE_URL', speechBaseUrl.value);
        localStorage.setItem('LLM_AUDIO_MODEL', speechModel.value);
      }

      localStorage.setItem('REVIEWER_ENABLED', String(reviewerEnabled.value));
      localStorage.setItem('REVIEWER_API_KEY', reviewerApiKey.value);
      localStorage.setItem('REVIEWER_BASE_URL', reviewerBaseUrl.value);
      localStorage.setItem('REVIEWER_MODEL', reviewerModel.value);
      localStorage.setItem('REVIEWER_CHECK_EXAMINATION_ENABLED', String(reviewerCheckExaminationEnabled.value));

      localStorage.setItem('PMPHAI_APP_KEY', pmphaiAppKey.value);
      localStorage.setItem('PMPHAI_APP_SECRET', pmphaiAppSecret.value);
      localStorage.setItem('PMPHAI_ENABLED', String(pmphaiEnabled.value));
    }

    if (speechTestMode.value) {
      localStorage.setItem('SPEECH_TEST_MODE', 'true');
    } else {
      localStorage.removeItem('SPEECH_TEST_MODE');
    }

    setPreferredAudioInputDeviceId(resolveSelectedPreferredAudioInputDeviceId());

    trackClick('settings_save', {
      regionalMode: regionalMode.value,
      regionalBaseUrlConfigured: !!nextRegionalBaseUrl,
      regionalOrgCodeConfigured: !!nextRegionalOrgCode,
      hasApiKey: !!apiKey.value,
      hasBaseUrl: !!baseUrl.value,
      model: model.value,
      fastModel: fastModel.value || model.value,
      enableThinking: enableThinking.value,
      reviewerCheckExaminationEnabled: reviewerCheckExaminationEnabled.value,
      speechProvider: speechProvider.value,
      hasSpeechApiKey: !!speechApiKey.value,
      hasSpeechBaseUrl: !!speechBaseUrl.value,
      speechModel: speechModel.value,
      alwaysOnTop: alwaysOnTop.value,
      pmphaiEnabled: pmphaiEnabled.value,
      audioInputMode: selectedAudioInputDeviceId.value === DEFAULT_AUDIO_INPUT_VALUE ? 'system-default' : 'custom-device',
    });

    saveRegionalConnectionConfig({
      enabled: regionalMode.value,
      baseUrl: nextRegionalBaseUrl,
      orgCode: nextRegionalOrgCode,
    });

    if (regionalMode.value) {
      try {
        await reinitializeRegionalRuntime();
        await loadRegionalDraftSettings();
        loadModeDependentSettings();
        regionalConnectResult.value = {
          success: true,
          message: `已连接到 ${nextRegionalBaseUrl}，机构编码 ${nextRegionalOrgCode}，设备编码 ${regionalDeviceCode.value}`,
        };
        regionalToastMessage = '区域化模式已连接并生效';
        trackFormSubmit('regional_connection_saved', {
          regionalMode: true,
          regionalBaseUrl: nextRegionalBaseUrl,
          regionalOrgCode: nextRegionalOrgCode,
        });
      } catch (error: any) {
        regionalConnectResult.value = {
          success: false,
          message: formatRegionalConnectionError(nextRegionalBaseUrl, error),
        };
        regionalToastMessage = formatRegionalConnectionToast(error);
        trackError('regional_connection_reinitialize_failed', error, {
          regionalBaseUrl: nextRegionalBaseUrl,
          regionalOrgCode: nextRegionalOrgCode,
        });
      }
    } else {
      shutdownRegionalRuntime();
      regionalConnectResult.value = {
        success: true,
        message: '已切回本地模式，远端代理已停用',
      };
      await loadRegionalDraftSettings();
      loadModeDependentSettings();
    }

    try {
      const win = getCurrentWindow();
      await win.setAlwaysOnTop(alwaysOnTop.value);
    } catch (error) {
      console.error('Failed to set always on top:', error);
    }

    pmphaiService.clearTokenCache();
    updateSavedSnapshot();

    if (showToast) {
      if (!regionalMode.value) {
        showToast('本地设置已保存', 'success');
      } else if (regionalConnectResult.value?.success) {
        showToast(regionalToastMessage || '区域化模式已连接并生效', 'success');
      } else {
        showToast(regionalToastMessage || '区域化接入参数已保存，但当前连接失败，请查看下方详情', 'info');
      }
    }
  } catch (error: unknown) {
    const message = formatUserFacingError(error, { fallback: '保存失败，请稍后重试。' });
    regionalConnectResult.value = {
      success: false,
      message,
    };
    trackError('settings_save_failed', error);
    if (showToast) {
      showToast(`保存失败：${message}`, 'error');
    }
  } finally {
    savingSettings.value = false;
  }
}

const testRegionalConnection = async () => {
  testingRegionalConnection.value = true;
  regionalConnectResult.value = null;

  const nextRegionalBaseUrl = regionalBaseUrl.value.trim() || regionalDefaults.baseUrl;
  const nextRegionalOrgCode = regionalOrgCode.value.trim() || regionalDefaults.orgCode;
  const previousConfig = getRegionalConnectionConfig();

  try {
    saveRegionalConnectionConfig({
      enabled: true,
      baseUrl: nextRegionalBaseUrl,
      orgCode: nextRegionalOrgCode,
    });
    await reinitializeRegionalRuntime();
    await loadRegionalDraftSettings();
    loadModeDependentSettings();
    regionalConnectResult.value = {
      success: true,
      message: `桌面端已连通 ${nextRegionalBaseUrl}，机构编码 ${nextRegionalOrgCode}，设备编码 ${regionalDeviceCode.value}`,
    };
    trackClick('settings_regional_test', {
      success: true,
      regionalBaseUrl: nextRegionalBaseUrl,
      regionalOrgCode: nextRegionalOrgCode,
    });
    updateSavedSnapshot();
  } catch (error: any) {
    regionalConnectResult.value = {
      success: false,
      message: formatRegionalConnectionError(nextRegionalBaseUrl, error),
    };
    trackError('settings_regional_test_failed', error, {
      regionalBaseUrl: nextRegionalBaseUrl,
      regionalOrgCode: nextRegionalOrgCode,
    });

    saveRegionalConnectionConfig({
      enabled: previousConfig.enabled,
      baseUrl: previousConfig.baseUrl,
      orgCode: previousConfig.orgCode,
    });

    if (previousConfig.enabled) {
      try {
        await reinitializeRegionalRuntime();
      } catch {
        // Ignore rollback reinitialize errors; keep the surfaced test failure.
      }
    } else {
      shutdownRegionalRuntime();
    }

    await loadRegionalDraftSettings();
    loadModeDependentSettings();
    updateSavedSnapshot();
  } finally {
    testingRegionalConnection.value = false;
  }
};

const testModelConnection = async () => {
  modelTesting.value = true;
  modelTestResult.value = null;

  try {
    const result = regionalMode.value
      ? await testLLMConnection()
      : await testLLMConnection({
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        model: model.value,
        enableThinking: enableThinking.value,
      });
    modelTestResult.value = result;
    trackClick('settings_model_test', { success: result.success });
  } catch (error: unknown) {
    modelTestResult.value = {
      success: false,
      message: formatUserFacingError(error, { fallback: '连接失败，请检查模型配置。' }),
    };
    trackError('settings_model_test_failed', error);
  } finally {
    modelTesting.value = false;
  }
};

const testReviewerConnection = async () => {
  reviewerTesting.value = true;
  reviewerTestResult.value = null;

  try {
    const result = regionalMode.value
      ? await testLLMConnection({
        configProfile: 'reviewer',
        model: reviewerModel.value || undefined,
      })
      : await testLLMConnection({
        apiKey: reviewerApiKey.value || apiKey.value,
        baseUrl: reviewerBaseUrl.value || baseUrl.value,
        model: reviewerModel.value || model.value,
      });
    reviewerTestResult.value = result;
    trackClick('settings_reviewer_test', { success: result.success });
  } catch (error: unknown) {
    reviewerTestResult.value = {
      success: false,
      message: formatUserFacingError(error, { fallback: '连接失败，请检查独立审查 AI 配置。' }),
    };
    trackError('settings_reviewer_test_failed', error);
  } finally {
    reviewerTesting.value = false;
  }
};

const testPMPHAIConnection = async () => {
  pmphaiTesting.value = true;
  pmphaiTestResult.value = null;

  if (!regionalMode.value) {
    localStorage.setItem('PMPHAI_APP_KEY', pmphaiAppKey.value);
    localStorage.setItem('PMPHAI_APP_SECRET', pmphaiAppSecret.value);
    localStorage.setItem('PMPHAI_ENABLED', 'true');
  }
  pmphaiService.clearTokenCache();

  try {
    const result = await pmphaiService.testConnection();
    pmphaiTestResult.value = result;
    trackClick('settings_pmphai_test', { success: result.success });
  } catch (error: unknown) {
    pmphaiTestResult.value = {
      success: false,
      message: formatUserFacingError(error, { fallback: '连接失败，请检查知识库配置。' }),
    };
    trackError('settings_pmphai_test_failed', error);
  } finally {
    pmphaiTesting.value = false;
  }
};

watch(activeTab, (newVal) => {
  trackClick('settings_tab_change', { tab: newVal });
});

watch(regionalMode, (enabled) => {
  regionalConnectResult.value = null;
  if (enabled && activeTab.value === 'model') {
    activeTab.value = 'general';
  }
});

watch([regionalBaseUrl, regionalOrgCode], () => {
  regionalConnectResult.value = null;
});
</script>

<template>
  <div class="settings-panel">
    <!-- Header -->
    <!-- Header Removed -->


    <!-- Tabs Navigation -->
    <div class="tabs-header">
      <button v-for="tab in tabs" :key="tab.id" :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id as TabType">
        <Icon :icon="tab.icon" :size="18" class="tab-icon" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="settings-content">
      <SettingsGeneralTab
        v-if="activeTab === 'general'"
        v-model:always-on-top="alwaysOnTop"
        v-model:regional-mode="regionalMode"
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
        @open-his-log="handleOpenHisLog"
        @open-medical-cache="handleOpenMedicalCache"
        @open-symptom-manage="handleOpenSymptomManage"
        @pick-voice-recording-dir="handlePickVoiceRecordingDir"
        @refresh-audio-input-devices="refreshAudioInputDevices"
        @select-theme="handleSelectTheme"
        @test-regional-connection="testRegionalConnection"
      />

      <SettingsModelTab
        v-if="activeTab === 'model' && !regionalMode"
        v-model:api-key="apiKey"
        v-model:base-url="baseUrl"
        v-model:enable-thinking="enableThinking"
        v-model:fast-model="fastModel"
        v-model:model="model"
        v-model:pmphai-app-key="pmphaiAppKey"
        v-model:pmphai-app-secret="pmphaiAppSecret"
        v-model:pmphai-enabled="pmphaiEnabled"
        v-model:pmphai-search-mode="pmphaiSearchMode"
        v-model:reviewer-api-key="reviewerApiKey"
        v-model:reviewer-base-url="reviewerBaseUrl"
        v-model:reviewer-check-examination-enabled="reviewerCheckExaminationEnabled"
        v-model:reviewer-enabled="reviewerEnabled"
        v-model:reviewer-model="reviewerModel"
        v-model:speech-api-key="speechApiKey"
        v-model:speech-base-url="speechBaseUrl"
        v-model:speech-model="speechModel"
        v-model:speech-provider="speechProvider"
        v-model:speech-test-mode="speechTestMode"
        :default-llm-config="DEFAULT_LLM_CONFIG"
        :default-speech-config="DEFAULT_SPEECH_CONFIG"
        :model-test-result="modelTestResult"
        :model-testing="modelTesting"
        :pmphai-test-result="pmphaiTestResult"
        :pmphai-testing="pmphaiTesting"
        :provider-presets="PROVIDER_PRESETS"
        :regional-mode="regionalMode"
        :reviewer-test-result="reviewerTestResult"
        :reviewer-testing="reviewerTesting"
        :speech-provider-options="speechProviderOptions"
        @apply-preset="applyPreset"
        @test-model-connection="testModelConnection"
        @test-pmphai-connection="testPMPHAIConnection"
        @test-reviewer-connection="testReviewerConnection"
      />

      <!-- About Tab -->
      <div v-if="activeTab === 'about'" class="tab-pane">
        <UpdateChecker />
      </div>
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
/* Medical Theme Variables - Scoped to SettingsPanel only */
.settings-panel {
  /* Medical Colors */
  --medical-primary: #0891B2;
  --medical-primary-hover: #0E7490;
  --medical-success: #059669;
  --medical-text-primary: #164E63;
  --medical-text-secondary: #0F172A;
  --medical-text-muted: #475569;
  --medical-bg-primary: #FFFFFF;
  --medical-bg-secondary: #F8FAFC;
  --medical-bg-tertiary: #F1F5F9;
  --medical-border-light: #E2E8F0;
  --medical-border-medium: #CBD5E1;
  --medical-info-bg: #DBEAFE;
  --medical-info: #3B82F6;

  /* Layout */
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--medical-bg-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
/* Tabs */
.tabs-header {
  display: flex;
  gap: 8px;
  padding: 16px 24px 0;
  background: var(--medical-bg-primary);
  border-bottom: 2px solid var(--medical-border-light);
  overflow-x: auto;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--medical-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
  min-height: 44px;
}

.tab-btn:hover {
  color: var(--medical-text-primary);
  background: var(--medical-bg-tertiary);
}

.tab-btn.active {
  color: var(--medical-primary);
  border-bottom-color: var(--medical-primary);
  font-weight: 600;
}

.tab-icon {
  flex-shrink: 0;
}

/* Content */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 640px) {
  .tabs-header {
    padding: 12px 16px 0;
  }

  .tab-btn {
    padding: 10px 12px;
    font-size: 12px;
  }

  .settings-content {
    padding: 16px;
  }
}
</style>
