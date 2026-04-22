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

import { type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { WINDOW_SIZES, supportsPersistentWindowSize, type ViewType } from '../constants/windowSizes';
import { analyzePatientRisks } from '../services/llm';
import { trackApiCall, trackError, startTimedOperation } from '../services/operationTracker';
import type { RiskItem } from '../components/RiskAlertPanel.vue';
import type { AppPatient } from '../types/appState';
import type { ConsultationAssistAction } from '../types/consultationAssist';
import { getHisService, resetHisService } from '../services/hisService';
import { medicalDataService } from '../services/medicalData';

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
  currentPatient: Ref<AppPatient | null>;
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
  /** 窗口大小持久化函数 */
  persistCurrentWindowSize: (view: ViewType) => Promise<void>;
  /** 工作模式相关函数 */
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
    exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>;
  };
  /** 导航函数 */
  navigation: {
    openConsultation: () => Promise<void>;
    openVoiceConsultation: () => Promise<void>;
    startVoiceInteraction: () => Promise<void>;
  };
  /** 重置语音会话状态 */
  resetVoiceSessionState: () => void;
  /** 队列化快进模式自动触发请求 */
  queueConsultationAssistTrigger: (kind: ConsultationAssistAction) => void;
  /** 退出标志（来自 workMode） */
  exiting: Ref<boolean>;
  /** 窗口大小变化防抖超时 */
  resizeTimeoutRef: Ref<ReturnType<typeof setTimeout> | null>;
}

interface PatientRisksPayload {
  idPi?: string;
  naPi?: string;
  sdSexText?: string;
  ageText?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  diagnosis?: string;
  allergyHistory?: string;
  risks?: RiskItem[];
  [key: string]: unknown;
}

interface StartConsultationPayload {
  idPi?: string;
  patientId?: string;
  naPi?: string;
  name?: string;
  ageText?: string;
  sdSexText?: string;
  [key: string]: unknown;
}

interface SessionAssistPayload extends StartConsultationPayload {
  action?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  diagnosis?: string;
  vitals?: string;
  allergyHistory?: string;
}

interface SdkHandshakePayload {
  origin: string;
  href: string;
  extra?: {
    emrAccessToken?: string;
    urt?: unknown;
    [key: string]: any;
  };
  [key: string]: any;
}

const HANDSHAKE_ORG_CODE_FIELDS = [
  'orgCode',
  'cdOrg',
  'institutionCode',
  'institutionId',
  'hospitalCode',
  'hospitalId',
  'tenantId',
  'organizationCode',
  'medicalInstitutionCode'
] as const;

