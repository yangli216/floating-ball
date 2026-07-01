import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue';

export type SettingsSaveTab = 'general' | 'about';

export interface SettingsSaveStateOptions {
  activeTab: MaybeRefOrGetter<SettingsSaveTab>;
  saving: MaybeRefOrGetter<boolean>;
  snapshot: MaybeRefOrGetter<string>;
  save: () => Promise<void> | void;
}

export function useSettingsSaveState(options: SettingsSaveStateOptions) {
  const settingsLoaded = ref(false);
  const lastSavedSnapshot = ref('');

  const shouldShowSaveBar = computed(() => {
    const activeTab = toValue(options.activeTab);
    return activeTab === 'general';
  });

  const hasUnsavedChanges = computed(() => {
    return settingsLoaded.value && toValue(options.snapshot) !== lastSavedSnapshot.value;
  });

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

    return '通用设置有未保存变更';
  });

  const markSettingsLoaded = () => {
    settingsLoaded.value = true;
  };

  const updateSavedSnapshot = () => {
    lastSavedSnapshot.value = toValue(options.snapshot);
  };

  const handleSaveShortcut = async (event: KeyboardEvent) => {
    const pressedSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
    if (
      !pressedSaveShortcut
      || !shouldShowSaveBar.value
      || !hasUnsavedChanges.value
      || toValue(options.saving)
    ) {
      return;
    }

    event.preventDefault();
    await options.save();
  };

  return {
    handleSaveShortcut,
    hasUnsavedChanges,
    markSettingsLoaded,
    saveBarDescription,
    saveShortcutLabel,
    settingsLoaded,
    shouldShowSaveBar,
    updateSavedSnapshot,
  };
}
