import { invoke } from '@tauri-apps/api/core';
import { watch, type Ref } from 'vue';

export type MainWindowRegionMode = 'full' | 'ball' | 'ball-menu';

export interface Win7WindowRegionOptions {
  enabled?: boolean;
  isWorking: Ref<boolean>;
  transitioning: Ref<boolean>;
  isHovered: Ref<boolean>;
  scaleFactor?: Ref<number | null | undefined>;
}

export type MainWindowRegionInvoker = (mode: MainWindowRegionMode) => Promise<void>;

export function resolveMainWindowRegionMode(
  isWorking: boolean,
  transitioning: boolean,
  isHovered: boolean,
): MainWindowRegionMode | null {
  if (transitioning) return null;
  if (isWorking) return 'full';
  return isHovered ? 'ball-menu' : 'ball';
}

export function useWin7WindowRegion(
  options: Win7WindowRegionOptions,
  invokeRegion: MainWindowRegionInvoker = async (mode) => {
    await invoke('set_main_window_region', { mode });
  },
) {
  const {
    enabled = true,
    isWorking,
    transitioning,
    isHovered,
    scaleFactor,
  } = options;

  if (!enabled) {
    const noop = async (): Promise<void> => undefined;
    return {
      prepareForGeometry: noop,
      prepareBallContent: noop,
      sync: noop,
      stop: () => undefined,
    };
  }

  let desiredMode: MainWindowRegionMode | null = null;
  let appliedMode: MainWindowRegionMode | null = null;
  let applyTail: Promise<void> = Promise.resolve();

  const applyMode = (mode: MainWindowRegionMode): Promise<void> => {
    desiredMode = mode;
    applyTail = applyTail
      .catch((error) => {
        console.warn('[Win7WindowRegion] Previous region update failed:', error);
      })
      .then(async () => {
        const nextMode = desiredMode;
        if (!nextMode || nextMode === appliedMode) return;
        await invokeRegion(nextMode);
        appliedMode = nextMode;
      });
    return applyTail;
  };

  const sync = (): Promise<void> => {
    const mode = resolveMainWindowRegionMode(
      isWorking.value,
      transitioning.value,
      isHovered.value,
    );
    return mode ? applyMode(mode) : applyTail;
  };

  const syncFromWatch = (): void => {
    void sync().catch((error) => {
      console.warn('[Win7WindowRegion] Region update failed:', error);
    });
  };

  const stopStateWatch = watch(
    [isWorking, transitioning, isHovered],
    syncFromWatch,
    { immediate: true, flush: 'sync' },
  );

  const stopScaleWatch = scaleFactor
    ? watch(scaleFactor, (nextScale, previousScale) => {
      if (nextScale === previousScale) return;
      appliedMode = null;
      syncFromWatch();
    }, { flush: 'sync' })
    : () => undefined;

  return {
    prepareForGeometry: () => applyMode('full'),
    prepareBallContent: () => applyMode(isHovered.value ? 'ball-menu' : 'ball'),
    sync,
    stop: () => {
      stopStateWatch();
      stopScaleWatch();
    },
  };
}
