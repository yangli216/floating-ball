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
  medicalDataService,
  type MedicalCatalogClearResult,
  type MedicalCatalogDebugState,
} from '../services/medicalData';
import {
  getCachedBootstrap,
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
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { trackClick, trackError, trackFormSubmit } from '../services/operationTracker';
import {
  getMicrophoneErrorMessage,
  getMicrophonePermissionState,
  getPreferredAudioInputDeviceId,
  listAudioInputDevices,
  setPreferredAudioInputDeviceId,
  type AudioInputDeviceOption,
} from '../services/audioRecorder';
import UpdateChecker from './UpdateChecker.vue';
import Icon from './Icon.vue';

const emit = defineEmits<{
  'view-analytics': [];
  'open-symptom-manage': [];
}>();

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

const { currentTheme, themes, setTheme } = useTheme();

const getThemePreviewStyle = (theme: typeof themes[0]) => ({
  background: theme.colors.background,
  borderColor: theme.colors.borderLight,
});

type TabType = 'general' | 'model' | 'about' | 'data';
const activeTab = ref<TabType>('general');
const tabs = [
  { id: 'general', label: '通用设置', icon: 'lucide:settings-2' },
  { id: 'model', label: '模型配置', icon: 'lucide:brain' },
  { id: 'data', label: '数据管理', icon: 'lucide:database' },
  { id: 'about', label: '关于版本', icon: 'lucide:info' },
];

const settingsLoaded = ref(false);
const lastSavedSnapshot = ref('');

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
const alwaysOnTop = ref(true);
const regionalMode = ref(false);
const regionalBaseUrl = ref('');
const regionalOrgCode = ref('');
const regionalDeviceCode = ref('');
const regionalConnectResult = ref<{ success: boolean; message: string } | null>(null);
const savingSettings = ref(false);
const testingRegionalConnection = ref(false);

const modelTesting = ref(false);
const modelTestResult = ref<{ success: boolean; message: string } | null>(null);

const reviewerEnabled = ref(true);
const reviewerApiKey = ref('');
const reviewerBaseUrl = ref('');
const reviewerModel = ref('');

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
const isOpenAICompatibleSpeechProvider = computed(() => speechProvider.value === 'openai-compatible');

const DEFAULT_AUDIO_INPUT_VALUE = '__system_default__';
const AUDIO_INPUT_AUTO_HYDRATION_SESSION_KEY = 'SETTINGS_AUDIO_INPUT_AUTO_HYDRATED';
const audioInputDevices = ref<AudioInputDeviceOption[]>([]);
const selectedAudioInputDeviceId = ref(DEFAULT_AUDIO_INPUT_VALUE);
const audioDeviceLoading = ref(false);
const audioDeviceError = ref('');

const audioInputOptions = computed(() => {
  const hasSelectedOption = audioInputDevices.value.some(
    (device) => device.deviceId === selectedAudioInputDeviceId.value
  );

  if (
    selectedAudioInputDeviceId.value !== DEFAULT_AUDIO_INPUT_VALUE
    && selectedAudioInputDeviceId.value
    && !hasSelectedOption
  ) {
    return [
      {
        deviceId: selectedAudioInputDeviceId.value,
        label: '已保存设备（当前待检测或不可用）',
      },
      ...audioInputDevices.value,
    ];
  }

  return audioInputDevices.value;
});

const applyPreferredAudioInputSelection = (devices: AudioInputDeviceOption[]) => {
  const preferredDeviceId = getPreferredAudioInputDeviceId();
  if (!preferredDeviceId) {
    selectedAudioInputDeviceId.value = DEFAULT_AUDIO_INPUT_VALUE;
    return;
  }

  const hasResolvableDevices = devices.some((device) => Boolean(device.deviceId));
  if (hasResolvableDevices && !devices.some((device) => device.deviceId === preferredDeviceId)) {
    setPreferredAudioInputDeviceId(null);
    selectedAudioInputDeviceId.value = DEFAULT_AUDIO_INPUT_VALUE;
    return;
  }

  selectedAudioInputDeviceId.value = preferredDeviceId;
};

type AudioDeviceSyncSource = 'initial' | 'manual' | 'auto-hydrate' | 'devicechange';

const hasAutoHydratedAudioInputsThisSession = () => {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  return sessionStorage.getItem(AUDIO_INPUT_AUTO_HYDRATION_SESSION_KEY) === 'true';
};

const markAudioInputsAutoHydrated = () => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  sessionStorage.setItem(AUDIO_INPUT_AUTO_HYDRATION_SESSION_KEY, 'true');
};

const syncAudioInputDevices = async ({
  requestPermission = false,
  source = 'manual',
  showError = true,
}: {
  requestPermission?: boolean;
  source?: AudioDeviceSyncSource;
  showError?: boolean;
} = {}) => {
  audioDeviceLoading.value = true;
  if (showError) {
    audioDeviceError.value = '';
  }

  try {
    const devices = await listAudioInputDevices({ requestPermission });
    audioInputDevices.value = devices;
    applyPreferredAudioInputSelection(devices);

    if (source === 'manual') {
      trackClick('settings_audio_devices_refresh', { requestPermission, deviceCount: devices.length });
    }
  } catch (error) {
    if (showError) {
      audioDeviceError.value = getMicrophoneErrorMessage(error);
    }
    trackError('settings_audio_devices_refresh_failed', error);
  } finally {
    audioDeviceLoading.value = false;
  }
};

const refreshAudioInputDevices = async () => {
  await syncAudioInputDevices({ requestPermission: true, source: 'manual' });
};

const hydrateAudioInputDevicesOnMount = async () => {
  await syncAudioInputDevices({ source: 'initial' });

  const permissionState = await getMicrophonePermissionState();
  if (permissionState === 'granted') {
    await syncAudioInputDevices({ requestPermission: true, source: 'auto-hydrate' });
    return;
  }

  if (
    (permissionState === 'prompt' || permissionState === 'unsupported')
    && !hasAutoHydratedAudioInputsThisSession()
  ) {
    markAudioInputsAutoHydrated();
    await syncAudioInputDevices({
      requestPermission: true,
      source: 'auto-hydrate',
      showError: false,
    });
  }
};

const handleAudioDeviceChange = () => {
  syncAudioInputDevices({ source: 'devicechange' });
};

function formatRegionalConnectionError(baseUrlValue: string, error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const message = rawMessage.trim();

  if (!message || message === 'Load failed' || message === 'Failed to fetch') {
    return `接入参数已保存，但当前无法连接 ${baseUrlValue}。请确认 floating-ball-server 已启动，且该地址可访问。`;
  }

  if (message.includes('AUTH-401')) {
    return `接入参数已保存，但设备鉴权失败。请重新确认 ${baseUrlValue} 的服务状态后重试。`;
  }

  if (message.includes('机构编码不存在')) {
    return `接入参数已保存，但机构编码未被后台识别：${message}`;
  }

  return `接入参数已保存，但当前连接失败：${message}`;
}

