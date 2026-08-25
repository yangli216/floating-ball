import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveMainWindowRegionMode,
  useWin7WindowRegion,
  type MainWindowRegionMode,
} from './useWin7WindowRegion';

describe('resolveMainWindowRegionMode', () => {
  it('uses the compact ball regions only after the ball state is stable', () => {
    expect(resolveMainWindowRegionMode(false, false, false)).toBe('ball');
    expect(resolveMainWindowRegionMode(false, false, true)).toBe('ball-menu');
    expect(resolveMainWindowRegionMode(false, true, true)).toBeNull();
    expect(resolveMainWindowRegionMode(true, true, true)).toBeNull();
    expect(resolveMainWindowRegionMode(true, false, true)).toBe('full');
  });
});

describe('useWin7WindowRegion', () => {
  it('does not invoke the main-window command for standalone windows', async () => {
    const invokeRegion = vi.fn<(_: MainWindowRegionMode) => Promise<void>>();
    const controller = useWin7WindowRegion({
      enabled: false,
      isWorking: ref(false),
      transitioning: ref(false),
      isHovered: ref(false),
    }, invokeRegion);

    await controller.sync();
    await controller.prepareForGeometry();
    await controller.prepareBallContent();

    expect(invokeRegion).not.toHaveBeenCalled();
  });

  it('serializes ball, menu and full-region updates', async () => {
    const isWorking = ref(false);
    const transitioning = ref(false);
    const isHovered = ref(false);
    const applied: MainWindowRegionMode[] = [];
    const invokeRegion = vi.fn(async (mode: MainWindowRegionMode) => {
      applied.push(mode);
    });
    const scope = effectScope();
    const controller = scope.run(() => useWin7WindowRegion({
      isWorking,
      transitioning,
      isHovered,
    }, invokeRegion));

    expect(controller).toBeDefined();
    await controller!.sync();
    isHovered.value = true;
    await nextTick();
    await controller!.sync();
    transitioning.value = true;
    await nextTick();
    await controller!.sync();
    await controller!.prepareForGeometry();

    expect(applied).toEqual(['ball', 'ball-menu', 'full']);
    scope.stop();
  });

  it('forces full region before geometry even when the ball is idle', async () => {
    const applied: MainWindowRegionMode[] = [];
    const scope = effectScope();
    const controller = scope.run(() => useWin7WindowRegion({
      isWorking: ref(false),
      transitioning: ref(false),
      isHovered: ref(false),
    }, async (mode) => { applied.push(mode); }));

    await controller!.sync();
    await controller!.prepareForGeometry();

    expect(applied).toEqual(['ball', 'full']);
    scope.stop();
  });

  it('rebuilds the current region after moving to a monitor with another scale factor', async () => {
    const scaleFactor = ref<number | null>(1);
    const applied: MainWindowRegionMode[] = [];
    const scope = effectScope();
    const controller = scope.run(() => useWin7WindowRegion({
      isWorking: ref(false),
      transitioning: ref(false),
      isHovered: ref(false),
      scaleFactor,
    }, async (mode) => { applied.push(mode); }));

    await controller!.sync();
    scaleFactor.value = 1.5;
    await nextTick();
    await controller!.sync();

    expect(applied).toEqual(['ball', 'ball']);
    scope.stop();
  });
});
