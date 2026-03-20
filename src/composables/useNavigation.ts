/**
 * 导航管理 Composable
 *
 * 统一管理应用的所有视图导航逻辑，包括：
 * - 基础导航（聊天、设置、分析等）
 * - 业务导航（问诊、语音、知识库等）
 * - 窗口尺寸自适应
 *
 * @module composables/useNavigation
 */

import { type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { WINDOW_SIZES, type ViewType } from '../constants/windowSizes';
import { trackViewChange } from '../services/operationTracker';
import type { AppPatient } from '../types/appState';

/**
 * 导航管理配置参数
 */
export interface NavigationOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** 当前视图 */
  currentView: Ref<ViewType>;
  /** 是否处于工作模式 */
  isWorking: Ref<boolean>;
  /** 当前患者信息 */
  currentPatient: Ref<AppPatient | null>;
  /** 窗口管理 API */
  windowMgmt: {
    smartExpand: (width: number, height: number) => Promise<void>;
  };
  /** 工作模式 API */
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
  };
}

/**
 * 导航管理 Composable
 *
 * @param options - 配置参数
 * @returns 导航管理 API
 *
 * @example
 * ```typescript
 * const navigation = useNavigation({
 *   appWindow,
 *   currentView,
 *   isWorking,
 *   currentPatient,
 *   windowMgmt,
 *   workMode,
 * });
 *
 * // 导航到设置页
 * await navigation.openSettings();
 *
 * // 导航到问诊页
 * await navigation.openConsultation();
 * ```
 */
export function useNavigation(options: NavigationOptions) {
  const {
    appWindow,
    currentView,
    isWorking,
    currentPatient,
    windowMgmt,
    workMode,
  } = options;

  const { smartExpand } = windowMgmt;
  const { enterWorkMode } = workMode;

  // ========== 基础导航 ==========

  /**
   * 打开设置页
   */
  async function openSettings(): Promise<void> {
    trackViewChange(currentView.value, 'settings');
    currentView.value = 'settings';
    if (!isWorking.value) {
      await enterWorkMode();
    }
  }

  /**
   * 打开聊天页
   */
  async function openChat(): Promise<void> {
    trackViewChange(currentView.value, 'chat');
    currentView.value = 'chat';
    if (!isWorking.value) {
      await enterWorkMode();
    }
  }

  /**
   * 打开分析页
   */
  async function openAnalytics(): Promise<void> {
    trackViewChange(currentView.value, 'analytics');
    currentView.value = 'analytics';
    if (!isWorking.value) {
      await enterWorkMode();
    }
  }

  // ========== 业务导航 ==========

  /**
   * 打开症状库管理页
   */
  async function openSymptomManagement(): Promise<void> {
    currentView.value = 'symptom-manage';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      // If already working, resize window if needed
      if (appWindow.value) {
        // 先调整位置再设置大小，避免窗口闪动到其他显示器
        await smartExpand(WINDOW_SIZES.SYMPTOM_MANAGE.width, WINDOW_SIZES.SYMPTOM_MANAGE.height);
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.SYMPTOM_MANAGE.width, WINDOW_SIZES.SYMPTOM_MANAGE.height)
        );
      }
    }
  }

  /**
   * 打开问诊页
   */
  async function openConsultation(): Promise<void> {
    trackViewChange(currentView.value, 'consultation', { hasPatient: !!currentPatient.value });
    currentView.value = 'consultation';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      // If already working, resize window if needed
      if (appWindow.value) {
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.CONSULTATION.width, WINDOW_SIZES.CONSULTATION.height)
        );
        await smartExpand(WINDOW_SIZES.CONSULTATION.width, WINDOW_SIZES.CONSULTATION.height);
      }
    }
  }

  /**
   * 打开接诊 session 小窗
   */
  async function openConsultationSession(): Promise<void> {
    trackViewChange(currentView.value, 'consultation-session', { hasPatient: !!currentPatient.value });
    currentView.value = 'consultation-session';
    if (!isWorking.value) {
      await enterWorkMode(WINDOW_SIZES.SESSION.width, WINDOW_SIZES.SESSION.height);
    } else if (appWindow.value) {
      await appWindow.value.setSize(
        new LogicalSize(WINDOW_SIZES.SESSION.width, WINDOW_SIZES.SESSION.height)
      );
      await smartExpand(WINDOW_SIZES.SESSION.width, WINDOW_SIZES.SESSION.height);
    }
  }

  /**
   * 打开知识库页
   */
  async function openKnowledgeBase(): Promise<void> {
    trackViewChange(currentView.value, 'knowledge-base', {});
    currentView.value = 'knowledge-base';
    if (!isWorking.value) {
      await enterWorkMode();
    }
  }

  /**
   * 开始语音交互
   */
  async function startVoiceInteraction(): Promise<void> {
    trackViewChange(currentView.value, 'voice-interaction', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'voice-interaction';
    if (!isWorking.value) {
      await enterWorkMode(WINDOW_SIZES.CAPSULE.width, WINDOW_SIZES.CAPSULE.height);
    } else {
      // If already working (e.g. from Chat), resize to capsule
      enterWorkMode(WINDOW_SIZES.CAPSULE.width, WINDOW_SIZES.CAPSULE.height);
    }
  }

  // ========== 导出 ==========

  return {
    // 基础导航
    openSettings,
    openChat,
    openAnalytics,

    // 业务导航
    openSymptomManagement,
    openConsultationSession,
    openConsultation,
    openKnowledgeBase,
    startVoiceInteraction,
  };
}