function formatRegionalConnectionToast(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const message = rawMessage.trim();

  if (!message || message === 'Load failed' || message === 'Failed to fetch') {
    return '区域化接入参数已保存，但当前后台暂不可达';
  }

  if (message.includes('AUTH-401')) {
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

function loadRegionalDraftSettings(): void {
  const regionalConfig = getRegionalConnectionConfig();
  const regionalDefaults = getRegionalConnectionDefaults();
  regionalMode.value = regionalConfig.enabled;
  regionalBaseUrl.value = regionalConfig.baseUrl || regionalDefaults.baseUrl;
  regionalOrgCode.value = regionalConfig.orgCode || regionalDefaults.orgCode;
  regionalDeviceCode.value = regionalConfig.deviceCode;
}

function loadModeDependentSettings(): void {
  const bootstrap = getCachedBootstrap();
  const pmphaiConfig = getPMPHAIConfig();

  if (regionalMode.value) {
    apiKey.value = '';
    baseUrl.value = bootstrap?.llm?.baseUrl || '';
    model.value = bootstrap?.llm?.model || '';

    const speechConfig = getSpeechConfig();
    speechProvider.value = speechConfig.provider;
    speechApiKey.value = '';
    speechBaseUrl.value = speechConfig.baseUrl;
    speechModel.value = speechConfig.model;

    reviewerEnabled.value = bootstrap?.reviewer?.enabled ?? false;
    reviewerApiKey.value = '';
    reviewerBaseUrl.value = '';
    reviewerModel.value = bootstrap?.reviewer?.model || '';

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
  speechProvider.value = speechConfig.provider;
  speechApiKey.value = speechConfig.apiKey === '__REGIONAL_PROXY__' ? '' : speechConfig.apiKey;
  speechBaseUrl.value = speechConfig.baseUrl;
  speechModel.value = speechConfig.model;

  const reviewerEnabledSaved = localStorage.getItem('REVIEWER_ENABLED');
  reviewerEnabled.value = reviewerEnabledSaved === null ? true : reviewerEnabledSaved === 'true';
  reviewerApiKey.value = localStorage.getItem('REVIEWER_API_KEY') || '';
  reviewerBaseUrl.value = localStorage.getItem('REVIEWER_BASE_URL') || '';
  reviewerModel.value = localStorage.getItem('REVIEWER_MODEL') || '';

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
  speechProvider: speechProvider.value,
  speechApiKey: speechApiKey.value,
  speechBaseUrl: speechBaseUrl.value,
  speechModel: speechModel.value,
  reviewerEnabled: reviewerEnabled.value,
  reviewerApiKey: reviewerApiKey.value,
  reviewerBaseUrl: reviewerBaseUrl.value,
  reviewerModel: reviewerModel.value,
  pmphaiEnabled: pmphaiEnabled.value,
  pmphaiAppKey: pmphaiAppKey.value,
  pmphaiAppSecret: pmphaiAppSecret.value,
  pmphaiSearchMode: pmphaiSearchMode.value,
  speechTestMode: speechTestMode.value,
}));

const shouldShowSaveBar = computed(() => activeTab.value === 'general' || activeTab.value === 'model');
const hasUnsavedChanges = computed(() => settingsLoaded.value && currentSettingsSnapshot.value !== lastSavedSnapshot.value);
const saveShortcutLabel = computed(() => {
  if (typeof navigator === 'undefined') {
    return 'Cmd/Ctrl+S';
  }

  return /Macintosh|Mac OS X|MacIntel/i.test(navigator.userAgent) ? 'Cmd+S' : 'Ctrl+S';
});

const saveBarDescription = computed(() => {
  if (!hasUnsavedChanges.value) {
    return '当前页面修改已保存';
  }

  return activeTab.value === 'general'
    ? '通用设置有未保存变更'
    : '模型配置有未保存变更';
});

const updateSavedSnapshot = () => {
  lastSavedSnapshot.value = currentSettingsSnapshot.value;
};

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

const handleSaveShortcut = async (event: KeyboardEvent) => {
  const pressedSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
  if (!pressedSaveShortcut || !shouldShowSaveBar.value || !hasUnsavedChanges.value || savingSettings.value) {
    return;
  }

  event.preventDefault();
  await saveSettings();
};

onMounted(async () => {
  loadRegionalDraftSettings();
  loadModeDependentSettings();
  loadLocalPreferences();
  await hydrateAudioInputDevicesOnMount();
  updateSavedSnapshot();
  settingsLoaded.value = true;

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

const saveSettings = async () => {
  savingSettings.value = true;
  let regionalToastMessage: string | null = null;

  try {
    const regionalDefaults = getRegionalConnectionDefaults();
    const nextRegionalBaseUrl = regionalBaseUrl.value.trim() || regionalDefaults.baseUrl;
    const nextRegionalOrgCode = regionalOrgCode.value.trim() || regionalDefaults.orgCode;

    localStorage.setItem('ALWAYS_ON_TOP', String(alwaysOnTop.value));
    localStorage.setItem('PMPHAI_SEARCH_MODE', pmphaiSearchMode.value);

    if (!regionalMode.value) {
      localStorage.setItem('OPENAI_API_KEY', apiKey.value);
      localStorage.setItem('LLM_BASE_URL', baseUrl.value);
      localStorage.setItem('LLM_MODEL', model.value);
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

      localStorage.setItem('PMPHAI_APP_KEY', pmphaiAppKey.value);
      localStorage.setItem('PMPHAI_APP_SECRET', pmphaiAppSecret.value);
      localStorage.setItem('PMPHAI_ENABLED', String(pmphaiEnabled.value));
    }

    if (speechTestMode.value) {
      localStorage.setItem('SPEECH_TEST_MODE', 'true');
    } else {
      localStorage.removeItem('SPEECH_TEST_MODE');
    }

    setPreferredAudioInputDeviceId(
      selectedAudioInputDeviceId.value === DEFAULT_AUDIO_INPUT_VALUE
        ? null
        : selectedAudioInputDeviceId.value
    );

    trackClick('settings_save', {
      regionalMode: regionalMode.value,
      regionalBaseUrlConfigured: !!nextRegionalBaseUrl,
      regionalOrgCodeConfigured: !!nextRegionalOrgCode,
      hasApiKey: !!apiKey.value,
      hasBaseUrl: !!baseUrl.value,
      model: model.value,
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
        loadRegionalDraftSettings();
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
      loadRegionalDraftSettings();
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
  } catch (error: any) {
    regionalConnectResult.value = {
      success: false,
      message: error.message || '保存失败',
    };
    trackError('settings_save_failed', error);
    if (showToast) {
      showToast(`保存失败: ${error.message || '未知错误'}`, 'error');
    }
  } finally {
    savingSettings.value = false;
  }
};

const testRegionalConnection = async () => {
  testingRegionalConnection.value = true;
  regionalConnectResult.value = null;

  const regionalDefaults = getRegionalConnectionDefaults();
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
    loadRegionalDraftSettings();
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

    loadRegionalDraftSettings();
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
      });
    modelTestResult.value = result;
    trackClick('settings_model_test', { success: result.success });
  } catch (error: any) {
    modelTestResult.value = { success: false, message: error.message || '连接失败' };
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
  } catch (error: any) {
    reviewerTestResult.value = { success: false, message: error.message || '连接失败' };
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
  } catch (error: any) {
    pmphaiTestResult.value = { success: false, message: error.message || '连接失败' };
    trackError('settings_pmphai_test_failed', error);
  } finally {
    pmphaiTesting.value = false;
  }
};

const exporting = ref(false);
const exportFormat = ref<'json' | 'csv'>('json');
const exportDays = ref(90);
const localMedicalCatalogEnabled = computed(() => !regionalMode.value);
const medicalCatalogLoading = ref(false);
const medicalCatalogClearing = ref(false);
const medicalCatalogDebugState = ref<MedicalCatalogDebugState | null>(null);
const medicalCatalogActionResult = ref<{ success: boolean; message: string } | null>(null);

const formatUnixTimestamp = (value?: number | null) => {
  if (!value) {
    return '未同步';
  }

  try {
    return new Date(value * 1000).toLocaleString('zh-CN', {
      hour12: false,
    });
  } catch {
    return '未同步';
  }
};

const medicalCatalogOverviewCards = computed(() => {
  const state = medicalCatalogDebugState.value;
  return [
    {
      key: 'diagnoses',
      label: '诊断目录',
      rowCount: state?.diagnosisCount ?? 0,
      description: '全局缓存，同步一次后长期复用',
    },
    {
      key: 'items',
      label: '诊疗项目',
      rowCount: state?.itemCount ?? 0,
      description: '按机构缓存，每天同步一次',
    },
    {
      key: 'medicines',
      label: '药品目录',
      rowCount: state?.medicineCount ?? 0,
      description: '按机构缓存，每天同步一次',
    },
  ];
});

const medicalCatalogSyncStates = computed(() => {
  const state = medicalCatalogDebugState.value;
  if (!state) {
    return [];
  }

  return state.syncStates.map((entry) => ({
    ...entry,
    label: entry.catalogType === 'diagnoses'
      ? '诊断目录'
      : entry.catalogType === 'items'
        ? '诊疗项目'
        : entry.catalogType === 'medicines'
          ? '药品目录'
          : entry.catalogType,
    scopeText: entry.orgCode ? `机构 ${entry.orgCode}` : '全局',
    lastSyncText: formatUnixTimestamp(entry.lastSyncAt),
    syncDateText: entry.syncDate || '未记录',
  }));
});

const loadMedicalCatalogState = async () => {
  if (!localMedicalCatalogEnabled.value) {
    medicalCatalogDebugState.value = null;
    return;
  }

  medicalCatalogLoading.value = true;
  medicalCatalogActionResult.value = null;

  try {
    medicalCatalogDebugState.value = await medicalDataService.getDebugState();
  } catch (error) {
    console.error('Failed to load medical catalog state:', error);
    trackError('settings_medical_catalog_state_failed', error);
    medicalCatalogActionResult.value = {
      success: false,
      message: `基础数据状态读取失败: ${(error as Error).message}`,
    };
  } finally {
    medicalCatalogLoading.value = false;
  }
};

const clearMedicalCatalogCache = async () => {
  medicalCatalogClearing.value = true;
  medicalCatalogActionResult.value = null;
  trackClick('settings_medical_catalog_clear_all');

  try {
    const result: MedicalCatalogClearResult = await medicalDataService.clearDebugCache({
      catalogType: 'all',
      orgCode: '',
    });
    await loadMedicalCatalogState();
    const removedRows = result.diagnosisRows + result.itemRows + result.medicineRows;
    medicalCatalogActionResult.value = {
      success: true,
      message: `基础数据缓存已清空，共删除 ${removedRows} 条目录记录`,
    };
    if (showToast) {
      showToast('基础数据缓存已清空', 'success');
    }
  } catch (error) {
    console.error('Failed to clear medical catalog cache:', error);
    trackError('settings_medical_catalog_clear_failed', error);
    medicalCatalogActionResult.value = {
      success: false,
      message: `清理基础数据缓存失败: ${(error as Error).message}`,
    };
    if (showToast) {
      showToast(`清理基础数据缓存失败: ${(error as Error).message}`, 'error');
    }
  } finally {
    medicalCatalogClearing.value = false;
  }
};

const handleViewAnalytics = () => {
  trackClick('settings_view_analytics');
  emit('view-analytics');
};

const handleExportData = async () => {
  exporting.value = true;
  trackClick('settings_export_data', { format: exportFormat.value, days: exportDays.value });
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - exportDays.value);

    const startDate = Math.floor(start.getTime() / 1000);
    const endDate = Math.floor(now.getTime() / 1000);

    const dataJson = await invoke<string>('export_data', {
      format: exportFormat.value,
      startDate,
      endDate,
    });

    const ext = exportFormat.value;
    const filePath = await save({
      defaultPath: `feedback-export-${now.toISOString().split('T')[0]}.${ext}`,
      filters: [{
        name: ext.toUpperCase(),
        extensions: [ext],
      }],
    });

    if (filePath) {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, dataJson);

      if (showToast) {
        showToast('数据导出成功', 'success');
      }
    }
  } catch (error) {
    console.error('Failed to export data:', error);
    trackError('settings_export_failed', error);
    if (showToast) {
      showToast(`导出失败: ${(error as Error).message}`, 'error');
    }
  } finally {
    exporting.value = false;
  }
};

