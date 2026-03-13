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

  // ========== 状态管理 ==========

  /** 显示器信息缓存（性能优化：避免频繁调用 currentMonitor） */
  const cachedMonitor = ref<Monitor | null>(null);

  /** 小球模式下的窗口位置缓存（用于展开/收起动画原点计算） */
  const lastBallPos = ref<Position | null>(null);

  /** 是否正在移动窗口 */
  const isMoving = ref(false);

  /** 移动防抖定时器 */
  let moveTimeout: ReturnType<typeof setTimeout> | null = null;

  // ========== 位置持久化 ==========

  /**
   * 保存窗口位置到本地存储
   *
   * 仅在小球模式下保存，避免展开后位置偏移覆盖正确的小球位置。
   *
   * @returns Promise<void>
   */
  const saveWindowPosition = async (): Promise<void> => {
    if (!appWindow.value || !store.value) return;

    try {
      const pos = await appWindow.value.outerPosition();

      // 只有在小球模式下才保存位置
      if (!isWorking.value && !transitioning.value) {
        lastBallPos.value = { x: pos.x, y: pos.y };
        await store.value.set('window_pos', { x: pos.x, y: pos.y });
        await store.value.save();
        console.log('[WindowMgmt] Position saved:', pos);
      }
    } catch (err) {
      console.error('[WindowMgmt] Failed to save position:', err);
    }
  };

  /**
   * 从本地存储恢复窗口位置
   *
   * 包含边界验证，确保窗口不会出现在屏幕外。
   * 使用多层降级策略：显示器验证 → 非负验证 → 默认位置 (100, 100)
   *
   * @returns Promise<void>
   */
  const restoreWindowPosition = async (): Promise<void> => {
    if (!appWindow.value || !store.value) return;

    try {
      const pos = await store.value.get('window_pos') as Position;
      console.log('[WindowMgmt] Restoring position:', pos);

      let safeX = 100;
      let safeY = 100;

      if (pos) {
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const size = monitor.size;
            const mPos = monitor.position;

            // 边界检查：位置必须在显示器范围内
            if (
              pos.x >= mPos.x &&
              pos.x < mPos.x + size.width &&
              pos.y >= mPos.y &&
              pos.y < mPos.y + size.height
            ) {
              safeX = pos.x;
              safeY = pos.y;
            } else {
              console.warn('[WindowMgmt] Position out of bounds:', pos, 'Monitor:', mPos, size);
            }
          } else {
            // 无显示器信息，仅确保非负
            safeX = Math.max(0, pos.x);
            safeY = Math.max(0, pos.y);
          }
        } catch (e) {
          console.warn('[WindowMgmt] Position validation failed:', e);
          // 降级：简单的非负检查
          safeX = Math.max(0, pos.x);
          safeY = Math.max(0, pos.y);
        }
      }

      console.log('[WindowMgmt] Final position:', { x: safeX, y: safeY });
      await appWindow.value.setPosition(new PhysicalPosition(safeX, safeY));
      
      // 更新小球模式下的位置缓存，保证动画返回坐标正确
      lastBallPos.value = { x: safeX, y: safeY };
    } catch (err) {
      console.error('[WindowMgmt] Failed to restore position:', err);
      // 终极降级：默认位置
      await appWindow.value.setPosition(new PhysicalPosition(100, 100));
      lastBallPos.value = { x: 100, y: 100 };
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
      const start = performance.now();
      cachedMonitor.value = await currentMonitor();
      const duration = (performance.now() - start).toFixed(2);
      console.log(
        '[WindowMgmt] Monitor cache updated:',
        cachedMonitor.value ? 'Success' : 'Null',
        `${duration}ms`
      );
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
      let monitor = targetMonitor;
      if (monitor) {
        console.log('[WindowMgmt] smartExpand: Using provided monitor');
      } else if (cachedMonitor.value) {
        monitor = cachedMonitor.value;
        console.log('[WindowMgmt] smartExpand: Using CACHED monitor');
      } else {
        console.log('[WindowMgmt] smartExpand: Cache MISS, calling currentMonitor()...');
        const start = performance.now();
        monitor = await currentMonitor();
        console.log('[WindowMgmt] smartExpand: currentMonitor() took', (performance.now() - start).toFixed(2), 'ms');
      }

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
        console.log('[WindowMgmt] Adjusting position:', { from: windowPos, to: { x: newX, y: newY } });
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

    console.time('[WindowMgmt] waitForWindowSize');

    let scale = 1;
    try {
      scale = await appWindow.value.scaleFactor();
    } catch {
      // 降级：使用默认缩放
    }

    const targetW = Math.round(logicalW * scale);
    const targetH = Math.round(logicalH * scale);
    const start = performance.now();

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

  // ========== 窗口移动监听 ==========

  /**
   * 处理窗口移动事件（带防抖）
   *
   * 在移动结束后自动保存位置并更新显示器缓存。
   * 使用防抖避免频繁写入存储。
   */
  const handleWindowMove = (): void => {
    isMoving.value = true;

    // 防抖：移动停止 500ms 后执行
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      isMoving.value = false;
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
    restoreWindowPosition,

    // 显示器管理
    updateCurrentMonitor,

    // 智能调整
    smartExpand,

    // 尺寸管理
    waitForWindowSize,
    resizeWorkWindow,

    // 事件处理
    handleWindowMove,
    cleanupMoveListener,
  };
}
