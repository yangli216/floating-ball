/**
 * 事件监听管理 Composable
 *
 * 统一管理应用的所有事件监听，包括：
 * - Deep Link 监听
 * - HIS 集成事件监听（患者风险、问诊控制等）
 * - 鼠标事件监听（hover、position）
 * - 窗口事件监听（move、resize）
 *
 * @module composables/useEventListeners
 */

import { ref, type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { WINDOW_SIZES, type ViewType } from '../constants/windowSizes';
import { analyzePatientRisks } from '../services/llm';
import { trackApiCall, trackError, startTimedOperation } from '../services/operationTracker';
import type { RiskItem } from '../components/RiskAlertPanel.vue';

/**
 * 事件监听配置参数
 */
export interface EventListenersOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** 当前视图 */
  currentView: Ref<ViewType>;
  /** 是否处于工作模式 */
  isWorking: Ref<boolean>;
  /** 是否正在过渡动画中 */
  transitioning: Ref<boolean>;
  /** 是否悬停 */
  isHovered: Ref<boolean>;
  /** 悬停按钮索引 */
  hoveredBtnIndex: Ref<number>;
  /** 环绕菜单 DOM 引用 */
  ringMenuRef: Ref<HTMLElement | null>;
  /** 当前患者信息 */
  currentPatient: Ref<any>;
  /** 风险提示状态 */
  riskState: {
    riskPatientName: Ref<string>;
    riskPatientGender: Ref<'M' | 'F'>;
    riskPatientAge: Ref<number>;
    riskItems: Ref<RiskItem[]>;
    isRiskAnalyzing: Ref<boolean>;
  };
  /** Toast 提示函数 */
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  /** 窗口移动处理函数 */
  handleWindowMove: () => void;
  /** 工作模式相关函数 */
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
    exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>;
  };
  /** 导航函数 */
  navigation: {
    openConsultation: () => Promise<void>;
    startVoiceInteraction: () => Promise<void>;
  };
  /** 退出标志（来自 workMode） */
  exiting: Ref<boolean>;
  /** 窗口大小变化防抖超时 */
  resizeTimeoutRef: Ref<ReturnType<typeof setTimeout> | null>;
}

/**
 * 事件监听管理 Composable
 *
 * @param options - 配置参数
 * @returns 事件监听管理 API
 */