watch(activeTab, (newVal) => {
  trackClick('settings_tab_change', { tab: newVal });

  if (newVal === 'data' && localMedicalCatalogEnabled.value) {
    loadMedicalCatalogState();
  }
});

watch(regionalMode, (enabled) => {
  regionalConnectResult.value = null;

  if (enabled) {
    medicalCatalogDebugState.value = null;
    medicalCatalogActionResult.value = null;
    return;
  }

  if (activeTab.value === 'data') {
    loadMedicalCatalogState();
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
      <!-- General Tab -->
      <div v-if="activeTab === 'general'" class="tab-pane">
        <!-- Theme Selector Section -->
        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:palette" :size="20" />
            <h3>界面主题</h3>
          </div>
          <p class="section-desc">选择适合您的视觉风格</p>

          <div class="theme-grid">
            <button v-for="theme in themes" :key="theme.id"
              :class="['theme-card', { active: currentTheme.id === theme.id }]"
              @click="trackClick('settings_theme_change', { themeId: theme.id }); setTheme(theme)">
              <div class="theme-preview" :style="getThemePreviewStyle(theme)">
                <div class="preview-header" :style="{ background: theme.colors.primary }"></div>
                <div class="preview-content">
                  <div class="preview-sidebar" :style="{ background: theme.colors.primaryLight }"></div>
                  <div class="preview-main">
                    <div class="preview-line" :style="{ background: theme.colors.textMuted }"></div>
                    <div class="preview-line short" :style="{ background: theme.colors.textMuted }"></div>
                    <div class="preview-btn" :style="{ background: theme.colors.cta }"></div>
                  </div>
                </div>
              </div>
              <div class="theme-info">
                <span class="theme-name">{{ theme.name }}</span>
                <span class="theme-desc">{{ theme.description }}</span>
              </div>
              <div v-if="currentTheme.id === theme.id" class="theme-check">
                <Icon icon="lucide:check" :size="16" />
              </div>
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:layout" :size="20" />
            <h3>窗口设置</h3>
          </div>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="always-on-top" class="toggle-label">窗口始终置顶</label>
              <span class="toggle-hint">启用后，应用窗口将保持在其他窗口之上</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="always-on-top" v-model="alwaysOnTop">
              <label for="always-on-top" class="toggle-switch"></label>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:server" :size="20" />
            <h3>区域化接入</h3>
          </div>
          <p class="section-desc">开启后，桌面端会向 floating-ball-server 注册设备、拉取 bootstrap 配置，并统一走远端 `/v1/*` 代理。区域化模式下实际生效模型以服务端当前配置为准。</p>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="regional-mode" class="toggle-label">启用区域化模式</label>
              <span class="toggle-hint">保存后立即生效；失败时会保留当前接入参数，便于继续排查</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="regional-mode" v-model="regionalMode">
              <label for="regional-mode" class="toggle-switch"></label>
            </div>
          </div>

          <div class="form-group">
            <label for="regional-base-url">后端地址</label>
            <div class="input-with-icon">
              <Icon icon="lucide:link" :size="16" class="input-icon" />
              <input
                id="regional-base-url"
                v-model="regionalBaseUrl"
                type="text"
                placeholder="http://127.0.0.1:8080"
              />
            </div>
            <p class="form-hint">默认预置 `http://127.0.0.1:8080`；可修改，留空会回退默认值。</p>
          </div>

          <div class="form-group">
            <label for="regional-org-code">机构编码</label>
            <div class="input-with-icon">
              <Icon icon="lucide:building-2" :size="16" class="input-icon" />
              <input
                id="regional-org-code"
                v-model="regionalOrgCode"
                type="text"
                placeholder="ORG001"
              />
            </div>
            <p class="form-hint">默认预置 `ORG001`；需与后台机构表中的 `cdOrg` 一致，留空会回退默认值。</p>
          </div>

          <div class="form-group">
            <label for="regional-device-code">设备编码</label>
            <div class="input-with-icon">
              <Icon icon="lucide:laptop-minimal-check" :size="16" class="input-icon" />
              <input
                id="regional-device-code"
                :value="regionalDeviceCode"
                type="text"
                readonly
              />
            </div>
            <p class="form-hint">客户端首次生成后持久化复用；更换后端地址或机构编码时会自动重新注册。</p>
          </div>

          <div v-if="regionalConnectResult" :class="['regional-status', regionalConnectResult.success ? 'success' : 'error']">
            <Icon :icon="regionalConnectResult.success ? 'lucide:check-circle' : 'lucide:alert-circle'" :size="16" />
            <span>{{ regionalConnectResult.message }}</span>
          </div>

          <div class="test-connection-row">
            <button class="test-btn" @click="testRegionalConnection" :disabled="testingRegionalConnection">
              <Icon :icon="testingRegionalConnection ? 'lucide:loader-2' : 'lucide:wifi'" :size="16" :class="{ spin: testingRegionalConnection }" />
              {{ testingRegionalConnection ? '测试中...' : '测试 server 连通性' }}
            </button>
            <span class="test-message testing">验证桌面端到 floating-ball-server 的注册与 bootstrap 链路</span>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:mic" :size="20" />
            <h3>音频设置</h3>
          </div>
          <p class="section-desc">聊天语音输入和语音接诊共用同一套麦克风选择。若指定设备失效，录音会自动回退到系统默认输入设备。</p>

          <div class="form-group">
            <label for="audio-input-device">输入设备</label>
            <div class="input-with-icon">
              <Icon icon="lucide:audio-lines" :size="16" class="input-icon" />
              <select id="audio-input-device" v-model="selectedAudioInputDeviceId" class="select-input">
                <option :value="DEFAULT_AUDIO_INPUT_VALUE">跟随系统默认输入设备</option>
                <option v-for="device in audioInputOptions" :key="device.deviceId" :value="device.deviceId">
                  {{ device.label }}
                </option>
              </select>
            </div>
            <p class="form-hint">选择固定麦克风后，应用会记住该设备；切回默认时始终跟随系统当前默认输入。</p>
          </div>

          <div class="test-connection-row">
            <button class="test-btn" @click="refreshAudioInputDevices()" :disabled="audioDeviceLoading">
              <Icon :icon="audioDeviceLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="16" :class="{ spin: audioDeviceLoading }" />
              {{ audioDeviceLoading ? '刷新中...' : '刷新设备列表' }}
            </button>
            <span v-if="audioDeviceError" class="test-message error">
              <Icon icon="lucide:triangle-alert" :size="16" />
              {{ audioDeviceError }}
            </span>
            <span v-else class="test-message success">
              <Icon icon="lucide:mic-2" :size="16" />
              已检测到 {{ audioInputDevices.length }} 个输入设备
            </span>
          </div>
        </div>

        <div class="settings-section clickable-section"
          @click="trackClick('settings_open_symptom_manage'); emit('open-symptom-manage')">
          <div class="section-header no-border"
            style="display: flex; align-items: center; justify-content: space-between;">
            <div class="header-left" style="display: flex; align-items: center; gap: 12px;">
              <Icon icon="lucide:file-edit" :size="20" />
              <h3 style="margin: 0;">症状库管理</h3>
            </div>
            <div class="arrow-icon">
              <Icon icon="lucide:chevron-right" :size="20" />
            </div>
          </div>
          <p class="section-desc" style="margin-top: 4px;">配置和维护用于问诊的症状模板库</p>
        </div>
      </div>

      <!-- Model Tab -->
      <div v-if="activeTab === 'model'" class="tab-pane">
        <div v-if="regionalMode" class="info-banner">
          <Icon icon="lucide:server" :size="18" />
          <p>当前为区域化模式。模型、独立审查 AI 和知识库凭据由 floating-ball-server 统一管理，桌面端只保留本地模式兜底配置与本地偏好。</p>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:key" :size="20" />
            <h3>通用 LLM</h3>
          </div>
          <p class="section-desc" style="margin-bottom: 16px;">用于聊天、病历整理、推荐生成等文本大模型能力。</p>

          <div v-if="!regionalMode" class="preset-container">
            <label>快速填充常用服务商：</label>
            <div class="preset-buttons">
              <button v-for="preset in PROVIDER_PRESETS" :key="preset.name" class="preset-btn" @click="applyPreset(preset)">
                {{ preset.name }}
              </button>
            </div>
          </div>

          <div v-if="!regionalMode" class="form-group">
            <label for="api-key">API Key <span class="required">*</span></label>
            <div class="input-with-icon">
              <Icon icon="lucide:key" :size="16" class="input-icon" />
              <input id="api-key" v-model="apiKey" type="password" placeholder="sk-..." />
            </div>
            <p class="form-hint">文本大模型使用的 OpenAI 兼容 API 密钥。</p>
          </div>

          <div class="form-group">
            <label for="base-url">LLM Base URL</label>
            <div class="input-with-icon">
              <Icon icon="lucide:link" :size="16" class="input-icon" />
              <input id="base-url" v-model="baseUrl" type="text" :placeholder="DEFAULT_LLM_CONFIG.baseUrl" :disabled="regionalMode" />
            </div>
            <p class="form-hint">{{ regionalMode ? '当前生效地址由服务端 bootstrap 下发' : '文本对话与结构化生成使用的 API 服务地址。' }}</p>
          </div>

          <div class="form-group">
            <label for="model-name">LLM Model</label>
            <div class="input-with-icon">
              <Icon icon="lucide:brain" :size="16" class="input-icon" />
              <input id="model-name" v-model="model" type="text" :placeholder="DEFAULT_LLM_CONFIG.model" :disabled="regionalMode" />
            </div>
            <p class="form-hint">{{ regionalMode ? '当前生效模型由服务端统一维护' : '如 `gpt-4o-mini`、`deepseek-chat`、`qwen-plus`。' }}</p>
          </div>

          <div class="test-connection-row" style="margin-top: 16px;">
            <button class="test-btn" @click="testModelConnection" :disabled="modelTesting || (!regionalMode && !apiKey)">
              <Icon :icon="modelTesting ? 'lucide:loader-2' : 'lucide:wifi'" :size="16" :class="{ spin: modelTesting }" />
              {{ modelTesting ? '测试中...' : '测试连接' }}
            </button>
            <span v-if="modelTestResult" :class="['test-message', modelTestResult.success ? 'success' : 'error']">
              <Icon :icon="modelTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
              {{ modelTestResult.message }}
            </span>
          </div>
        </div>

        <div class="settings-section" style="margin-top: 24px;">
          <div class="section-header">
            <Icon icon="lucide:audio-lines" :size="20" />
            <h3>语音转写</h3>
          </div>
          <p class="section-desc" style="margin-bottom: 16px;">聊天录音和语音接诊共用这一组配置。默认建议使用阿里云 DashScope。</p>

          <div class="form-group">
            <label>语音服务提供方</label>
            <div class="mode-selector">
              <button
                v-for="option in speechProviderOptions"
                :key="option.value"
                type="button"
                :class="['mode-option', { active: speechProvider === option.value }]"
                :disabled="regionalMode"
                @click="speechProvider = option.value"
              >
                <Icon :icon="option.value === 'aliyun-dashscope' ? 'lucide:radio' : 'lucide:mic'" :size="18" />
                <div class="mode-info">
                  <span class="mode-title">{{ option.label }}</span>
                  <span class="mode-desc">{{ option.description }}</span>
                </div>
              </button>
            </div>
          </div>

          <div v-if="!regionalMode" class="form-group">
            <label for="speech-api-key">语音 API Key</label>
            <div class="input-with-icon">
              <Icon icon="lucide:key" :size="16" class="input-icon" />
              <input id="speech-api-key" v-model="speechApiKey" type="password" placeholder="sk-..." />
            </div>
            <p class="form-hint">
              <span v-if="speechProvider === 'aliyun-dashscope'">阿里云 DashScope 的 API Key，语音接诊会优先使用实时识别。</span>
              <span v-else>OpenAI 兼容语音转写接口使用的 API Key；留空时默认复用上方 LLM API Key。</span>
            </p>
          </div>

          <div v-if="isOpenAICompatibleSpeechProvider" class="form-group">
            <label for="speech-base-url">语音 Base URL</label>
            <div class="input-with-icon">
              <Icon icon="lucide:link" :size="16" class="input-icon" />
              <input id="speech-base-url" v-model="speechBaseUrl" type="text" :placeholder="DEFAULT_SPEECH_CONFIG.baseUrl" :disabled="regionalMode" />
            </div>
            <p class="form-hint">{{ regionalMode ? '当前生效语音地址由服务端统一维护' : 'OpenAI 兼容语音转写接口地址，通常以 `/v1` 结尾。' }}</p>
          </div>

          <div v-else class="form-group">
            <label for="speech-base-url-readonly">语音接入方式</label>
            <div class="input-with-icon">
              <Icon icon="lucide:cloud" :size="16" class="input-icon" />
              <input
                id="speech-base-url-readonly"
                type="text"
                :value="regionalMode ? '区域化模式下由 floating-ball-server 统一代理' : 'DashScope WebSocket（由 Rust 后端代理）'"
                readonly
              />
            </div>
            <p class="form-hint">{{ regionalMode ? '当前 provider 与代理路径由服务端统一维护。' : '当前 provider 走阿里云实时语音识别，不需要单独填写 Base URL。' }}</p>
          </div>

          <div class="form-group">
            <label for="speech-model-name">语音模型</label>
            <div class="input-with-icon">
              <Icon icon="lucide:mic" :size="16" class="input-icon" />
              <input
                id="speech-model-name"
                v-model="speechModel"
                type="text"
                :placeholder="speechProvider === 'aliyun-dashscope' ? 'paraformer-realtime-v2' : 'whisper-1'"
                :disabled="regionalMode"
              />
            </div>
            <p class="form-hint">
              <span v-if="regionalMode">当前生效语音模型由服务端统一维护。</span>
              <span v-else-if="speechProvider === 'aliyun-dashscope'">默认使用阿里云实时识别模型 `paraformer-realtime-v2`。</span>
              <span v-else>例如 `whisper-1` 或兼容网关支持的其他语音转写模型。</span>
            </p>
          </div>

          <div class="toggle-row" style="margin-top: 8px;">
            <div class="toggle-label-group">
              <label for="speech-test-mode" class="toggle-label">语音识别测试模式</label>
              <span class="toggle-hint">启用后将跳过真实语音识别，直接返回示例文本</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="speech-test-mode" v-model="speechTestMode">
              <label for="speech-test-mode" class="toggle-switch"></label>
            </div>
          </div>
        </div>

        <div class="settings-section" style="margin-top: 24px;">
          <div class="section-header">
            <Icon icon="lucide:shield-check" :size="20" />
            <h3>独立审查 AI 配置</h3>
          </div>
          <p class="section-desc" style="margin-bottom: 16px;">配置用于事实核查和第二诊疗意见的独立大模型。如不填写，将默认使用上方的通用模型配置。</p>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="reviewer-enabled" class="toggle-label">开启独立审查 AI</label>
              <span class="toggle-hint">关闭后将不进行独立 AI 事实核查与验证</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="reviewer-enabled" v-model="reviewerEnabled" :disabled="regionalMode">
              <label for="reviewer-enabled" class="toggle-switch"></label>
            </div>
          </div>

          <template v-if="reviewerEnabled">
            <div v-if="!regionalMode" class="form-group">
              <label for="reviewer-api-key">API Key</label>
              <div class="input-with-icon">
                <Icon icon="lucide:key" :size="16" class="input-icon" />
                <input id="reviewer-api-key" v-model="reviewerApiKey" type="password" placeholder="sk-..." />
              </div>
              <p class="form-hint">独立审查 AI 的 API 密钥</p>
            </div>

            <div v-if="!regionalMode" class="form-group">
              <label for="reviewer-base-url">Base URL</label>
              <div class="input-with-icon">
                <Icon icon="lucide:link" :size="16" class="input-icon" />
                <input id="reviewer-base-url" v-model="reviewerBaseUrl" type="text" placeholder="https://api.openai.com/v1" />
              </div>
              <p class="form-hint">API 服务器地址（留空使用上方默认值）</p>
            </div>

            <div class="form-group">
              <label for="reviewer-model-name">Model Name</label>
              <div class="input-with-icon">
                <Icon icon="lucide:brain" :size="16" class="input-icon" />
                <input id="reviewer-model-name" v-model="reviewerModel" type="text" placeholder="gpt-4o-mini" :disabled="regionalMode" />
              </div>
              <p class="form-hint">{{ regionalMode ? '当前审查模型由服务端统一维护' : '使用的模型名称（留空使用上方默认值）' }}</p>
            </div>

            <div class="test-connection-row" style="margin-top: 16px;">
              <button class="test-btn" @click="testReviewerConnection" :disabled="reviewerTesting || (!regionalMode && !reviewerApiKey && !apiKey)">
                <Icon :icon="reviewerTesting ? 'lucide:loader-2' : 'lucide:wifi'" :size="16" :class="{ spin: reviewerTesting }" />
                {{ reviewerTesting ? '测试中...' : '测试连接' }}
              </button>
              <span v-if="reviewerTestResult" :class="['test-message', reviewerTestResult.success ? 'success' : 'error']">
                <Icon :icon="reviewerTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
                {{ reviewerTestResult.message }}
              </span>
            </div>
          </template>
        </div>

        <div class="settings-section" style="margin-top: 24px;">
          <div class="section-header">
            <Icon icon="lucide:book-open" :size="20" />
            <h3>医学知识库配置</h3>
          </div>
          <p class="section-desc">配置人卫 Inside 知识库 API，获取相关医学文献</p>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="pmphai-enabled" class="toggle-label">启用知识库搜索</label>
              <span class="toggle-hint">启用后，AI 推荐时将自动搜索相关医学文献</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="pmphai-enabled" v-model="pmphaiEnabled" :disabled="regionalMode">
              <label for="pmphai-enabled" class="toggle-switch"></label>
            </div>
          </div>

          <template v-if="pmphaiEnabled">
            <div class="form-group">
              <label>搜索模式</label>
              <div class="mode-selector">
                <button :class="['mode-option', { active: pmphaiSearchMode === 'rag' }]" @click="pmphaiSearchMode = 'rag'" :disabled="!pmphaiEnabled">
                  <Icon icon="lucide:sparkles" :size="18" />
                  <div class="mode-info">
                    <span class="mode-title">智能搜索</span>
                    <span class="mode-desc">AI 语义匹配，基于向量相似度</span>
                  </div>
                </button>
                <button :class="['mode-option', { active: pmphaiSearchMode === 'list' }]" @click="pmphaiSearchMode = 'list'" :disabled="!pmphaiEnabled">
                  <Icon icon="lucide:list" :size="18" />
                  <div class="mode-info">
                    <span class="mode-title">文档浏览</span>
                    <span class="mode-desc">传统关键词搜索，浏览知识库</span>
                  </div>
                </button>
              </div>
            </div>

            <div v-if="!regionalMode" class="form-group">
              <label for="pmphai-app-key">APP Key</label>
              <div class="input-with-icon">
                <Icon icon="lucide:key" :size="16" class="input-icon" />
                <input id="pmphai-app-key" v-model="pmphaiAppKey" type="text" placeholder="请输入 APP Key" />
              </div>
              <p class="form-hint">人卫 Inside 云应用 APP Key</p>
            </div>

            <div v-if="!regionalMode" class="form-group">
              <label for="pmphai-app-secret">APP Secret</label>
              <div class="input-with-icon">
                <Icon icon="lucide:lock" :size="16" class="input-icon" />
                <input id="pmphai-app-secret" v-model="pmphaiAppSecret" type="password" placeholder="请输入 APP Secret" />
              </div>
              <p class="form-hint">人卫 Inside 云应用密钥</p>
            </div>

            <div class="test-connection-row">
              <button class="test-btn" @click="testPMPHAIConnection" :disabled="pmphaiTesting || (!regionalMode && (!pmphaiAppKey || !pmphaiAppSecret))">
                <Icon :icon="pmphaiTesting ? 'lucide:loader-2' : 'lucide:wifi'" :size="16" :class="{ spin: pmphaiTesting }" />
                {{ pmphaiTesting ? '测试中...' : '测试连接' }}
              </button>
              <span v-if="pmphaiTestResult" :class="['test-message', pmphaiTestResult.success ? 'success' : 'error']">
                <Icon :icon="pmphaiTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
                {{ pmphaiTestResult.message }}
              </span>
            </div>
          </template>
        </div>

        <div class="info-banner">
          <Icon icon="lucide:info" :size="18" />
          <p>{{ regionalMode ? '区域化模式下这里只保存本地偏好；后端 API 配置请到 floating-ball-server 管理端维护。' : '配置已保存到本地。如未设置，将使用环境变量默认值。' }}</p>
        </div>
      </div>

      <!-- About Tab -->
      <div v-if="activeTab === 'about'" class="tab-pane">
        <UpdateChecker />
      </div>

      <!-- Data Tab -->
      <div v-if="activeTab === 'data'" class="tab-pane">
        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:bar-chart-3" :size="20" />
            <h3>数据分析</h3>
          </div>
          <p class="section-desc">查看用户反馈、会话统计和性能指标</p>
          <button class="action-btn primary" @click="handleViewAnalytics">
            <Icon icon="lucide:bar-chart-3" :size="18" />
            查看数据分析
          </button>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:database-zap" :size="20" />
            <h3>基础数据管理</h3>
          </div>
          <p v-if="localMedicalCatalogEnabled" class="section-desc">查看本地 SQLite 中诊断、诊疗项目和药品目录的缓存状态，并支持一键清空后重新按规则同步。</p>
          <p v-else class="section-desc">当前为区域化模式，此处不展示本地 HIS 基础目录缓存状态。</p>

          <template v-if="localMedicalCatalogEnabled">
            <div class="catalog-summary-grid">
              <div
                v-for="card in medicalCatalogOverviewCards"
                :key="card.key"
                class="catalog-summary-card"
              >
                <span class="catalog-summary-label">{{ card.label }}</span>
                <strong class="catalog-summary-value">{{ card.rowCount }}</strong>
                <span class="catalog-summary-desc">{{ card.description }}</span>
              </div>
            </div>

            <div class="catalog-actions-row">
              <button class="test-btn" @click="loadMedicalCatalogState" :disabled="medicalCatalogLoading || medicalCatalogClearing">
                <Icon :icon="medicalCatalogLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="16" :class="{ spin: medicalCatalogLoading }" />
                {{ medicalCatalogLoading ? '刷新中...' : '刷新状态' }}
              </button>
              <button class="test-btn danger" @click="clearMedicalCatalogCache" :disabled="medicalCatalogLoading || medicalCatalogClearing">
                <Icon :icon="medicalCatalogClearing ? 'lucide:loader-2' : 'lucide:trash-2'" :size="16" :class="{ spin: medicalCatalogClearing }" />
                {{ medicalCatalogClearing ? '清理中...' : '一键清缓存' }}
              </button>
              <span
                v-if="medicalCatalogActionResult"
                :class="['test-message', medicalCatalogActionResult.success ? 'success' : 'error']"
              >
                <Icon :icon="medicalCatalogActionResult.success ? 'lucide:check-circle' : 'lucide:triangle-alert'" :size="16" />
                {{ medicalCatalogActionResult.message }}
              </span>
            </div>

            <div class="catalog-meta-grid">
              <div class="catalog-meta-item">
                <span class="catalog-meta-label">数据库路径</span>
                <span class="catalog-meta-value">{{ medicalCatalogDebugState?.dbPath || '未获取' }}</span>
              </div>
              <div class="catalog-meta-item">
                <span class="catalog-meta-label">同步状态数</span>
                <span class="catalog-meta-value">{{ medicalCatalogSyncStates.length }}</span>
              </div>
            </div>

            <div v-if="medicalCatalogSyncStates.length > 0" class="catalog-sync-list">
              <div v-for="entry in medicalCatalogSyncStates" :key="`${entry.catalogType}-${entry.orgCode}`" class="catalog-sync-item">
                <div class="catalog-sync-main">
                  <div class="catalog-sync-title-row">
                    <span class="catalog-sync-title">{{ entry.label }}</span>
                    <span class="catalog-sync-scope">{{ entry.scopeText }}</span>
                  </div>
                  <div class="catalog-sync-detail-row">
                    <span>表行数 {{ entry.rowCount }}</span>
                    <span>同步日期 {{ entry.syncDateText }}</span>
                    <span>最近同步 {{ entry.lastSyncText }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="catalog-empty-state">
              <Icon icon="lucide:database" :size="18" />
              <span>{{ medicalCatalogLoading ? '正在读取基础数据状态...' : '当前还没有基础数据同步记录' }}</span>
            </div>
          </template>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:download" :size="20" />
            <h3>数据导出</h3>
          </div>
          <p class="section-desc">导出反馈数据用于备份或外部分析</p>

          <div class="export-options">
            <div class="form-group">
              <label>导出格式</label>
              <div class="radio-group">
                <label class="radio-option" :class="{ active: exportFormat === 'json' }">
                  <input type="radio" v-model="exportFormat" value="json" /> JSON
                </label>
                <label class="radio-option" :class="{ active: exportFormat === 'csv' }">
                  <input type="radio" v-model="exportFormat" value="csv" /> CSV
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>时间范围</label>
              <div class="radio-group">
                <label class="radio-option" :class="{ active: exportDays === 7 }">
                  <input type="radio" v-model.number="exportDays" :value="7" /> 7天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 30 }">
                  <input type="radio" v-model.number="exportDays" :value="30" /> 30天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 90 }">
                  <input type="radio" v-model.number="exportDays" :value="90" /> 90天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 365 }">
                  <input type="radio" v-model.number="exportDays" :value="365" /> 全部
                </label>
              </div>
            </div>
          </div>

          <button class="action-btn" @click="handleExportData" :disabled="exporting">
            <Icon :icon="exporting ? 'lucide:loader-2' : 'lucide:download'" :size="18" :class="{ 'spin': exporting }" />
            {{ exporting ? '导出中...' : '导出数据' }}
          </button>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:info" :size="20" />
            <h3>数据说明</h3>
          </div>
          <ul class="data-info-list">
            <li>
              <Icon icon="lucide:database" :size="16" />
              数据存储在本地 SQLite 数据库中
            </li>
            <li>
              <Icon icon="lucide:file-text" :size="16" />
              包含会话记录、消息、反馈和性能指标
            </li>
            <li v-if="localMedicalCatalogEnabled">
              <Icon icon="lucide:book-copy" :size="16" />
              基础数据目录单独存储在本地 SQLite 中，可在上方查看同步状态并清理缓存
            </li>
            <li>
              <Icon icon="lucide:archive" :size="16" />
              导出的数据可用于备份或外部分析
            </li>
            <li>
              <Icon icon="lucide:check-circle" :size="16" />
              数据格式符合标准 JSON 规范
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="shouldShowSaveBar" class="settings-save-bar" :class="{ dirty: hasUnsavedChanges }">
      <div class="save-bar-status">
        <div class="save-bar-title">
          <Icon :icon="hasUnsavedChanges ? 'lucide:circle-alert' : 'lucide:check-circle-2'" :size="16" />
          <span>{{ saveBarDescription }}</span>
        </div>
        <span class="save-bar-divider">·</span>
        <span class="save-bar-hint">{{ saveShortcutLabel }}</span>
      </div>
      <button class="save-btn compact" @click="saveSettings" :disabled="!hasUnsavedChanges || savingSettings">
        <Icon :icon="savingSettings ? 'lucide:loader-2' : hasUnsavedChanges ? 'lucide:save' : 'lucide:check'" :size="16" :class="{ spin: savingSettings }" />
        {{ savingSettings ? '保存中...' : hasUnsavedChanges ? '保存更改' : '已保存' }}
      </button>
    </div>
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

/* Preset Buttons */
.preset-container {
  margin-bottom: 20px;
}

.preset-container label {
  display: block;
  font-size: 13px;
  color: var(--medical-text-muted);
  margin-bottom: 8px;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  font-size: 13px;
  background: var(--medical-bg-tertiary);
  border: 1px solid var(--medical-border-medium);
  border-radius: 16px;
  color: var(--medical-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: var(--medical-info-bg);
  border-color: var(--medical-info);
  color: var(--medical-info);
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

.settings-save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.94);
  border-top: 1px solid var(--medical-border-light);
  box-shadow: 0 -4px 14px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(12px);
}

.settings-save-bar.dirty {
  border-top-color: rgba(8, 145, 178, 0.24);
  box-shadow: 0 -6px 18px rgba(8, 145, 178, 0.09);
}

.save-bar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.save-bar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--medical-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.save-bar-divider {
  color: var(--medical-border-medium);
  font-size: 12px;
}

.save-bar-hint {
  color: var(--medical-text-muted);
  font-size: 11px;
  white-space: nowrap;
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

/* Settings Section */
.settings-section {
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--medical-border-light);
  color: var(--medical-primary);
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

/* Theme Selector Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--medical-bg-primary);
  border: 2px solid var(--medical-border-light);
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  text-align: left;
}

.theme-card:hover {
  border-color: var(--medical-border-medium);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.theme-card.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.04);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.theme-preview {
  width: 100%;
  height: 80px;
  border-radius: 8px;
  border: 1px solid;
  overflow: hidden;
  margin-bottom: 10px;
}

.preview-header {
  height: 16px;
}

.preview-content {
  display: flex;
  height: calc(100% - 16px);
  padding: 6px;
  gap: 6px;
}

.preview-sidebar {
  width: 20px;
  border-radius: 4px;
  opacity: 0.6;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  opacity: 0.3;
}

.preview-line.short {
  width: 60%;
}

.preview-btn {
  width: 40px;
  height: 12px;
  border-radius: 4px;
  margin-top: auto;
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--medical-text-muted);
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--medical-primary);
  color: white;
  border-radius: 50%;
}

/* Form Elements */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.required {
  color: #DC2626;
  margin-left: 4px;
}

.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--medical-text-muted);
  pointer-events: none;
}