function readHandshakeStringField(
  payload: Record<string, unknown> | undefined,
  field: string
): string | null {
  if (!payload) {
    return null;
  }

  const value = payload[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveUrtPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }

  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function resolveHandshakeOrgCode(ctx: SdkHandshakePayload): string | null {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const nestedSources: Array<Record<string, unknown> | undefined> = [
    urt,
    ctx as Record<string, unknown>,
    extra,
    (extra?.org && typeof extra.org === 'object') ? extra.org as Record<string, unknown> : undefined,
    (extra?.institution && typeof extra.institution === 'object') ? extra.institution as Record<string, unknown> : undefined,
    (extra?.hospital && typeof extra.hospital === 'object') ? extra.hospital as Record<string, unknown> : undefined,
    (extra?.tenant && typeof extra.tenant === 'object') ? extra.tenant as Record<string, unknown> : undefined,
  ];

  const orgId = readHandshakeStringField(urt, 'orgId');
  if (orgId) {
    return orgId;
  }

  for (const source of nestedSources) {
    for (const field of HANDSHAKE_ORG_CODE_FIELDS) {
      const value = readHandshakeStringField(source, field);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function mergePatientContext(
  currentPatient: AppPatient | null,
  payload: StartConsultationPayload | SessionAssistPayload | null | undefined
): AppPatient | null {
  if (!payload) {
    return currentPatient;
  }

  return {
    ...(currentPatient || {}),
    ...payload,
    naPi: payload.naPi || payload.name || currentPatient?.patientName || currentPatient?.naPi || '未知',
    idPi: payload.idPi || payload.patientId || currentPatient?.patientId || currentPatient?.idPi,
    ageText: (() => {
      if (payload.ageText) return payload.ageText;
      const rawAge = currentPatient?.age;
      if (typeof rawAge === 'number') return `${rawAge}岁`;
      if (typeof rawAge === 'string' && rawAge.trim() !== '') return rawAge;
      return '';
    })(),
    sdSexText: payload.sdSexText || (currentPatient?.gender === 'M' ? '男性' : '女性'),
  };
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
    persistCurrentWindowSize,
    workMode,
    navigation,
    resetVoiceSessionState,
    queueConsultationAssistTrigger,
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

  let unlistenDeepLink: UnlistenFn | null = null;
  let unlistenPatientRisks: UnlistenFn | null = null;
  let unlistenStartConsultation: UnlistenFn | null = null;
  let unlistenConsultationAssist: UnlistenFn | null = null;
  let unlistenStopConsultation: UnlistenFn | null = null;
  let unlistenStartVoiceConsultation: UnlistenFn | null = null;
  let unlistenHover: UnlistenFn | null = null;
  let unlistenMousePos: UnlistenFn | null = null;
  let unlistenMoved: UnlistenFn | null = null;
  let unlistenResize: UnlistenFn | null = null;
  let unlistenSdkHandshake: UnlistenFn | null = null;

  // ========== Deep Link 监听 ==========

  /**
   * 注册 Deep Link 监听
   */
  async function registerDeepLinkListener(): Promise<void> {
    try {
      unlistenDeepLink = await onOpenUrl((urls) => {
        console.log('Deep link received:', urls);
        if (urls && urls.length > 0) {
          const url = urls[0];
          trackApiCall('deep_link_received', true, undefined, { url });
          showToast(`收到外部调用: ${url}`, 'info');

          // Simple routing based on URL
          if (url.includes('voice-consultation')) {
            resetVoiceSessionState();
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

  // ========== SDK 握手监听 ==========

  /**
   * 注册 SDK 握手完成监听
   * 用于初始化 HIS 服务工具类
   */
  async function registerHandshakeListener(): Promise<void> {
    unlistenSdkHandshake = await listen<SdkHandshakePayload>('sdk-handshake', async (event) => {
      const ctx = event.payload;
      console.log('[EventListeners] SDK Handshake received:', ctx);

      const baseUrl = ctx.origin;
      const token = ctx.extra?.emrAccessToken;
      const orgCode = resolveHandshakeOrgCode(ctx);

      if (baseUrl && token) {
        // 初始化 HIS 服务单例
        getHisService(baseUrl, { token });
        console.log('[EventListeners] HisService initialized with origin:', baseUrl, {
          hasToken: Boolean(token),
          orgCode,
        });
      } else {
        resetHisService();
        console.warn('[EventListeners] Handshake missing baseUrl or tk token, medical catalog sync skipped', {
          hasBaseUrl: Boolean(baseUrl),
          hasToken: Boolean(token),
          orgCode,
        });
      }

      await medicalDataService.setCatalogContext({ orgCode });
    });
  }

  // ========== HIS 集成事件监听 ==========

  /**
   * 注册患者风险提示事件监听
   */
  async function registerPatientRisksListener(): Promise<void> {
    unlistenPatientRisks = await listen<PatientRisksPayload>('show-patient-risks', async (event) => {
      console.log('Received patient risks request:', event.payload);
      const data = event.payload;
      trackApiCall('his_patient_risks', true, undefined, {
        patientName: data.naPi,
        riskCount: data.risks?.length,
      });

      // Update basic info immediately
      riskPatientName.value = data.naPi || '未知患者';
      riskPatientGender.value = data.sdSexText?.includes('女') ? 'F' : 'M';
      riskPatientAge.value = parseInt(data.ageText || '') || 0;
      riskItems.value = [];
      isRiskAnalyzing.value = true;

      // GLOBAL STATE: Set current patient context
      currentPatient.value = {
        ...data,
        idPi: data.idPi,
        name: data.naPi,
        naPi: data.naPi,
        sdSexText: data.sdSexText,
        ageText: data.ageText,
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
    unlistenStartConsultation = await listen<StartConsultationPayload>('start-consultation', async (event) => {
      console.log('Received consultation request:', event.payload);
      const payload = event.payload || {};
      trackApiCall('his_start_consultation', true, undefined, {
        patientId: payload.idPi || payload.patientId,
      });

      // Update/Merge Global Patient Context
      // This ensures we have the correct keys (naPi, sdSexText) for ConsultationPage
      currentPatient.value = {
        ...(mergePatientContext(currentPatient.value, payload) || {}),
      };

      await navigation.openConsultation();
    });
  }

  function normalizeSessionTriggerKind(action?: string): ConsultationAssistAction | null {
    switch (action) {
      case 'record':
      case 'diagnosis':
      case 'differential':
      case 'medication':
      case 'examination':
      case 'reminder':
        return action;
      default:
        return null;
    }
  }

  async function registerConsultationAssistListener(): Promise<void> {
    unlistenConsultationAssist = await listen<SessionAssistPayload>(
      'start-consultation-session',
      async (event) => {
        console.log('Received consultation session request:', event.payload);
        const payload = event.payload || {};
        trackApiCall('his_start_consultation_session', true, undefined, {
          patientId: payload.idPi || payload.patientId,
          action: payload.action,
        });

        currentPatient.value = {
          ...(mergePatientContext(currentPatient.value, payload) || {}),
        };

        const triggerKind = normalizeSessionTriggerKind(payload.action);
        if (triggerKind) {
          queueConsultationAssistTrigger(triggerKind);
        }

        await navigation.openConsultation();
      }
    );
  }

  /**
   * 注册停止问诊事件监听
   */
  async function registerStopConsultationListener(): Promise<void> {
    unlistenStopConsultation = await listen('stop-consultation', async () => {
      console.log('Received stop consultation request');
      resetVoiceSessionState();
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
    unlistenStartVoiceConsultation = await listen<SessionAssistPayload | null>('start-voice-consultation', async (event) => {
      console.log('Received start voice consultation command');
      trackApiCall('his_start_voice', true);
      resetVoiceSessionState();
      currentPatient.value = mergePatientContext(currentPatient.value, event.payload);
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
        if (resizeTimeoutRef.value) clearTimeout(resizeTimeoutRef.value);
        resizeTimeoutRef.value = setTimeout(async () => {
          if (!isWorking.value) return;
          if (!supportsPersistentWindowSize(currentView.value)) {
            return;
          }

          await persistCurrentWindowSize(currentView.value);
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
      // 防御式清理：避免重复注册导致事件重复处理
      unregisterAllListeners();

      // Deep Link 监听
      await registerDeepLinkListener();

      // 窗口事件监听
      await registerWindowMoveListener();
      await registerWindowResizeListener();

      // HIS 集成事件监听
      await registerPatientRisksListener();
      await registerStartConsultationListener();
      await registerConsultationAssistListener();
      await registerStopConsultationListener();
      await registerVoiceConsultationListener();

      // SDK 握手监听
      await registerHandshakeListener();

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
    if (unlistenDeepLink) {
      unlistenDeepLink();
      unlistenDeepLink = null;
    }
    if (unlistenPatientRisks) {
      unlistenPatientRisks();
      unlistenPatientRisks = null;
    }
    if (unlistenStartConsultation) {
      unlistenStartConsultation();
      unlistenStartConsultation = null;
    }
    if (unlistenConsultationAssist) {
      unlistenConsultationAssist();
      unlistenConsultationAssist = null;
    }
    if (unlistenStopConsultation) {
      unlistenStopConsultation();
      unlistenStopConsultation = null;
    }
    if (unlistenStartVoiceConsultation) {
      unlistenStartVoiceConsultation();
      unlistenStartVoiceConsultation = null;
    }
    if (unlistenHover) {
      unlistenHover();
      unlistenHover = null;
    }
    if (unlistenMousePos) {
      unlistenMousePos();
      unlistenMousePos = null;
    }
    if (unlistenMoved) {
      unlistenMoved();
      unlistenMoved = null;
    }
    if (unlistenResize) {
      unlistenResize();
      unlistenResize = null;
    }
    if (unlistenSdkHandshake) {
      unlistenSdkHandshake();
      unlistenSdkHandshake = null;
    }
    if (resizeTimeoutRef.value) {
      clearTimeout(resizeTimeoutRef.value);
      resizeTimeoutRef.value = null;
    }

    console.log('[EventListeners] All event listeners unregistered');
  }

  // ========== 导出 ==========

  return {
    registerAllListeners,
    unregisterAllListeners,
  };
}
