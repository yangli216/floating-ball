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
 * @module app/shell/useWorkMode
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { getWindowSizeForView, type WindowSize, WINDOW_SIZES, type ViewType } from '@/constants/windowSizes';
import { ANIMATION, MORPH_ORIGIN_DEFAULT } from '@/constants/animation';
import { feedbackService } from '@/services/feedback';
import { trackClick } from '@/services/operationTracker';
import type { useWindowManagement } from './useWindowManagement';
import type { AppPatient, AppStore } from '@/types/appState';
import { getPatientContextId, getPatientContextName } from '@/utils/patientContext';

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
  currentPatient: Ref<AppPatient | null>;
  /** 风险提示状态更新回调（用于 handleCollapse 中同步患者信息到风险提示） */
  syncRiskPatientInfo?: (patient: AppPatient) => void;
  /** 返回接待胶囊时当前应使用的窗口尺寸 */
  getReceptionWindowSize?: () => WindowSize;
  /** Tauri Store 实例（用于 exitWork 中读取保存的位置） */
  store: Ref<AppStore | null>;
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
    getReceptionWindowSize,
    store,
  } = options;

  const {
    lastBallPos,
    isMoving,
    getPreferredWindowSize,
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

  /**
   * 内容是否可见：默认 true。
   * 在“问诊页 ↔ 胶囊 ↔ 小球”阶段切换期间临时置 false，
   * 让 assistant-container 染色薄薄添加隐藏类，
   * 来掩盖 OS 窗口 setSize / setPosition 期间的内容裁切咨点。
   */
  const contentVisible = ref(true);

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
  async function resolveTargetSize(customW?: number, customH?: number): Promise<{ w: number; h: number }> {
    if (customW !== undefined && customH !== undefined) {
      return { w: customW, h: customH };
    }
    const size = await getPreferredWindowSize(currentView.value);
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
    const { w: targetW, h: targetH } = await resolveTargetSize(customW, customH);

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
        getPatientContextId(currentPatient.value) || currentPatient.value?.piOi,
        getPatientContextName(currentPatient.value)
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

    // 兜底：如果当前会话还没有产出结果（用户直接关闭窗口），
    // 写入 cancelled 通知 SDK 停止轮询。已有结果时不会覆盖。
    try {
      await invoke('cancel_consultation_if_pending');
    } catch (e) {
      console.warn('[WorkMode] cancel_consultation_if_pending failed:', e);
    }

    // 1. 计算收缩动画参数
    await calculateMorphOrigin('shrink');

    // 1.5 从胶囊退出时预扩窗：胶囊是 320x80，小于球的 160x160 高度，
      // 若保持胶囊尺寸进入 morph，ball-layer 会被 OS 窗口裁切，
      // 出现“半个球”。提前把窗口扩到 BALL 尺寸且贴回小球位置，
      // 让后续 CSS 动画始终能完整呈现小球。
    if (currentView.value === 'reception-capsule' && appWindow.value) {
      try {
        // 先淑出胶囊内容，避免 setSize 瞬间看到胶囊内容被裁切。
        contentVisible.value = false;
        await new Promise<void>((resolve) => setTimeout(resolve, ANIMATION.CONTENT_FADE_MS));
        if (lastBallPos.value) {
          await appWindow.value.setPosition(
            new PhysicalPosition(lastBallPos.value.x, lastBallPos.value.y)
          );
        }
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.BALL.width, WINDOW_SIZES.BALL.height)
        );
      } catch (e) {
        console.warn('[WorkMode] Pre-resize capsule->ball failed:', e);
      }
    }

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
          const savedPos = await store.value.get('window_pos') as Position | null;
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

    // 8. 恢复内容可见，供下一次进入工作模式使用
    contentVisible.value = true;
  };

  /**
   * 智能收起处理
   *
   * 问诊态统一先回到风险提示页，其他视图则直接回到悬浮球。
   * - 症状问诊 / 语音问诊 在收起前已由 App.handleUserCollapse 写入最小化会话记录；
   * - reception-capsule 作为问诊态与球态之间的统一过渡页；
   * - 医生从风险提示页再次关闭时，才真正退出到悬浮球。
   */
  const handleCollapse = async (): Promise<void> => {
    const shouldReturnToReception =
      (currentView.value === 'consultation' || currentView.value === 'voice-consultation') &&
      !!currentPatient.value;

    trackClick('collapse', {
      from: currentView.value,
      toReception: shouldReturnToReception,
    });

    if (shouldReturnToReception && currentPatient.value) {
      // 淑出问诊页内容，避免 OS 窗口缩小期间看到问诊内容被裁切。
      contentVisible.value = false;
      await new Promise<void>((resolve) => setTimeout(resolve, ANIMATION.CONTENT_FADE_MS));

      currentView.value = 'reception-capsule';
      syncRiskPatientInfo?.(currentPatient.value);
      // 注意：不在此处 await nextTick()。nextTick 在 Vue flush 期间如有组件更新报错
      // 会导致 Promise reject 并中断后续逻辑，使 contentVisible 永远不会被还原。
      // resizeWorkWindow 首个 await setResizable IPC 调用本身已给 Vue flush 留出时机。

      // 顺序必须是“先缩小、再移位”：
      // 若先把 1200x900 的问诊窗口贴到小球坐标（右边缘场景），macOS 会
      // 发现该坐标容不下问诊尺寸，从而跨显示器复位，产生一闪。
      // 改为先 resize 到胶囊尺寸，再 setPosition 就不会被夹跨屏。
      try {
        const receptionSize = getReceptionWindowSize?.() ?? getWindowSizeForView('reception-capsule');
        await resizeWorkWindow(receptionSize.width, receptionSize.height);

        if (lastBallPos.value && appWindow.value) {
          try {
            await appWindow.value.setPosition(
              new PhysicalPosition(lastBallPos.value.x, lastBallPos.value.y)
            );
          } catch (e) {
            console.warn('[WorkMode] Failed to align capsule to ball position:', e);
          }
        }
      } finally {
        // 无论窗口调整成功与否，都必须恢复内容可见性，避免 UI 永久卡在透明状态。
        contentVisible.value = true;
      }
      return;
    }

    await exitWork();
  };

  // ========== 导出 ==========

  return {
    // 状态
    exiting,
    ballOffset,
    morphOrigin,
    containerStyle,
    ballStyle,
    contentVisible,

    // 方法
    enterWorkMode,
    exitWork,
    handleCollapse,
  };
}