.input-with-icon input {
  padding-left: 44px !important;
}

.input-with-icon .select-input {
  padding-left: 44px !important;
}

.form-group input,
.form-group select {
  height: 48px;
  border-radius: 8px;
  border: 2px solid var(--medical-border-medium);
  padding: 12px 16px;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  outline: none;
  transition: all var(--duration-normal) var(--ease-out);
  font-size: 16px;
}

.form-group input:hover,
.form-group select:hover {
  border-color: var(--medical-border-medium);
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--medical-primary);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.form-group select {
  appearance: none;
  width: 100%;
}

.form-hint {
  margin: 0;
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

/* Toggle Row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--medical-bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--medical-border-light);
  margin-bottom: 20px;
  transition: background 0.2s ease;
}

.toggle-row:hover {
  background: #EFF6FF;
}

.toggle-label-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.toggle-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
  white-space: nowrap;
  cursor: pointer;
}

.toggle-hint {
  font-size: 12px;
  color: var(--medical-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Toggle Switch */
.switch-wrapper {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch-wrapper input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-switch {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: unset;
  min-width: unset;
  background: #CBD5E1;
  transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s ease;
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15);
}

.toggle-switch:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s ease;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.switch-wrapper input:checked+.toggle-switch:before {
  transform: translateX(20px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}

/* Buttons */
.clickable {
  cursor: pointer;
  padding: 8px 0;
  transition: opacity 0.2s;
}

.clickable:hover {
  opacity: 0.7;
}

.arrow-icon {
  color: var(--medical-text-muted);
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  background: var(--medical-primary);
  color: white;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
  transition: all var(--duration-normal) var(--ease-out);
}

.save-btn:hover {
  background: var(--medical-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

.save-btn:active {
  transform: translateY(0);
}

/* Info Banner */
.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--medical-info-bg);
  border: 1px solid var(--medical-info);
  border-radius: 8px;
  color: var(--medical-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.info-banner p {
  margin: 0;
}

/* Action Buttons */
.action-btn {
  width: 100%;
  min-height: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  border: 2px solid var(--medical-primary);

  .clickable-section {
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .clickable-section:hover {
    border-color: var(--medical-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(8, 145, 178, 0.15);
  }

  .clickable-section .section-header {
    justify-content: space-between;
  }

  .clickable-section .section-header.no-border {
    border-bottom: none;
    margin-bottom: 8px;
    padding-bottom: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all var(--duration-normal) var(--ease-out);
}

.action-btn:hover:not(:disabled) {
  background: var(--medical-primary);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.2);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--medical-primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--medical-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

.catalog-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.catalog-summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--medical-border-light);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.catalog-summary-label {
  font-size: 13px;
  color: var(--medical-text-muted);
}

.catalog-summary-value {
  font-size: 28px;
  line-height: 1;
  color: var(--medical-text-primary);
}

.catalog-summary-desc {
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.4;
}

.catalog-actions-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.catalog-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.catalog-meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--medical-bg-secondary);
  border: 1px solid var(--medical-border-light);
}

.catalog-meta-label {
  font-size: 12px;
  color: var(--medical-text-muted);
}

.catalog-meta-value {
  font-size: 13px;
  color: var(--medical-text-primary);
  word-break: break-all;
  line-height: 1.5;
}

.catalog-sync-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-sync-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--medical-border-light);
  background: var(--medical-bg-secondary);
}

.catalog-sync-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.catalog-sync-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.catalog-sync-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.catalog-sync-scope {
  font-size: 12px;
  color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.08);
  border: 1px solid rgba(8, 145, 178, 0.16);
  border-radius: 999px;
  padding: 4px 10px;
}

.catalog-sync-detail-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

.catalog-empty-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px dashed var(--medical-border-medium);
  color: var(--medical-text-muted);
  background: rgba(248, 250, 252, 0.9);
}

