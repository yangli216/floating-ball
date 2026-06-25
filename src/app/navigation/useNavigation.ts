/**
 * 导航管理 Composable
 *
 * 统一管理应用的所有视图导航逻辑，包括：
 * - 基础导航（聊天、设置、分析等）
 * - 业务导航（问诊、语音、知识库等）
 * - 窗口尺寸自适应
 *
 * @module app/navigation/useNavigation
 */

import { type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { getWindowSizeForView, type ViewType } from '@/constants/windowSizes';
import { trackViewChange } from '@/services/operationTracker';
import type { AppPatient } from '@/types/appState';

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
    resizeWindowForView: (view: ViewType) => Promise<void>;
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
    currentView,
    isWorking,
    currentPatient,
    windowMgmt,
    workMode,
  } = options;

  const { resizeWindowForView } = windowMgmt;
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
    } else {
      await resizeWindowForView('settings');
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
    } else {
      await resizeWindowForView('chat');
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
    } else {
      await resizeWindowForView('analytics');
    }
  }

  // ========== 业务导航 ==========

  /**
   * 打开 HIS 联调日志页
   */
  async function openHisIntegrationLog(): Promise<void> {
    trackViewChange(currentView.value, 'his-log');
    currentView.value = 'his-log';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('his-log');
    }
  }


  /**
   * 打开基础数据缓存管理页
   */
  async function openMedicalCatalogCache(): Promise<void> {
    trackViewChange(currentView.value, 'medical-cache');
    currentView.value = 'medical-cache';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('medical-cache');
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
      await resizeWindowForView('consultation');
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
    } else {
      await resizeWindowForView('knowledge-base');
    }
  }

  /**
   * 打开语音问诊页
   */
  async function openVoiceConsultation(): Promise<void> {
    trackViewChange(currentView.value, 'voice-consultation', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'voice-consultation';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('voice-consultation');
    }
  }

  /**
   * 打开独立诊疗方案推荐页
   */
  async function openTreatmentPlan(): Promise<void> {
    trackViewChange(currentView.value, 'treatment-plan', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'treatment-plan';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('treatment-plan');
    }
  }

  async function openOutpatientFollowUp(): Promise<void> {
    trackViewChange(currentView.value, 'outpatient-follow-up', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'outpatient-follow-up';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('outpatient-follow-up');
    }
  }

  /**
   * 打开住院病历辅助生成页
   */
  async function openInpatientEmr(): Promise<void> {
    trackViewChange(currentView.value, 'inpatient-emr', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'inpatient-emr';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('inpatient-emr');
    }
  }

  async function openDifferentialDiagnosis(): Promise<void> {
    trackViewChange(currentView.value, 'differential-diagnosis', {
      patientId: currentPatient.value?.patientId,
    });
    currentView.value = 'differential-diagnosis';
    if (!isWorking.value) {
      await enterWorkMode();
    } else {
      await resizeWindowForView('differential-diagnosis');
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
    const targetSize = getWindowSizeForView('voice-interaction');
    if (!isWorking.value) {
      await enterWorkMode(targetSize.width, targetSize.height);
    } else {
      // If already working (e.g. from Chat), resize to capsule
      enterWorkMode(targetSize.width, targetSize.height);
    }
  }

  // ========== 导出 ==========

  return {
    // 基础导航
    openSettings,
    openChat,
    openAnalytics,

    // 业务导航
    openHisIntegrationLog,
    openMedicalCatalogCache,
    openConsultation,
    openVoiceConsultation,
    openTreatmentPlan,
    openOutpatientFollowUp,
    openInpatientEmr,
    openDifferentialDiagnosis,
    openKnowledgeBase,
    startVoiceInteraction,
  };
}
