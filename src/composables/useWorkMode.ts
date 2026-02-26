/**
 * 工作模式 Composable
 *
 * 负责悬浮球 ↔ 工作面板的展开/收起切换逻辑，包括：
 * - 进入工作模式（展开动画 + 窗口调整）
 * - 退出工作模式（收起动画 + 位置恢复）
 * - 智能收起（问诊→胶囊 or 完全退出）
 * - 变形动画原点计算
 * - 会话生命周期管理
 *
 * @module composables/useWorkMode
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { WINDOW_SIZES, getWindowSizeForView, type ViewType } from '../constants/windowSizes';
import { ANIMATION, MORPH_ORIGIN_DEFAULT } from '../constants/animation';
import { feedbackService } from '../services/feedback';
import { trackClick } from '../services/operationTracker';
import type { useWindowManagement } from './useWindowManagement';

/**
 * 位置坐标类型
 */
interface Position {
  x: number;
  y: number;
}

/**
 * 工作模式配置参数
 */
export interface WorkModeOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** 窗口管理 composable 实例 */
  windowMgmt: ReturnType<typeof useWindowManagement>;
  /** 当前视图 */
  currentView: Ref<ViewType>;
  /** 是否处于工作模式 */
  isWorking: Ref<boolean>;
  /** 是否正在过渡动画中 */
  transitioning: Ref<boolean>;
  /** 是否悬停 */
  isHovered: Ref<boolean>;
  /** 当前患者信息 */
  currentPatient: Ref<any>;
  /** 风险提示状态更新回调（用于 handleCollapse 中同步患者信息到风险提示） */
  syncRiskPatientInfo?: (patient: any) => void;
  /** Tauri Store 实例（用于 exitWork 中读取保存的位置） */
  store: Ref<any>;
}

/**
 * 工作模式 Composable
 *
 * @param options - 配置参数
 * @returns 工作模式 API
 *
 * @example
 * ```typescript
 * const workMode = useWorkMode({
 *   appWindow,
 *   windowMgmt,
 *   currentView,
 *   isWorking,
 *   transitioning,
 *   isHovered,
 *   currentPatient,
 *   store: storeRef,
 * });
 *
 * // 展开到工作模式
 * await workMode.enterWorkMode();
 *
 * // 收起到小球
 * await workMode.exitWork();
 * ```
 */