/* Data Info List */
.data-info-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.data-info-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: var(--medical-text-secondary);
  line-height: 1.5;
}

.data-info-list li :deep(svg) {
  color: var(--medical-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Spinner Animation */
.spin {
  animation: spin 1s linear infinite;
}

/* Export Options */
.export-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--medical-border-medium);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  color: var(--medical-text-muted);
}

.radio-option input {
  display: none;
}

.radio-option:hover {
  border-color: var(--medical-primary);
  color: var(--medical-primary);
}

.radio-option.active {
  background: var(--medical-primary);
  border-color: var(--medical-primary);
  color: white;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Test Connection */
.test-connection-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.test-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--medical-border-medium);
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.test-btn:hover:not(:disabled) {
  border-color: var(--medical-primary);
  color: var(--medical-primary);
}

.test-btn.danger {
  border-color: rgba(220, 38, 38, 0.24);
  color: #B91C1C;
}

.test-btn.danger:hover:not(:disabled) {
  border-color: rgba(220, 38, 38, 0.5);
  color: #991B1B;
  background: rgba(220, 38, 38, 0.04);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-message {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.test-message.success {
  color: var(--medical-success);
}

.test-message.error {
  color: #DC2626;
}

.test-message.testing {
  color: var(--medical-text-muted);
}

.regional-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.regional-status.success {
  background: rgba(5, 150, 105, 0.08);
  color: var(--medical-success);
  border: 1px solid rgba(5, 150, 105, 0.18);
}

.regional-status.error {
  background: rgba(220, 38, 38, 0.08);
  color: #DC2626;
  border: 1px solid rgba(220, 38, 38, 0.18);
}

/* Mode Selector */
.mode-selector {
  display: flex;
  gap: 12px;
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--medical-bg-primary);
  border: 2px solid var(--medical-border-light);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  text-align: left;
}

.mode-option:hover:not(:disabled) {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.04);
}

.mode-option.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.08);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.mode-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-option :deep(svg) {
  color: var(--medical-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.mode-desc {
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.4;
}

/* Responsive */
@media (max-width: 640px) {
  .settings-save-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 12px;
  }

  .save-btn.compact {
    width: 100%;
  }

  .save-bar-status {
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .settings-header {
    padding: 16px;
  }

  .settings-title {
    font-size: 20px;
  }

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

  .settings-section {
    padding: 16px;
  }

  .form-group.row {
    flex-direction: column;
    align-items: stretch;
  }
}

</style>
