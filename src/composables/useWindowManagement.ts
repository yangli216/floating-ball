/**
 * 窗口管理 Composable
 *
 * 负责窗口位置、尺寸、显示器管理等底层操作。
 * 提供智能边界检测、位置持久化、尺寸等待等功能。
 *
 * @module composables/useWindowManagement
 */

import { ref, type Ref } from 'vue';
import type { Window as TauriWindow, Monitor } from '@tauri-apps/api/window';
import { PhysicalPosition, currentMonitor } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { ANIMATION, WINDOW_SIZE_TOLERANCE } from '../constants/animation';
import {
  getWindowSizeForView,
  isLargePanelView,
  supportsPersistentWindowSize,
  type ViewType,
  type WindowSize,
  WINDOW_SIZES,
} from '../constants/windowSizes';
import type { AppStore } from '../types/appState';

/**
 * 位置坐标类型
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * 窗口管理配置参数
 */
export interface WindowManagementOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** Tauri Store 实例引用 */
  store: Ref<AppStore | null>;
  /** 是否处于工作模式（用于判断是否保存位置） */
  isWorking: Ref<boolean>;
  /** 是否正在过渡动画中 */
  transitioning: Ref<boolean>;
}

/**
 * 窗口管理 Composable
 *
 * @param options - 配置参数
 * @returns 窗口管理 API
 *
 * @example
 * ```typescript
 * const windowMgmt = useWindowManagement({
 *   appWindow,
 *   store,
 *   isWorking,
 *   transitioning
 * });
 *
 * // 保存位置
 * await windowMgmt.saveWindowPosition();
 *
 * // 智能展开（自动边界检测）
 * await windowMgmt.smartExpand(1200, 900);
 * ```
 */
