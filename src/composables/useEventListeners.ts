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
import { getWindowSizeForView, supportsPersistentWindowSize, type ViewType } from '../constants/windowSizes';
import { analyzePatientRisks } from '../services/llm';
import { trackApiCall, trackError } from '../services/operationTracker';
import type { RiskItem } from '../components/RiskAlertPanel.vue';
import type { AppPatient } from '../types/appState';
import type { ConsultationAssistAction } from '../types/consultationAssist';
import { getHisService, resetHisService, getHisAdapter, resetHisAdapter } from '../services/his';
import type { HisPatientHistory, HisVisitRecord } from '../services/his/types';
import { medicalDataService } from '../services/medicalData';
import { resolveFeedbackActorFromUrt, setFeedbackActor } from '../services/feedbackContext';
import { syncPatientMemoryFromHis } from '../services/patientMemoryStore';
import {
  buildPatientContext,
  getPatientContextAgeText,
  getPatientContextGenderCode,
  getPatientContextGenderText,
  getPatientContextHistory,
  getPatientContextId,
  getPatientContextName,
} from '../utils/patientContext';

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
    startVoiceInteraction: (options?: { skipCacheRestore?: boolean }) => Promise<void>;
  };
  /** 重置语音会话状态 */
  resetVoiceSessionState: () => void;
  /** 检查指定患者是否存在未提交语音缓存 */
  hasCachedVoiceResult: (patient?: AppPatient | null) => boolean;
  /** 队列化快进模式自动触发请求 */
  queueConsultationAssistTrigger: (kind: ConsultationAssistAction) => void;
  /** 退出标志（来自 workMode） */
  exiting: Ref<boolean>;
  /** 窗口大小变化防抖超时 */
  resizeTimeoutRef: Ref<ReturnType<typeof setTimeout> | null>;
}

interface PatientRisksPayload {
  idPi?: string;
  idVis?: string;
  patientId?: string;
  visitId?: string;
  naPi?: string;
  name?: string;
  sdSexText?: string;
  gender?: string;
  ageText?: string;
  age?: string;
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
  idVis?: string;
  patientId?: string;
  visitId?: string;
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
  'organizationCode',
  'medicalInstitutionCode'
] as const;

const HANDSHAKE_TENANT_ID_FIELDS = [
  'idTet',
  'tenantId',
  'tenantCode',
  'tetId'
] as const;