export function useEventListeners(options: EventListenersOptions) {
  const {
    appWindow,
    currentView,
    isWorking,
    transitioning,
    isHovered,
    hoveredBtnIndex,
    ringMenuRef,
    currentPatient,
    riskState,
    showToast,
    handleWindowMove,
    workMode,
    navigation,
    exiting,
    resizeTimeoutRef,
  } = options;

  const {
    riskPatientName,
    riskPatientGender,
    riskPatientAge,
    riskItems,
    isRiskAnalyzing,
  } = riskState;

  // ========== 事件监听句柄 ==========

  let unlistenHover: UnlistenFn | null = null;
  let unlistenMousePos: UnlistenFn | null = null;
  let unlistenMoved: UnlistenFn | null = null;
  let unlistenResize: UnlistenFn | null = null;

  // ========== Deep Link 监听 ==========

  /**
   * 注册 Deep Link 监听
   */
  async function registerDeepLinkListener(): Promise<void> {
    try {
      await onOpenUrl((urls) => {
        console.log('Deep link received:', urls);
        if (urls && urls.length > 0) {
          const url = urls[0];
          trackApiCall('deep_link_received', true, undefined, { url });
          showToast(`收到外部调用: ${url}`, 'info');

          // Simple routing based on URL
          if (url.includes('voice-consultation')) {
            navigation.startVoiceInteraction();
          } else if (!isWorking.value) {
            workMode.enterWorkMode();
          }
        }
      });
    } catch (e) {
      console.warn('Failed to register deep link listener:', e);
    }
  }

  // ========== HIS 集成事件监听 ==========

  /**
   * 注册患者风险提示事件监听
   */
  async function registerPatientRisksListener(): Promise<void> {
    await listen<any>('show-patient-risks', async (event) => {
      console.log('Received patient risks request:', event.payload);
      const data = event.payload;
      trackApiCall('his_patient_risks', true, undefined, {
        patientName: data.patientName,
        riskCount: data.risks?.length,
      });

      // Update basic info immediately
      riskPatientName.value = data.patientName || '未知患者';
      riskPatientGender.value = data.gender || 'M';
      riskPatientAge.value = data.age || 0;
      riskItems.value = []; // Reset risks initially
      isRiskAnalyzing.value = true;

      // GLOBAL STATE: Set current patient context
      // Normalize data structure for other views
      currentPatient.value = {
        ...data,
        name: data.patientName,
        // Early mapping for ConsultationPage compatibility
        naPi: data.patientName,
        sdSexText: data.gender === 'M' ? '男性' : '女性',
        ageText: data.age ? `${data.age}岁` : '',
        // Ensure other fields are carried over
      };

      // Switch to Reception Capsule View
      currentView.value = 'reception-capsule';
      if (!isWorking.value) {
        await workMode.enterWorkMode(WINDOW_SIZES.CAPSULE.width, WINDOW_SIZES.CAPSULE.height);
      } else {
        // Resize if already open
        workMode.enterWorkMode(WINDOW_SIZES.CAPSULE.width, WINDOW_SIZES.CAPSULE.height);
      }

      // If backend provided pre-calculated risks, use them immediately
      if (data.risks && data.risks.length > 0) {
        riskItems.value = data.risks;
        isRiskAnalyzing.value = false;
        return;
      }

      // Otherwise, trigger LLM analysis
      try {
        const finishRiskAnalysis = startTimedOperation('risk_analysis_llm');
        const risks = await analyzePatientRisks(data);
        console.log('LLM Risk Analysis Result:', risks);
        riskItems.value = risks || [];
        finishRiskAnalysis(true, { riskCount: riskItems.value.length });
      } catch (e) {
        console.error('Risk analysis error:', e);
        trackError('risk_analysis_failed', e);
        showToast('风险评估失败', 'error');
      } finally {
        isRiskAnalyzing.value = false;

        // If risks exist, show toast as well
        if (riskItems.value.length > 0) {
          showToast(`发现 ${riskItems.value.length} 项健康风险`, 'info');
        }
      }
    });
  }

  /**
   * 注册开始问诊事件监听
   */
  async function registerStartConsultationListener(): Promise<void> {
    await listen<any>('start-consultation', async (event) => {
      console.log('Received consultation request:', event.payload);
      const payload = event.payload || {};
      trackApiCall('his_start_consultation', true, undefined, {
        patientId: payload.idPi || payload.patientId,
      });

      // Update/Merge Global Patient Context
      // This ensures we have the correct keys (naPi, sdSexText) for ConsultationPage
      currentPatient.value = {
        ...(currentPatient.value || {}),
        ...payload,
        // Fallbacks/Mappings if payload is missing strict keys but has loose keys
        naPi: payload.naPi || payload.name || currentPatient.value?.patientName || '未知',
        idPi: payload.idPi || payload.patientId || currentPatient.value?.patientId,
        ageText: payload.ageText || (currentPatient.value?.age ? `${currentPatient.value.age}岁` : ''),
        sdSexText: payload.sdSexText || (currentPatient.value?.gender === 'M' ? '男性' : '女性'),
      };

      await navigation.openConsultation();
    });
  }

  /**
   * 注册停止问诊事件监听
   */
  async function registerStopConsultationListener(): Promise<void> {
    await listen<any>('stop-consultation', async () => {
      console.log('Received stop consultation request');
      // Force exit work mode regardless of current view
      if (isWorking.value) {
        // Optional: clear patient data?
        // currentPatient.value = null;
        await workMode.exitWork();
      }
    });
  }

  /**
   * 注册语音问诊事件监听
   */
  async function registerVoiceConsultationListener(): Promise<void> {
    await listen<any>('start-voice-consultation', async () => {
      console.log('Received start voice consultation command');
      trackApiCall('his_start_voice', true);
      if (!currentPatient.value) {
        showToast('请先接诊患者', 'error');
        return;
      }
      await navigation.startVoiceInteraction();
    });
  }

  // ========== 鼠标事件监听 ==========

  /**
   * 注册鼠标悬停事件监听
   */
  async function registerHoverListener(): Promise<void> {
    unlistenHover = await listen<boolean>('hover-change', (event) => {
      // 仅在非工作模式下响应
      if (!isWorking.value) {
        isHovered.value = event.payload;
        if (!event.payload) {
          hoveredBtnIndex.value = -1; // 移出窗口时重置按钮 hover 状态
        }
      }
    });
  }

  /**
   * 注册鼠标位置事件监听
   */
  async function registerMousePosListener(): Promise<void> {
    unlistenMousePos = await listen<{ x: number; y: number }>('mouse-pos', async (event) => {
      if (!isWorking.value && isHovered.value && ringMenuRef.value) {
        // Rust 发送的是物理坐标，需要转换为 CSS 像素
        const dpr = window.devicePixelRatio || 1;
        const logicalX = event.payload.x / dpr;
        const logicalY = event.payload.y / dpr;

        // 查找鼠标下的元素
        const el = document.elementFromPoint(logicalX, logicalY);
        if (el) {
          const btn = el.closest('.ring-btn');
          if (btn) {
            // 根据类名判断是哪个按钮
            if (btn.classList.contains('top')) hoveredBtnIndex.value = 0;
            else if (btn.classList.contains('right')) hoveredBtnIndex.value = 1;
            else if (btn.classList.contains('bottom')) hoveredBtnIndex.value = 2;
            else if (btn.classList.contains('left')) hoveredBtnIndex.value = 3;
            else hoveredBtnIndex.value = -1;
            return;
          }
        }
        hoveredBtnIndex.value = -1;
      }
    });
  }

  // ========== 窗口事件监听 ==========

  /**
   * 注册窗口移动事件监听
   */
  async function registerWindowMoveListener(): Promise<void> {
    if (!appWindow.value) return;
    unlistenMoved = await appWindow.value.listen('tauri://move', handleWindowMove);
  }

  /**
   * 注册窗口大小变化事件监听
   */
  async function registerWindowResizeListener(): Promise<void> {
    if (!appWindow.value) return;

    unlistenResize = await appWindow.value.listen('tauri://resize', async () => {
      if (isWorking.value && !transitioning.value && !exiting.value && appWindow.value) {
        // 使用防抖避免频繁调整
        if (resizeTimeoutRef.value) clearTimeout(resizeTimeoutRef.value);
        resizeTimeoutRef.value = setTimeout(async () => {
          if (!isWorking.value) return;
          try {
            const size = await appWindow.value?.innerSize();
            if (size) {
              const targetW =
                currentView.value === 'consultation'
                  ? WINDOW_SIZES.CONSULTATION.width
                  : WINDOW_SIZES.WORK.width;
              const targetH =
                currentView.value === 'consultation'
                  ? WINDOW_SIZES.CONSULTATION.height
                  : WINDOW_SIZES.WORK.height;
              const scale = (await appWindow.value?.scaleFactor()) || 1;
              const minW = targetW * scale * 0.8; // 允许 20% 的误差

              // 如果宽度明显小于目标宽度 (例如变为小球大小)，则强制恢复
              if (size.width < minW) {
                await appWindow.value?.setSize(new LogicalSize(targetW, targetH));
              }
            }
          } catch (e) {
            console.error('检查窗口大小失败:', e);
          }
        }, 200);
      }
    });
  }

  // ========== 统一注册/注销 ==========

  /**
   * 注册所有事件监听
   */
  async function registerAllListeners(): Promise<void> {
    try {
      // Deep Link 监听
      await registerDeepLinkListener();

      // 窗口事件监听
      await registerWindowMoveListener();
      await registerWindowResizeListener();

      // HIS 集成事件监听
      await registerPatientRisksListener();
      await registerStartConsultationListener();
      await registerStopConsultationListener();
      await registerVoiceConsultationListener();

      // 鼠标事件监听
      await registerHoverListener();
      await registerMousePosListener();

      console.log('[EventListeners] All event listeners registered');
    } catch (e) {
      console.error('监听事件失败:', e);
    }
  }

  /**
   * 注销所有事件监听
   */
  function unregisterAllListeners(): void {
    if (unlistenHover) unlistenHover();
    if (unlistenMousePos) unlistenMousePos();
    if (unlistenMoved) unlistenMoved();
    if (unlistenResize) unlistenResize();

    console.log('[EventListeners] All event listeners unregistered');
  }

  // ========== 导出 ==========

  return {
    registerAllListeners,
    unregisterAllListeners,
  };
}