export function useWindowManagement(options: WindowManagementOptions) {
  const { appWindow, store, isWorking, transitioning } = options;
  const WINDOW_SIZES_STORE_KEY = 'window_sizes';

  // ========== 状态管理 ==========

  /** 显示器信息缓存（性能优化：避免频繁调用 currentMonitor） */
  const cachedMonitor = ref<Monitor | null>(null);

  /** 小球模式下的窗口位置缓存（用于展开/收起动画原点计算） */
  const lastBallPos = ref<Position | null>(null);

  /** 是否正在移动窗口 */
  const isMoving = ref(false);

  /** 移动防抖定时器 */
  let moveTimeout: ReturnType<typeof setTimeout> | null = null;

  const isValidStoredWindowSize = (value: unknown): value is WindowSize => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return Number.isFinite(candidate.width)
      && Number.isFinite(candidate.height)
      && Number(candidate.width) >= WINDOW_SIZES.BALL.width
      && Number(candidate.height) >= WINDOW_SIZES.BALL.height;
  };

  const isAcceptablePersistentWindowSize = (view: ViewType, size: WindowSize): boolean => {
    if (!isValidStoredWindowSize(size)) {
      return false;
    }

    // 大面板视图不应回退到聊天面板/胶囊这类明显错误的小尺寸。
    if (isLargePanelView(view)) {
      return size.width > WINDOW_SIZES.WORK.width && size.height > WINDOW_SIZES.WORK.height;
    }

    return true;
  };

  const getSavedWindowSizes = async (): Promise<Partial<Record<ViewType, WindowSize>>> => {
    if (!store.value) return {};
    const saved = await store.value.get<Partial<Record<ViewType, WindowSize>>>(WINDOW_SIZES_STORE_KEY);
    return saved || {};
  };

  const getPreferredWindowSize = async (view: ViewType): Promise<WindowSize> => {
    const fallback = getWindowSizeForView(view);
    if (!supportsPersistentWindowSize(view) || !store.value) {
      return fallback;
    }

    try {
      const savedSizes = await getSavedWindowSizes();
      const savedSize = savedSizes[view];
      if (savedSize && isAcceptablePersistentWindowSize(view, savedSize)) {
        return {
          width: Math.round(savedSize.width),
          height: Math.round(savedSize.height),
        };
      }
    } catch (err) {
      console.warn('[WindowMgmt] Failed to get preferred window size:', err);
    }

    return fallback;
  };

  const saveWindowSizeForView = async (view: ViewType, size: WindowSize): Promise<void> => {
    if (!supportsPersistentWindowSize(view) || !store.value || !isAcceptablePersistentWindowSize(view, size)) {
      return;
    }

    try {
      const savedSizes = await getSavedWindowSizes();
      savedSizes[view] = {
        width: Math.round(size.width),
        height: Math.round(size.height),
      };
      await store.value.set(WINDOW_SIZES_STORE_KEY, savedSizes);
      await store.value.save();
    } catch (err) {
      console.warn('[WindowMgmt] Failed to save window size:', err);
    }
  };

  const persistCurrentWindowSize = async (view: ViewType): Promise<void> => {
    if (!appWindow.value || !store.value || !supportsPersistentWindowSize(view)) return;

    try {
      const [size, scaleFactor] = await Promise.all([
        appWindow.value.innerSize(),
        appWindow.value.scaleFactor(),
      ]);

      const logicalSize = {
        width: Math.round(size.width / scaleFactor),
        height: Math.round(size.height / scaleFactor),
      };

      await saveWindowSizeForView(view, logicalSize);
    } catch (err) {
      console.warn('[WindowMgmt] Failed to persist current window size:', err);
    }
  };

  // ========== 位置持久化 ==========

  /**
   * 保存窗口位置到本地存储
   *
   * 仅在小球模式下保存，避免展开后位置偏移覆盖正确的小球位置。
   *
   * @param force - 是否强制保存（忽略 transitioning 状态）
   * @param providedPos - 可选的外部提供位置（避免重复调用 outerPosition）
   * @returns Promise<void>
   */
  const saveWindowPosition = async (force = false, providedPos?: Position): Promise<void> => {
    if (!appWindow.value || !store.value) return;

    try {
      // 优先使用提供的位置，减少异步开销
      const pos = providedPos || await appWindow.value.outerPosition();

      // 只有在小球模式下才保存位置，或者强制保存（用于退出前）
      if (force || (!isWorking.value && !transitioning.value)) {
        lastBallPos.value = { x: pos.x, y: pos.y };
        await store.value.set('window_pos', { x: pos.x, y: pos.y });
        await store.value.save();
      }
    } catch (err) {
      console.error('[WindowMgmt] Failed to save position:', err);
    }
  };

  // ========== 显示器管理 ==========

  /**
   * 更新显示器缓存
   *
   * 缓存显示器信息以避免频繁调用 currentMonitor()（性能优化）。
   * 应在窗口移动后调用，确保缓存与实际位置一致。
   *
   * @returns Promise<void>
   */
  const updateCurrentMonitor = async (): Promise<void> => {
    try {
      cachedMonitor.value = await currentMonitor();
    } catch (e) {
      console.warn('[WindowMgmt] Failed to update monitor cache:', e);
    }
  };

  // ========== 智能位置调整 ==========

  /**
   * 智能边界检测并调整窗口位置
   *
   * 确保展开后的窗口完全在显示器范围内。
   * 使用三级优先级：提供的 monitor > 缓存 monitor > 实时查询
   *
   * @param targetW - 目标宽度（逻辑像素）
   * @param targetH - 目标高度（逻辑像素）
   * @param targetMonitor - 可选的显示器对象（优先级最高）
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * // 展开到 1200x900，自动调整位置避免超出屏幕
   * await smartExpand(1200, 900);
   * ```
   */
  const smartExpand = async (
    targetW: number,
    targetH: number,
    targetMonitor?: Monitor | null
  ): Promise<void> => {
    if (!appWindow.value) return;

    try {
      // 显示器获取优先级：提供的 > 缓存 > 实时查询
      const monitor = targetMonitor ?? cachedMonitor.value ?? await currentMonitor();

      if (!monitor) {
        console.warn('[WindowMgmt] smartExpand: No monitor found');
        return;
      }

      const monitorSize = monitor.size;
      const monitorPos = monitor.position;
      const windowPos = await appWindow.value.outerPosition();
      const scaleFactor = await appWindow.value.scaleFactor();

      // 转换为物理像素进行计算
      const targetPhysicalW = Math.round(targetW * scaleFactor);
      const targetPhysicalH = Math.round(targetH * scaleFactor);

      let newX = windowPos.x;
      let newY = windowPos.y;

      // 四边界检查与调整
      // 1. 右边界
      if (newX + targetPhysicalW > monitorPos.x + monitorSize.width) {
        newX = monitorPos.x + monitorSize.width - targetPhysicalW;
      }

      // 2. 下边界
      if (newY + targetPhysicalH > monitorPos.y + monitorSize.height) {
        newY = monitorPos.y + monitorSize.height - targetPhysicalH;
      }

      // 3. 左边界（防止调整后超出左边）
      if (newX < monitorPos.x) {
        newX = monitorPos.x;
      }

      // 4. 上边界
      if (newY < monitorPos.y) {
        newY = monitorPos.y;
      }

      // 仅在需要时调整位置
      if (newX !== windowPos.x || newY !== windowPos.y) {
        await appWindow.value.setPosition(new PhysicalPosition(newX, newY));
      }
    } catch (err) {
      console.error('[WindowMgmt] smartExpand failed:', err);
    }
  };

  // ========== 尺寸管理 ==========

  /**
   * 等待窗口尺寸达到目标值
   *
   * 使用轮询检查，确保窗口尺寸调整动画完成。
   * 包含容差判断（±10px），避免浮点数精度问题。
   *
   * @param logicalW - 目标宽度（逻辑像素）
   * @param logicalH - 目标高度（逻辑像素）
   * @param timeout - 超时时长（毫秒），默认 1000ms
   * @returns Promise<void>
   */
  const waitForWindowSize = async (
    logicalW: number,
    logicalH: number,
    timeout = ANIMATION.WINDOW_SIZE_WAIT_TIMEOUT
  ): Promise<void> => {
    if (!appWindow.value) return;

    const start = performance.now();
    console.time('[WindowMgmt] waitForWindowSize');

    let scale = 1;
    try {
      scale = await appWindow.value.scaleFactor();
    } catch {
      // 降级：使用默认缩放
    }

    const targetW = Math.round(logicalW * scale);
    const targetH = Math.round(logicalH * scale);

    while (performance.now() - start < timeout) {
      try {
        const size = await appWindow.value.innerSize();
        const reached =
          Math.abs(size.width - targetW) <= WINDOW_SIZE_TOLERANCE &&
          Math.abs(size.height - targetH) <= WINDOW_SIZE_TOLERANCE;

        if (reached) {
          console.timeEnd('[WindowMgmt] waitForWindowSize');
          return;
        }
      } catch {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, ANIMATION.SIZE_POLL_INTERVAL));
    }

    console.warn(`[WindowMgmt] waitForWindowSize TIMEOUT after ${timeout}ms. Target: ${targetW}x${targetH}`);
    console.timeEnd('[WindowMgmt] waitForWindowSize');
  };

  /**
   * 调整窗口尺寸（通用方法）
   *
   * 包含完整的尺寸调整流程：
   * 1. 启用 Resizable
   * 2. 智能位置调整（避免超出屏幕）
   * 3. 设置目标尺寸
   * 4. 等待尺寸调整完成
   *
   * @param targetW - 目标宽度（逻辑像素）
   * @param targetH - 目标高度（逻辑像素）
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * // 调整到问诊面板尺寸
   * await resizeWorkWindow(1200, 900);
   * ```
   */
  const resizeWorkWindow = async (targetW: number, targetH: number): Promise<void> => {
    if (!appWindow.value) return;

    try {
      await appWindow.value.setResizable(true);
      // 先调整位置，再设置大小（避免窗口闪动到其他显示器）
      await smartExpand(targetW, targetH);
      await appWindow.value.setSize(new LogicalSize(targetW, targetH));
      await waitForWindowSize(targetW, targetH);
    } catch (err) {
      console.warn('[WindowMgmt] resizeWorkWindow failed:', err);
    }
  };

  const resizeWindowForView = async (view: ViewType): Promise<void> => {
    const preferredSize = await getPreferredWindowSize(view);
    await resizeWorkWindow(preferredSize.width, preferredSize.height);
  };

  // ========== 窗口移动监听 ==========

  /**
   * 处理窗口移动事件（带防抖和即时缓存）
   */
  const handleWindowMove = (): void => {
    isMoving.value = true;

    // 防抖：移动停止后持久化到磁盘
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      isMoving.value = false;
      // 直接读取底层最新坐标并保存
      saveWindowPosition();
      updateCurrentMonitor();
    }, ANIMATION.MOVE_DEBOUNCE_MS);
  };

  /**
   * 清理移动监听资源
   */
  const cleanupMoveListener = (): void => {
    if (moveTimeout) {
      clearTimeout(moveTimeout);
      moveTimeout = null;
    }
  };

  // ========== 导出 API ==========

  return {
    // 状态
    cachedMonitor,
    lastBallPos,
    isMoving,

    // 位置管理
    saveWindowPosition,

    // 显示器管理
    updateCurrentMonitor,

    // 智能调整
    smartExpand,

    // 尺寸管理
    getPreferredWindowSize,
    saveWindowSizeForView,
    persistCurrentWindowSize,
    waitForWindowSize,
    resizeWorkWindow,
    resizeWindowForView,

    // 事件处理
    handleWindowMove,
    cleanupMoveListener,
  };
}