function readHandshakeStringField(
  payload: Record<string, unknown> | undefined,
  field: string
): string | null {
  if (!payload) {
    return null;
  }

  const value = payload[field];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
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

function resolveHandshakeTenantId(ctx: SdkHandshakePayload): string | null {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const nestedSources: Array<Record<string, unknown> | undefined> = [
    urt,
    ctx as Record<string, unknown>,
    extra,
    (extra?.tenant && typeof extra.tenant === 'object') ? extra.tenant as Record<string, unknown> : undefined,
    (extra?.org && typeof extra.org === 'object') ? extra.org as Record<string, unknown> : undefined,
  ];

  for (const source of nestedSources) {
    for (const field of HANDSHAKE_TENANT_ID_FIELDS) {
      const value = readHandshakeStringField(source, field);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function resolveHandshakeUserRoleDeptIds(ctx: SdkHandshakePayload): string[] {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const rawUserRoleDepts = urt?.userRoleDepts;

  const parsedUserRoleDepts = (() => {
    if (typeof rawUserRoleDepts === 'string') {
      try {
        return JSON.parse(rawUserRoleDepts);
      } catch {
        return undefined;
      }
    }

    return rawUserRoleDepts;
  })();

  const collectDeptIds = (value: unknown): string[] => {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return value.trim() ? [value.trim()] : [];
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return [String(value)];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => collectDeptIds(item));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const directDeptId = record.deptId;
      if (typeof directDeptId === 'string' && directDeptId.trim()) {
        return [directDeptId.trim()];
      }
      if (typeof directDeptId === 'number' && Number.isFinite(directDeptId)) {
        return [String(directDeptId)];
      }

      return Object.values(record).flatMap((item) => collectDeptIds(item));
    }

    return [];
  };

  return Array.from(new Set(
    collectDeptIds(parsedUserRoleDepts)
      .filter(Boolean)
  ));
}

function mergePatientContext(
  currentPatient: AppPatient | null,
  payload: StartConsultationPayload | SessionAssistPayload | null | undefined
): AppPatient | null {
  return buildPatientContext({
    existing: currentPatient,
    payload: payload as Record<string, unknown> | null | undefined,
    source: currentPatient?.source || 'event-payload',
    receptionEnsured: currentPatient?.receptionEnsured ?? currentPatient?._receptionEnsured,
  });
}

function readPatientFieldText(
  source: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

function uniqHistoryTexts(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  ));
}

function isAutoGeneratedPastHistoryPlaceholder(value: string): boolean {
  const normalized = value.replace(/\s+/g, '');
  return normalized === '未提供既往病史。'
    || normalized === '未提供既往史。'
    || normalized === '未见明确既往史记录。';
}

function formatVisitDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildVisitHistorySummary(visits?: HisVisitRecord[]): string {
  const visitSummaries = (visits || [])
    .slice()
    .sort((left, right) => right.visitTime - left.visitTime)
    .slice(0, 3)
    .map((visit) => {
      const chiefComplaint = typeof visit.chiefComplaint === 'string' ? visit.chiefComplaint.trim() : '';
      const diagnoses = uniqHistoryTexts(visit.diagnoses || []).slice(0, 3).join('、');
      const dateText = formatVisitDate(visit.visitTime);

      if (!chiefComplaint && !diagnoses) {
        return '';
      }

      if (chiefComplaint && diagnoses) {
        return `${dateText ? `${dateText} ` : ''}因${chiefComplaint}就诊，诊断${diagnoses}`;
      }

      if (diagnoses) {
        return `${dateText ? `${dateText} ` : ''}诊断${diagnoses}`;
      }

      return `${dateText ? `${dateText} ` : ''}因${chiefComplaint}就诊`;
    })
    .filter(Boolean);

  return visitSummaries.length > 0 ? `既往门诊记录：${visitSummaries.join('；')}` : '';
}

function buildPastMedicalHistorySummary(
  patient: AppPatient | null,
  hisHistory: HisPatientHistory | null
): string {
  const directHistory = readPatientFieldText(patient as Record<string, unknown>, [
    'pastMedicalHistory',
    'past_medical_history',
    'pastMedicalHistoryText',
  ]);
  if (directHistory && !isAutoGeneratedPastHistoryPlaceholder(directHistory)) {
    return directHistory;
  }

  const structuredHistory = uniqHistoryTexts(hisHistory?.pastMedicalHistory || []);
  const visitSummary = buildVisitHistorySummary(hisHistory?.visits);
  if (structuredHistory.length > 0) {
    return [structuredHistory.join('；'), visitSummary].filter(Boolean).join('；');
  }
  if (visitSummary) {
    return visitSummary;
  }

  const patientBase = [
    readPatientFieldText(patient as Record<string, unknown>, ['sdSexText']),
    readPatientFieldText(patient as Record<string, unknown>, ['ageText', 'age']),
  ].filter(Boolean).join('，');

  return patientBase ? `${patientBase}，未见明确既往史记录。` : '';
}

function buildAllergyHistorySummary(
  patient: AppPatient | null,
  hisHistory: HisPatientHistory | null
): string {
  const directHistory = readPatientFieldText(patient as Record<string, unknown>, [
    'allergyHistory',
    'allergy_history',
    'allergyHistoryText',
  ]);
  if (directHistory) {
    return directHistory;
  }

  return uniqHistoryTexts(hisHistory?.allergyHistory || []).join('；');
}

function applyClinicalHistorySummaries(
  patient: AppPatient | null,
  hisHistory: HisPatientHistory | null,
): AppPatient | null {
  if (!patient) {
    return patient;
  }

  const pastMedicalHistory = buildPastMedicalHistorySummary(patient, hisHistory);
  const allergyHistory = buildAllergyHistorySummary(patient, hisHistory);

  return {
    ...patient,
    clinical: {
      ...patient.clinical,
      pastMedicalHistory: pastMedicalHistory || undefined,
      allergyHistory: allergyHistory || undefined,
      hisHistory,
    },
    hisHistory,
    patientHistory: hisHistory,
    pastMedicalHistory: pastMedicalHistory || undefined,
    allergyHistory: allergyHistory || undefined,
  };
}

function syncRiskStateFromPatient(patient: AppPatient | null): {
  patientName: string;
  patientGender: 'M' | 'F';
  patientAge: number;
} {
  const patientName = getPatientContextName(patient) || '未知患者';
  const genderCode = getPatientContextGenderCode(patient);
  const genderText = getPatientContextGenderText(patient);
  const patientGender: 'M' | 'F' = genderCode === 'F' || genderText.includes('女') ? 'F' : 'M';
  const ageSource = getPatientContextAgeText(patient);
  const patientAge = Number.parseInt(ageSource, 10) || 0;

  return { patientName, patientGender, patientAge };
}

function buildIncomingPatientDraft(
  payload: Record<string, unknown> | null | undefined,
): AppPatient | null {
  return buildPatientContext({ payload });
}

async function hydratePatientContextFromHis(
  currentPatient: AppPatient | null,
  payload: StartConsultationPayload | SessionAssistPayload | PatientRisksPayload | null | undefined,
  source: string,
): Promise<AppPatient | null> {
  const nextDraft = buildPatientContext({
    existing: currentPatient,
    payload: payload as Record<string, unknown> | null | undefined,
    source,
    receptionEnsured: true,
  });
  const patientId = getPatientContextId(nextDraft);
  if (!patientId) {
    return nextDraft;
  }

  const existingHistory = getPatientContextHistory(nextDraft);
  const samePatientLoaded = currentPatient
    && getPatientContextId(currentPatient) === patientId
    && (currentPatient.receptionEnsured || currentPatient._receptionEnsured)
    && existingHistory;
  if (samePatientLoaded) {
    return nextDraft;
  }

  const adapter = getHisAdapter();
  if (!adapter) {
    return nextDraft;
  }

  const hisInfo = await adapter.fetchPatientInfo(patientId);
  const hisHistory = await adapter.fetchPatientHistory(patientId);
  let hydrated = buildPatientContext({
    existing: nextDraft,
    payload: payload as Record<string, unknown> | null | undefined,
    hisInfo,
    hisHistory,
    source,
    receptionEnsured: true,
  });

  hydrated = applyClinicalHistorySummaries(hydrated, hisHistory);

  if (hisHistory) {
    await syncPatientMemoryFromHis(patientId, hisHistory);
  }

  return hydrated;
}

// ensureReceptionContext removed, replaced by async ensureAndPrepareReceptionContext inside useEventListeners

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
    hasCachedVoiceResult,
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
  let unlistenReceivePatient: UnlistenFn | null = null;

  // ========== 状态 & Promise ==========
  let activeReceptionPromise: Promise<boolean> | null = null;
  let activeReceptionPatientId: string | null = null;

  async function executeReceptionFlow(payload: StartConsultationPayload, quietMode = false): Promise<boolean> {
    const patientId = getPatientContextId(buildIncomingPatientDraft(payload as Record<string, unknown> | null | undefined));
    if (!patientId) {
      showToast('接诊失败：未提供患者ID', 'error');
      return false;
    }

    if (activeReceptionPromise) {
      if (activeReceptionPatientId === patientId) {
        console.log('[EventListeners] Waiting for existing reception flow for patient:', patientId);
        return activeReceptionPromise;
      } else {
        showToast('系统正在接诊其他患者，请稍候再试', 'error');
        return false;
      }
    }

    activeReceptionPatientId = patientId;

    activeReceptionPromise = (async () => {
      trackApiCall('his_receive_patient', true, undefined, { patientId, auto: quietMode });
      try {
        const nextPatient = await hydratePatientContextFromHis(currentPatient.value, payload, quietMode ? 'reception-auto' : 'receive-patient');
        if (!nextPatient) {
          showToast('接诊失败：患者上下文初始化失败', 'error');
          return false;
        }
        currentPatient.value = nextPatient;

        if (!quietMode) {
          // 2. 切换 UI 为胶囊态
          currentView.value = 'reception-capsule';
          const receptionSize = getWindowSizeForView('reception-capsule');
          if (!isWorking.value) {
            await workMode.enterWorkMode(receptionSize.width, receptionSize.height);
          } else {
            workMode.enterWorkMode(receptionSize.width, receptionSize.height);
          }
        } else {
          // 如果是自动静默触发，且不在工作模式，需先进入工作模式，但不要强切视图
          // 风险评估需要显示，所以暂时强切到 reception-capsule
          currentView.value = 'reception-capsule';
          const receptionSize = getWindowSizeForView('reception-capsule');
          if (!isWorking.value) {
            await workMode.enterWorkMode(receptionSize.width, receptionSize.height);
          } else {
            workMode.enterWorkMode(receptionSize.width, receptionSize.height);
          }
        }

        // 重置并显示加载状态
        const riskStateSnapshot = syncRiskStateFromPatient(currentPatient.value);
        riskPatientName.value = riskStateSnapshot.patientName;
        riskPatientGender.value = riskStateSnapshot.patientGender;
        riskPatientAge.value = riskStateSnapshot.patientAge;
        riskItems.value = [];
        isRiskAnalyzing.value = true;

        try {
          // 3. 触发风险评估
          const risks = await analyzePatientRisks(currentPatient.value);
          console.log('LLM Risk Analysis Result after reception:', risks);
          riskItems.value = risks || [];
        } finally {
          isRiskAnalyzing.value = false;
        }

        return true;
      } catch (e) {
        console.error('Patient reception failed:', e);
        trackError('receive_patient_failed', e);
        showToast('接诊处理异常', 'error');
        return false;
      }
    })();

    try {
      return await activeReceptionPromise;
    } finally {
      activeReceptionPromise = null;
      activeReceptionPatientId = null;
    }
  }

  async function ensureAndPrepareReceptionContext(
    current: AppPatient | null,
    payload: StartConsultationPayload | SessionAssistPayload | null | undefined
  ): Promise<boolean> {
    const incomingId = getPatientContextId(buildIncomingPatientDraft(payload as Record<string, unknown> | null | undefined));
    const currentId = getPatientContextId(current);
    const currentReceptionEnsured = Boolean(current?.receptionEnsured || current?._receptionEnsured);

    if (current && currentId && currentReceptionEnsured) {
      if (incomingId && incomingId !== currentId) {
        showToast('当前已接诊其他患者，请先结束当前就诊', 'error');
        return false;
      }
      return true;
    }

    if (!incomingId) {
      showToast('请先接诊患者', 'error');
      return false;
    }

    console.log('[EventListeners] Auto-triggering patient reception from context check');
    return await executeReceptionFlow(payload as StartConsultationPayload, true);
  }

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
      const tenantId = resolveHandshakeTenantId(ctx);
      const userRoleDeptIds = resolveHandshakeUserRoleDeptIds(ctx);

      // 缓存反馈 actor（医生/机构/科室），供 userFeedback / voiceFeedback 提交时使用
      const urtForActor = resolveUrtPayload(ctx.extra?.urt);
      setFeedbackActor(resolveFeedbackActorFromUrt(urtForActor, orgCode));

      if (baseUrl && token) {
        // 初始化 HIS 服务单例
        getHisService(baseUrl, { token, userRoleDeptIds });
        // adapter 是基于 HisService 的 wrapper，token 变化后必须清缓存
        resetHisAdapter();
        console.log('[EventListeners] HisService initialized with origin:', baseUrl, {
          hasToken: Boolean(token),
          orgCode,
          tenantId,
          userRoleDeptIds,
        });
      } else {
        resetHisService();
        resetHisAdapter();
        console.warn('[EventListeners] Handshake missing baseUrl or tk token, medical catalog sync skipped', {
          hasBaseUrl: Boolean(baseUrl),
          hasToken: Boolean(token),
          orgCode,
          tenantId,
          userRoleDeptIds,
        });
      }

      if (!orgCode) {
        console.warn('[EventListeners] Handshake did not resolve orgCode, org-scoped medical catalogs will be skipped');
      }

      await medicalDataService.setCatalogContext({ orgCode, tenantId });
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
      const incomingPatient = buildIncomingPatientDraft(data as Record<string, unknown> | null | undefined);
      trackApiCall('his_patient_risks', true, undefined, {
        patientId: getPatientContextId(incomingPatient) || undefined,
        patientName: getPatientContextName(incomingPatient) || undefined,
        riskCount: data.risks?.length,
      });

      currentPatient.value = await hydratePatientContextFromHis(currentPatient.value, data, 'show-patient-risks');
      const riskStateSnapshot = syncRiskStateFromPatient(currentPatient.value);
      riskPatientName.value = riskStateSnapshot.patientName;
      riskPatientGender.value = riskStateSnapshot.patientGender;
      riskPatientAge.value = riskStateSnapshot.patientAge;
      riskItems.value = [];
      isRiskAnalyzing.value = true;

      // Switch to Reception Capsule View
      currentView.value = 'reception-capsule';
      const receptionSize = getWindowSizeForView('reception-capsule', {
        expanded: !!data.risks?.length,
        riskCount: data.risks?.length ?? 0,
      });
      if (!isWorking.value) {
        await workMode.enterWorkMode(receptionSize.width, receptionSize.height);
      } else {
        // Resize if already open
        workMode.enterWorkMode(receptionSize.width, receptionSize.height);
      }

      // If backend provided pre-calculated risks, use them immediately
      if (data.risks && data.risks.length > 0) {
        riskItems.value = data.risks;
        isRiskAnalyzing.value = false;
        return;
      }

      // Otherwise, trigger LLM analysis
      try {
        const risks = await analyzePatientRisks(currentPatient.value);
        console.log('LLM Risk Analysis Result:', risks);
        riskItems.value = risks || [];
      } catch (e) {
        console.error('Risk analysis error:', e);
        trackError('risk_analysis_failed', e);
        showToast('风险评估失败', 'error');
      } finally {
        isRiskAnalyzing.value = false;

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
      const incomingPatient = buildIncomingPatientDraft(payload as Record<string, unknown> | null | undefined);
      trackApiCall('his_start_consultation', true, undefined, {
        patientId: getPatientContextId(incomingPatient) || undefined,
      });

      // 入口拦截：必须先走过接诊流程，如果未接诊且带有 patientId，会自动补齐接诊流程
      const success = await ensureAndPrepareReceptionContext(currentPatient.value, payload);
      if (!success) {
        return;
      }

      // Update/Merge Global Patient Context
      // This ensures we have the correct keys (naPi, sdSexText) for ConsultationPage
      currentPatient.value = mergePatientContext(currentPatient.value, payload);

      await navigation.openConsultation();
    });
  }

  /**
   * 注册接诊患者事件监听
   */
  async function registerReceivePatientListener(): Promise<void> {
    unlistenReceivePatient = await listen<StartConsultationPayload>('receive-patient', async (event) => {
      console.log('Received patient reception request:', event.payload);
      const payload = event.payload || {};
      await executeReceptionFlow(payload, false);
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
        const incomingPatient = buildIncomingPatientDraft(payload as Record<string, unknown> | null | undefined);
        trackApiCall('his_start_consultation_session', true, undefined, {
          patientId: getPatientContextId(incomingPatient) || undefined,
          action: payload.action,
        });

        const success = await ensureAndPrepareReceptionContext(currentPatient.value, payload);
        if (!success) {
          return;
        }

        currentPatient.value = mergePatientContext(currentPatient.value, payload);

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
      // 清理患者上下文，保证"结束就诊后必须重新接诊"的机制生效：
      // 如果不清，后续不带 payload 的 startVoice / startConsultation 会
      // 被 mergePatientContext 用残留的 patient 填充，绕过几个入口的
      // "请先接诊患者" guard。
      currentPatient.value = null;
      // Force exit work mode regardless of current view
      if (isWorking.value) {
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
      const incomingPatient = buildIncomingPatientDraft(event.payload as Record<string, unknown> | null | undefined);
      trackApiCall('his_start_voice', true, undefined, {
        patientId: getPatientContextId(incomingPatient) || undefined,
      });

      const success = await ensureAndPrepareReceptionContext(currentPatient.value, event.payload);
      if (!success) {
        return;
      }

      // 走到这里说明接诊上下文已存在且身份一致，payload 可能带额外字段需要合并
      currentPatient.value = mergePatientContext(currentPatient.value, event.payload);

      if (isWorking.value && currentView.value === 'voice-interaction') {
        console.info('[EventListeners] Duplicate start voice request ignored while voice interaction is already active');
        return;
      }

      const shouldRestoreCache = hasCachedVoiceResult(currentPatient.value);
      resetVoiceSessionState();
      await navigation.startVoiceInteraction({ skipCacheRestore: !shouldRestoreCache });
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
      await registerReceivePatientListener();

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
    if (unlistenReceivePatient) {
      unlistenReceivePatient();
      unlistenReceivePatient = null;
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