export function useWorkMode(options: WorkModeOptions) {
  const {
    appWindow,
    windowMgmt,
    currentView,
    isWorking,
    transitioning,
    isHovered,
    currentPatient,
    syncRiskPatientInfo,
    store,
  } = options;

  const {
    lastBallPos,
    isMoving,
    resizeWorkWindow,
    waitForWindowSize,
  } = windowMgmt;

  // ========== 状态 ==========

  /** 是否正在退出工作模式 */
  const exiting = ref(false);

  /** 小球视觉偏移量（退出动画中使用） */
  const ballOffset = ref<Position>({ x: 0, y: 0 });

  /** 变形动画原点（CSS transform-origin） */
  const morphOrigin = ref(MORPH_ORIGIN_DEFAULT);

  /** 容器样式（绑定 transform-origin） */
  const containerStyle: ComputedRef<Record<string, string>> = computed(() => ({
    transformOrigin: morphOrigin.value,
  }));

  /** 小球样式（绑定 translate 偏移） */
  const ballStyle: ComputedRef<Record<string, string>> = computed(() => ({
    transform: `translate(${ballOffset.value.x}px, ${ballOffset.value.y}px)`,
    transition: 'opacity 0.2s ease',
  }));

  // ========== 内部工具 ==========

  /**
   * 根据视图类型确定目标窗口尺寸
   */
  function resolveTargetSize(customW?: number, customH?: number): { w: number; h: number } {
    if (customW !== undefined && customH !== undefined) {
      return { w: customW, h: customH };
    }
    const size = getWindowSizeForView(currentView.value);
    return { w: customW ?? size.width, h: customH ?? size.height };
  }

  /**
   * 计算变形动画原点
   *
   * 根据小球位置和当前窗口位置计算 CSS transform-origin，
   * 确保展开/收起动画从小球中心位置开始。
   */
  async function calculateMorphOrigin(mode: 'expand' | 'shrink'): Promise<void> {
    if (!appWindow.value || !lastBallPos.value) {
      morphOrigin.value = MORPH_ORIGIN_DEFAULT;
      return;
    }

    try {
      const winPos = await appWindow.value.outerPosition();
      const scale = (await appWindow.value.scaleFactor()) || 1;

      const dx = (lastBallPos.value.x - winPos.x) / scale;
      const dy = (lastBallPos.value.y - winPos.y) / scale;

      if (mode === 'expand') {
        // 展开：原点 = 小球中心相对于窗口的位置
        morphOrigin.value = `${dx + 80}px ${dy + 80}px`;
      } else {
        // 收起：同时设置小球偏移和动画原点
        ballOffset.value = { x: dx, y: dy };
        morphOrigin.value = `${dx + 80}px ${dy + 80}px`;
      }
    } catch (e) {
      console.warn('[WorkMode] Failed to calculate morph origin:', e);
      morphOrigin.value = MORPH_ORIGIN_DEFAULT;
    }
  }

  /**
   * 确定会话类型
   */
  function getSessionType(): 'chat' | 'consultation' | 'voice' | 'reception' {
    switch (currentView.value) {
      case 'consultation': return 'consultation';
      case 'voice-interaction': return 'voice';
      case 'reception-capsule': return 'reception';
      default: return 'chat';
    }
  }

  // ========== 核心方法 ==========

  /**
   * 进入工作模式（展开窗口）
   *
   * 流程：
   * 1. 如果已在工作模式，仅调整窗口尺寸
   * 2. 记录小球位置
   * 3. 调整窗口尺寸
   * 4. 计算动画原点
   * 5. 触发展开动画
   * 6. 启动会话
   *
   * @param customW - 自定义宽度（可选）
   * @param customH - 自定义高度（可选）
   */
  const enterWorkMode = async (customW?: number, customH?: number): Promise<void> => {
    const { w: targetW, h: targetH } = resolveTargetSize(customW, customH);

    // 已在工作模式：仅调整尺寸
    if (isWorking.value) {
      await resizeWorkWindow(targetW, targetH);
      return;
    }

    if (transitioning.value) return;
    transitioning.value = true;

    // 应用 Always on Top 配置
    if (appWindow.value) {
      const saved = localStorage.getItem('ALWAYS_ON_TOP');
      const isAlwaysOnTop = saved === null || saved === 'true';
      await appWindow.value.setAlwaysOnTop(isAlwaysOnTop);
    }

    // 记录小球位置（优先使用缓存）
    if (!lastBallPos.value && appWindow.value) {
      try {
        const pos = await appWindow.value.outerPosition();
        lastBallPos.value = { x: pos.x, y: pos.y };
      } catch (e) {
        console.error('[WorkMode] Failed to record ball position:', e);
      }
    }

    // 调整窗口尺寸
    await resizeWorkWindow(targetW, targetH);

    // 计算展开动画原点
    await calculateMorphOrigin('expand');

    // 触发展开动画
    isWorking.value = true;
    trackClick('enter_work_mode', { view: currentView.value });

    // 启动会话
    try {
      await feedbackService.startSession(
        getSessionType(),
        currentPatient.value?.patientId || currentPatient.value?.piOi,
        currentPatient.value?.name || currentPatient.value?.naPi
      );
      console.log(`[WorkMode] Session started for ${getSessionType()}`);
    } catch (error) {
      console.error('[WorkMode] Failed to start session:', error);
    }

    // 等待动画结束
    setTimeout(() => {
      transitioning.value = false;
    }, ANIMATION.TRANSITION_MS);
  };

  /**
   * 退出工作模式（收起窗口为小球）
   *
   * 流程：
   * 1. 计算小球偏移和动画原点
   * 2. 触发收缩动画
   * 3. 结束会话
   * 4. 等待动画完成
   * 5. 移动窗口到小球位置
   * 6. 缩小窗口尺寸
   * 7. 重置状态
   *
   * @param sessionStatus - 会话结束状态
   */
  const exitWork = async (
    sessionStatus: 'completed' | 'cancelled' | 'error' = 'completed'
  ): Promise<void> => {
    if (!isWorking.value || transitioning.value || isMoving.value) return;
    trackClick('exit_work_mode', { view: currentView.value, sessionStatus });

    // 恢复 Always on Top（小球模式始终置顶）
    if (appWindow.value) {
      await appWindow.value.setAlwaysOnTop(true);
    }

    transitioning.value = true;
    exiting.value = true;

    // 1. 计算收缩动画参数
    await calculateMorphOrigin('shrink');

    // 2. 触发收缩动画
    isWorking.value = false;

    // 结束会话
    try {
      await feedbackService.endSession(undefined, sessionStatus);
      console.log('[WorkMode] Session ended successfully');
    } catch (error) {
      console.error('[WorkMode] Failed to end session:', error);
    }

    // 强制关闭 hover 状态（防止收缩过程中环绕菜单闪现）
    isHovered.value = false;

    // 3. 等待动画结束
    await new Promise<void>((resolve) => setTimeout(resolve, ANIMATION.TRANSITION_MS));

    // 4. 移动窗口并重置偏移
    if (appWindow.value) {
      try {
        let targetX = 0;
        let targetY = 0;
        let hasTarget = false;

        // 确定目标位置
        if (lastBallPos.value) {
          targetX = lastBallPos.value.x;
          targetY = lastBallPos.value.y;
          hasTarget = true;
        } else if (store.value) {
          const savedPos = await store.value.get('window_pos') as Position;
          if (savedPos) {
            targetX = savedPos.x;
            targetY = savedPos.y;
            hasTarget = true;
          }
        }

        if (hasTarget) {
          await appWindow.value.setResizable(true);

          // 并发：窗口移动 + 小球归位
          const movePromise = appWindow.value.setPosition(new PhysicalPosition(targetX, targetY));
          ballOffset.value = { x: 0, y: 0 };
          await movePromise;

          // 缩小窗口
          await appWindow.value.setSize(new LogicalSize(WINDOW_SIZES.BALL.width, WINDOW_SIZES.BALL.height));
          await appWindow.value.setResizable(false);

          // 二次校验位置（macOS 边缘情况）
          await new Promise<void>((resolve) => setTimeout(resolve, ANIMATION.POSITION_VERIFY_DELAY));
          const currentPos = await appWindow.value.outerPosition();
          if (Math.abs(currentPos.x - targetX) > 10 || Math.abs(currentPos.y - targetY) > 10) {
            console.warn('[WorkMode] Position mismatch, retrying...', currentPos, targetX, targetY);
            await appWindow.value.setPosition(new PhysicalPosition(targetX, targetY));
          }
        } else {
          // 无目标位置，仅缩小
          await appWindow.value.setResizable(true);
          await appWindow.value.setSize(new LogicalSize(WINDOW_SIZES.BALL.width, WINDOW_SIZES.BALL.height));
          await appWindow.value.setResizable(false);
        }

        lastBallPos.value = null;
      } catch (err) {
        console.warn('[WorkMode] Failed to restore window state:', err);
      }
    }

    // 5. 等待窗口尺寸响应
    await waitForWindowSize(WINDOW_SIZES.BALL.width, WINDOW_SIZES.BALL.height);

    // 6. 重置状态
    exiting.value = false;
    transitioning.value = false;

    // 7. 强制刷新 hover 状态
    try {
      const isHoveredNow = await invoke('check_mouse_hover');
      console.log('[WorkMode] Forced hover check:', isHoveredNow);
      isHovered.value = isHoveredNow as boolean;
    } catch (e) {
      console.error('[WorkMode] Failed to force hover check:', e);
    }
  };

  /**
   * 智能收起处理
   *
   * 根据当前上下文决定收起行为：
   * - 问诊界面 + 有患者 → 收起到接待胶囊
   * - 其他情况 → 完全退出工作模式
   */
  const handleCollapse = async (): Promise<void> => {
    trackClick('collapse', {
      from: currentView.value,
      toReception: currentView.value === 'consultation' && !!currentPatient.value,
    });

    // 问诊界面 + 有患者 → 收起到接待胶囊
    if (currentView.value === 'consultation' && currentPatient.value) {
      currentView.value = 'reception-capsule' as ViewType;

      // 同步患者信息到风险提示
      if (syncRiskPatientInfo) {
        syncRiskPatientInfo(currentPatient.value);
      }

      // 恢复位置到小球原来的位置
      if (lastBallPos.value && appWindow.value) {
        try {
          await appWindow.value.setPosition(
            new PhysicalPosition(lastBallPos.value.x, lastBallPos.value.y)
          );
        } catch (e) {
          console.warn('[WorkMode] Failed to restore position for capsule:', e);
        }
      }

      await resizeWorkWindow(WINDOW_SIZES.CAPSULE.width, WINDOW_SIZES.CAPSULE.height);
    } else {
      await exitWork();
    }
  };

  // ========== 导出 ==========

  return {
    // 状态
    exiting,
    ballOffset,
    morphOrigin,
    containerStyle,
    ballStyle,

    // 方法
    enterWorkMode,
    exitWork,
    handleCollapse,
  };
}
