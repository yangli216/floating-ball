import { computed, ref } from 'vue';
import {
  getMicrophoneErrorMessage,
  getMicrophonePermissionState,
  getPreferredAudioInputDeviceId,
  listAudioInputDevices,
  setPreferredAudioInputDeviceId,
  type AudioInputDeviceOption,
} from '@services/audioRecorder';

export const DEFAULT_AUDIO_INPUT_VALUE = '__system_default__';

const AUDIO_INPUT_AUTO_HYDRATION_SESSION_KEY = 'SETTINGS_AUDIO_INPUT_AUTO_HYDRATED';

export type SettingsAudioDeviceSyncSource = 'initial' | 'manual' | 'auto-hydrate' | 'devicechange';

export interface SettingsAudioInputOptions {
  trackRefresh?: (input: { requestPermission: boolean; deviceCount: number }) => void;
  trackError?: (event: string, error: unknown) => void;
}

export function useSettingsAudioInput(options: SettingsAudioInputOptions = {}) {
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
    source?: SettingsAudioDeviceSyncSource;
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
        options.trackRefresh?.({ requestPermission, deviceCount: devices.length });
      }
    } catch (error) {
      if (showError) {
        audioDeviceError.value = getMicrophoneErrorMessage(error);
      }
      options.trackError?.('settings_audio_devices_refresh_failed', error);
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
    void syncAudioInputDevices({ source: 'devicechange' });
  };

  const resolveSelectedPreferredAudioInputDeviceId = () => {
    return selectedAudioInputDeviceId.value === DEFAULT_AUDIO_INPUT_VALUE
      ? null
      : selectedAudioInputDeviceId.value;
  };

  return {
    audioDeviceError,
    audioDeviceLoading,
    audioInputDevices,
    audioInputOptions,
    handleAudioDeviceChange,
    hydrateAudioInputDevicesOnMount,
    refreshAudioInputDevices,
    resolveSelectedPreferredAudioInputDeviceId,
    selectedAudioInputDeviceId,
  };
}
