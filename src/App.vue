<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, shallowRef, watch } from "vue";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import { exit } from '@tauri-apps/plugin-process';
import { load, Store } from '@tauri-apps/plugin-store';
import ChatPanel from "./components/ChatPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import AnalyticsPanel from "./components/AnalyticsPanel.vue";
import ConsultationPage from "./components/ConsultationPage.vue";
import DiagnosisPathWindow from "./components/DiagnosisPathWindow.vue";
import Toast from "./components/Toast.vue";
import RiskAlertPanel, { type RiskItem } from "./components/RiskAlertPanel.vue";
import VoiceCapsule from "./components/VoiceCapsule.vue";
import ReceptionCapsule from "./components/ReceptionCapsule.vue";
import SymptomManagement from "./components/SymptomManagement.vue";
import SvgIcon from "./components/svgIcon.vue";
import KnowledgeBasePanel from "./components/KnowledgeBasePanel.vue";
import VoiceConsultationNew from "./components/VoiceConsultationNew.vue";
import FeedbackSubmissionPanel from "./components/FeedbackSubmissionPanel.vue";
import HisIntegrationLogPanel from "./components/HisIntegrationLogPanel.vue";
import MedicalCatalogCachePanel from "./components/MedicalCatalogCachePanel.vue";
import Icon from "./components/Icon.vue";
import { trackClick } from "./services/operationTracker";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getWindowSizeForView, WINDOW_SIZES, type ViewType } from "./constants/windowSizes";
import { useWindowManagement } from "./composables/useWindowManagement";
import { useWorkMode } from "./composables/useWorkMode";
import { useNavigation } from "./composables/useNavigation";
import { useVoiceConsultation } from "./composables/useVoiceConsultation";
import { useEventListeners } from "./composables/useEventListeners";
import { useMinimizedSessions } from "./composables/useMinimizedSessions";
import {
  getPatientContextAgeText,
  getPatientContextGenderCode,
  getPatientContextGenderText,
  getPatientContextName,
} from "./utils/patientContext";
import { pmphaiService, isPMPHAIConfigured } from './services/pmphai';
import { medicalDataService, type MedicalCatalogClearOptions, type MedicalCatalogClearResult, type MedicalCatalogDebugState } from "./services/medicalData";
import {
  checkForceUpdateRequired,
  getCurrentForceUpdateState,
  subscribeForceUpdateRequired,
  type ForceUpdateState,
} from "./services/updatePolicy";
import type { AppPatient, AppStore } from "./types/appState";
import type { ConsultationAssistAction } from "./types/consultationAssist";

const ForceUpdateGate = defineAsyncComponent(() => import("./components/ForceUpdateGate.vue"));

type MedicalCatalogDebugApi = {
  help: () => string[];
  state: () => Promise<MedicalCatalogDebugState>;
  sync: (orgCode?: string | null) => Promise<MedicalCatalogDebugState>;
  clear: (options?: MedicalCatalogClearOptions) => Promise<MedicalCatalogClearResult>;
  sample: (limit?: number) => {
    diagnoses: ReturnType<typeof medicalDataService.getAllDiagnoses>;
    items: ReturnType<typeof medicalDataService.getAllItems>;
    medicines: ReturnType<typeof medicalDataService.getAllMedicines>;
  };
};

declare global {
  interface Window {
    __medicalCatalogDebug__?: MedicalCatalogDebugApi;
  }
}

const appWindow = shallowRef<TauriWindow | null>(null);
const standaloneWindowKind =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('window') === 'diagnosis-path'
    ? 'diagnosis-path'
    : 'main';
const isDiagnosisPathWindow = standaloneWindowKind === 'diagnosis-path';
const toastRef = ref<InstanceType<typeof Toast> | null>(null);
const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
  toastRef.value?.show(msg, type, duration);
};
provide('showToast', showToast);
const isFocused = ref(false);
const isHovered = ref(false);
const hoveredBtnIndex = ref(-1); // -1 means no button hovered
const isWorking = ref(false);
const currentView = ref<ViewType>('chat');
const currentPatient = ref<AppPatient | null>(null);
const consultationPageRef = ref<InstanceType<typeof ConsultationPage> | null>(null);
const ringMenuRef = ref<HTMLElement | null>(null);
const forceUpdateState = ref<ForceUpdateState>(getCurrentForceUpdateState());
const isForceUpdateRequired = computed(() => forceUpdateState.value.required);

// 风险提示状态
const isRiskAnalyzing = ref(false);
const riskPatientName = ref('');
const riskPatientGender = ref<'M' | 'F'>('M');
const riskPatientAge = ref(0);
const riskItems = ref<RiskItem[]>([]);

// 语音问诊状态
const voiceInteractionSessionKey = ref(0);
const consultationAssistTrigger = ref<{ kind: ConsultationAssistAction; token: number } | null>(null);
const patientDisplayName = computed(
  () => getPatientContextName(currentPatient.value) || '未知患者'
);
const assistantTitle = computed(() => {
  switch (currentView.value) {
    case 'chat':
      return '智医助理';
    case 'consultation':
      return currentPatient.value ? `智能问诊 - ${patientDisplayName.value}` : '智能问诊';
    case 'voice-consultation':
      return currentPatient.value ? `语音问诊 - ${patientDisplayName.value}` : '语音问诊';
    case 'analytics':
      return '数据分析';
    case 'symptom-manage':
      return '症状库维护';
    case 'his-log':
      return 'HIS 联调日志';
    case 'medical-cache':
      return '基础数据缓存管理';
    case 'knowledge-base':
      return '知识库检索';
    default:
      return '系统设置';
  }
});
const showSessionEntry = computed(
  () =>
    Boolean(currentPatient.value) &&
    currentView.value !== 'consultation'
);
const feedbackDialogVisible = ref(false);
const feedbackDialogSuspended = ref(false);
const feedbackSourceModule = computed(() => `view:${currentView.value}`);

function openFeedbackDialog(): void {
  trackClick('open_global_feedback_dialog', { currentView: currentView.value });
  feedbackDialogVisible.value = true;
}

function closeFeedbackDialog(): void {
  feedbackDialogVisible.value = false;
  feedbackDialogSuspended.value = false;
}

function suspendFeedbackDialogForCapture(): void {
  feedbackDialogSuspended.value = true;
}

function resumeFeedbackDialogAfterCapture(): void {
  feedbackDialogSuspended.value = false;
}

function createMedicalCatalogDebugApi(): MedicalCatalogDebugApi {
  const printState = (state: MedicalCatalogDebugState): MedicalCatalogDebugState => {
    console.log('[MedicalCatalogDebug] State:', state);
    if (state.syncStates.length > 0) {
      console.table(state.syncStates);
    } else {
      console.info('[MedicalCatalogDebug] No sync state records');
    }
    return state;
  };

  return {
    help() {
      const messages = [
        'window.__medicalCatalogDebug__.state()  // 查看 SQLite 缓存状态',
        'window.__medicalCatalogDebug__.sync()  // 按当前机构上下文触发同步',
        "window.__medicalCatalogDebug__.sync('机构ID')  // 切换机构并同步",
        'window.__medicalCatalogDebug__.clear()  // 清空全部目录缓存',
        "window.__medicalCatalogDebug__.clear({ catalogType: 'items', orgCode: '机构ID' })  // 清理指定机构诊疗项目",
        'window.__medicalCatalogDebug__.sample(5)  // 查看当前内存目录前几条'
      ];
      messages.forEach((message) => console.info(message));
      return messages;
    },
    async state() {
      return printState(await medicalDataService.getDebugState());
    },
    async sync(orgCode?: string | null) {
      if (typeof orgCode !== 'undefined') {
        await medicalDataService.setCatalogContext({ orgCode });
      } else {
        await medicalDataService.ensureLocalCatalogsSynced();
      }
      return printState(await medicalDataService.getDebugState());
    },
    async clear(options: MedicalCatalogClearOptions = {}) {
      const result = await medicalDataService.clearDebugCache(options);
      console.log('[MedicalCatalogDebug] Clear result:', result);
      return result;
    },
    sample(limit = 10) {
      return {
        diagnoses: medicalDataService.getAllDiagnoses().slice(0, limit),
        items: medicalDataService.getAllItems().slice(0, limit),
        medicines: medicalDataService.getAllMedicines().slice(0, limit),
      };
    },
  };
}

function queueConsultationAssistTrigger(kind: ConsultationAssistAction): void {
  consultationAssistTrigger.value = {
    kind,
    token: Date.now(),
  };
}

function clearConsultationAssistTrigger(): void {
  consultationAssistTrigger.value = null;
}

async function openConsultationAssist(): Promise<void> {
  queueConsultationAssistTrigger('record');
  await openConsultation();
}

let store: Store | null = null;
const resizeTimeoutRef = ref<ReturnType<typeof setTimeout> | null>(null);
const storeRef = shallowRef<AppStore | null>(null);
const transitioning = ref(false);
let unsubscribeForceUpdate: (() => void) | null = null;

// 初始化窗口管理 composable
const windowMgmt = useWindowManagement({
  appWindow,
  store: storeRef,
  isWorking,
  transitioning,
});

const {
  saveWindowPosition,
  updateCurrentMonitor,
  smartExpand,
  handleWindowMove,
  persistCurrentWindowSize,
} = windowMgmt;

// 风险提示患者信息同步函数
const syncRiskPatientInfo = (patient: AppPatient) => {
  riskPatientName.value = getPatientContextName(patient) || '未知';
  riskPatientGender.value = (getPatientContextGenderCode(patient) === 'F' || getPatientContextGenderText(patient) === '女性') ? 'F' : 'M';
  const age = Number.parseInt(getPatientContextAgeText(patient), 10);
  riskPatientAge.value = Number.isFinite(age) ? age : 0;
};

const getCurrentReceptionWindowSize = () => getWindowSizeForView('reception-capsule', {
  expanded: !isRiskAnalyzing.value && riskItems.value.length > 0,
  riskCount: riskItems.value.length,
});

// 初始化工作模式 composable
const workMode = useWorkMode({
  appWindow,
  windowMgmt,
  currentView,
  isWorking,
  transitioning,
  isHovered,
  currentPatient,
  syncRiskPatientInfo,
  getReceptionWindowSize: getCurrentReceptionWindowSize,
  store: storeRef,
});

// 解构工作模式 API
const { exiting, containerStyle, ballStyle, contentVisible } = workMode;
const { enterWorkMode, exitWork, handleCollapse } = workMode;

// 初始化导航管理 composable
const navigation = useNavigation({
  appWindow,
  currentView,
  isWorking,
  currentPatient,
  windowMgmt,
  workMode,
});

// 解构导航 API
const {
  openSettings,
  openChat,
  openSymptomManagement,
  openHisIntegrationLog,
  openMedicalCatalogCache,
  openConsultation,
  openVoiceConsultation,
  startVoiceInteraction: startVoiceInteractionBase,
} = navigation;

// 初始化语音问诊 composable
const voiceConsultation = useVoiceConsultation({
  appWindow,
  currentView,
  currentPatient,
  showToast,
  windowMgmt,
  workMode,
});

// 解构语音问诊 API
const {
  intentResult,
  intentSource,
  isProcessingVoice,
  resetVoiceSessionState,
  resumeCachedVoiceResult,
  hasCachedVoiceResult,
  handleVoiceStop,
  handleVoiceError,
  cancelVoiceResult: cancelVoiceResultRaw,
} = voiceConsultation;

// 最小化会话管理：记录从症状问诊 / 语音问诊收起到小球的现场，
// 用于通过悬浮球按钮 / 双击小球恢复。跨自然日自动失效。
const minimizedSessions = useMinimizedSessions();

// 语音问诊结束（取消）时一并清除最小化会话标记
async function cancelVoiceResult(): Promise<void> {
  await cancelVoiceResultRaw();
  minimizedSessions.clear('voice');
}

// 可见性/可点击门禁：
// 问诊按钮始终可见；仅在当前患者存在未结束的问诊（最小化会话）时才可点击，
// 作为“恢复问诊界面”的入口；否则置灰禁用。
const hasResumableConsultation = computed(() =>
  currentPatient.value !== null && minimizedSessions.latestType.value !== null
);

const resumableConsultationIcon = computed(() => {
  return minimizedSessions.latestType.value === 'voice' ? 'lucide:mic' : 'lucide:stethoscope';
});

const resumableConsultationTitle = computed(() => {
  if (!hasResumableConsultation.value) {
    return '暂无未结束的问诊';
  }
  return minimizedSessions.latestType.value === 'voice' ? '恢复语音问诊' : '恢复问诊界面';
});

/**
 * 用户主动收起的统一入口：
 *  - 如果当前在症状问诊 / 语音问诊未结束的视图，记录最小化；
 *  - 问诊态会先回到接待胶囊；从接待胶囊再次关闭时才退出到球；
 *  - 接待胶囊自身不再覆写最小化类型，避免语音链路被误记成症状链路。
 */
async function handleUserCollapse(): Promise<void> {
  const startedFromSymptomConsultation = currentView.value === 'consultation' && !!currentPatient.value;

  if (startedFromSymptomConsultation && currentPatient.value) {
    minimizedSessions.record('symptom', currentPatient.value);
    await handleCollapse();
    // handleCollapse 完成后同步重置 ConsultationPage 内部视图。
    // 不用 await nextTick()：nextTick 在 Vue flush 报错时会 reject，
    // 且此处已无需等待 DOM flush（handleCollapse 的 await 链已保证更新完成）。
    if (currentView.value === 'reception-capsule') {
      consultationPageRef.value?.resetToConsultationView();
    }
    return;
  } else if (currentView.value === 'voice-consultation' && currentPatient.value) {
    minimizedSessions.record('voice', currentPatient.value);
  } else if (
    currentView.value === 'voice-interaction' &&
    currentPatient.value &&
    currentPatient.value._receptionEnsured
  ) {
    // 语音采集页点击取消/收起：如果当前还有已接诊的患者上下文，
    // 返回接诊胶囊态，而不是一路退出到小球，避免医生丢失当前患者上下文。
    resetVoiceSessionState();
    currentView.value = 'reception-capsule';
    const receptionSize = getCurrentReceptionWindowSize();
    try {
      await enterWorkMode(receptionSize.width, receptionSize.height);
    } catch (e) {
      console.warn('[App] Failed to switch back to reception capsule on voice cancel:', e);
    }
    return;
  }
  await handleCollapse();
}

/**
 * 点击悬浮球的"问诊"按钮：
 *  - 仅在存在未结束问诊会话时可点（由 hasResumableConsultation 控制）；
 *  - 点击后按"最后一次"原则恢复语音 / 症状问诊现场。
 *
 * 注意：不在这里清掉最小化记录。下一次再次收起时会以更新后的 timestamp 覆盖；
 * 真正清理发生在「会话完成 / 取消 / 跨自然日」时。
 */
async function handleConsultationRingClick(): Promise<void> {
  if (!hasResumableConsultation.value) return;
  const latest = minimizedSessions.latestType.value;
  if (latest === 'voice' && currentPatient.value) {
    currentView.value = 'voice-consultation';
    await enterWorkMode();
    return;
  }
  await openConsultation();
}

/**
 * 双击悬浮球：
 *  - 优先恢复最近一次最小化的会话（症状问诊或语音问诊）；
 *  - 否则维持原行为（打开聊天）。
 *
 * 与症状问诊按钮一样，恢复后不主动清最小化记录，让下一次收起时再覆盖；
 * 这样医生在多个会话之间来回切换时不会丢失"还有未完会话"的信号。
 */
async function handleBallDblClick(): Promise<void> {
  const latest = minimizedSessions.latestType.value;
  if (latest === 'voice' && currentPatient.value) {
    currentView.value = 'voice-consultation';
    await enterWorkMode();
    return;
  }
  if (latest === 'symptom' && currentPatient.value) {
    await openConsultation();
    return;
  }
  await openChat();
}

async function startVoiceInteraction(options?: { skipCacheRestore?: boolean }): Promise<void> {
  resetVoiceSessionState();
  if (!options?.skipCacheRestore && await resumeCachedVoiceResult()) {
    return;
  }
  voiceInteractionSessionKey.value += 1;
  await startVoiceInteractionBase();
}

const handleFocus = () => { isFocused.value = true; };
const handleBlur = () => { isFocused.value = false; };

// 关闭风险提示界面
const closeRiskAlert = async () => {
  await exitWork();
};

const handleRiskExpand = async (expanded: boolean) => {
  console.log('[App] handleRiskExpand:', expanded);
  const targetSize = getWindowSizeForView('reception-capsule', {
    expanded,
    riskCount: riskItems.value.length,
  });

  try {
    if (appWindow.value) {
      await smartExpand(targetSize.width, targetSize.height);
      await appWindow.value.setSize(new LogicalSize(targetSize.width, targetSize.height));
    }
  } catch (e) {
    console.error('Failed to resize for risk details:', e);
  }
};

// 初始化事件监听管理 composable
const eventListeners = useEventListeners({
  appWindow,
  currentView,
  isWorking,
  transitioning,
  isHovered,
  hoveredBtnIndex,
  ringMenuRef,
  currentPatient,
  riskState: {
    riskPatientName,
    riskPatientGender,
    riskPatientAge,
    riskItems,
    isRiskAnalyzing,
  },
  showToast,
  handleWindowMove,
  persistCurrentWindowSize,
  workMode: { enterWorkMode, exitWork },
  navigation: { openConsultation, openVoiceConsultation, startVoiceInteraction },
  resetVoiceSessionState,
  hasCachedVoiceResult,
  queueConsultationAssistTrigger,
  exiting,
  resizeTimeoutRef,
});

async function applyForceUpdateWindowState(state: ForceUpdateState): Promise<void> {
  const wasRequired = forceUpdateState.value.required;
  forceUpdateState.value = state;
  if (isDiagnosisPathWindow) {
    return;
  }
  if (!state.required) {
    // 防御：强升状态从 true → false（如服务端解除策略 / 网络恢复后重新拉取）时，
    // 把之前为了显示升级页强行撑开的窗口恢复成小球态，避免用户卡在已无内容的工作面板上。
    if (wasRequired) {
      try {
        await handleCollapse();
      } catch (error) {
        console.warn('[App] Failed to collapse after force update lifted:', error);
      }
    }
    return;
  }
  feedbackDialogVisible.value = false;
  feedbackDialogSuspended.value = false;
  isWorking.value = true;
  currentView.value = 'settings';
  try {
    if (appWindow.value) {
      await smartExpand(760, 620);
      await appWindow.value.setSize(new LogicalSize(760, 620));
      await appWindow.value.show();
      await appWindow.value.setFocus();
    }
  } catch (error) {
    console.warn('[App] Failed to apply force update window state:', error);
  }
}

// 监听状态变化并持久化
watch([isWorking, currentView], async () => {
  if (isDiagnosisPathWindow) return;
  if (!store) return;
  try {
    await store.set('app_state', {
      isWorking: isWorking.value,
      currentView: currentView.value
    });
    await store.save();
  } catch (err) {
    console.error('保存应用状态失败:', err);
  }
});

onMounted(async () => {
  try {
    appWindow.value = getCurrentWindow();

    if (isDiagnosisPathWindow) {
      await appWindow.value.show();
      await appWindow.value.setFocus();
      return;
    }

        // 初始化 store
        try {
          store = await load('.settings.dat');
          storeRef.value = store;
        } catch (storeErr) {
          console.warn('[App] ⚠️ Failed to load store:', storeErr);
        }
        
        // 恢复应用状态
        try {
            console.log('[App] 🌟 Application starting. mode: Floating Ball');
            isWorking.value = false;
            currentView.value = 'chat';
            
            if (appWindow.value) {
                await appWindow.value.setSize(new LogicalSize(WINDOW_SIZES.BALL.width, WINDOW_SIZES.BALL.height));
                
                // 【核心修复】：不要在这里调用 restoreWindowPosition！
                // 因为 Rust 后端已经在窗口启动前，读取本地文件并完美赋予了物理坐标。
                // 如果在这里使用基于 Tauri-Plugin-Store 的 JS API 读取，刚启动时极易读取异步落后得到空值，
                // 导致 fallback 到了 (200, 200)，从而强行把位置给毁了。
                // 我们只需把当前真实位置同步给内存状态即可：
                try {
                    const currentPos = await appWindow.value.outerPosition();
                    windowMgmt.lastBallPos.value = { x: currentPos.x, y: currentPos.y };
                    console.log('[App] Synchronized Rust position to Vue memory:', currentPos);
                } catch (posErr) {
                    console.warn('[App] Failed to read outer position:', posErr);
                }
            }
        } catch (err) {
          console.warn('[App] ⚠️ Initialization state failed:', err);
        }

    unsubscribeForceUpdate = subscribeForceUpdateRequired((state) => {
      void applyForceUpdateWindowState(state);
    });
    void checkForceUpdateRequired().then(applyForceUpdateWindowState);

    // 注册所有事件监听
    await eventListeners.registerAllListeners();

    // Initial monitor update
    updateCurrentMonitor();

    window.__medicalCatalogDebug__ = createMedicalCatalogDebugApi();
    console.info('[MedicalCatalogDebug] Debug API ready: window.__medicalCatalogDebug__');
  } catch (e) {
    console.warn("初始化窗口失败:", e);
  }
});

onUnmounted(() => {
  delete window.__medicalCatalogDebug__;
  if (unsubscribeForceUpdate) {
    unsubscribeForceUpdate();
    unsubscribeForceUpdate = null;
  }
  if (!isDiagnosisPathWindow) {
    eventListeners.unregisterAllListeners();
  }
});

// 使用 Tauri 原生拖拽
const handleMouseDown = async (e: MouseEvent) => {
  // 只有左键且在球体上才能拖拽 (利用 target 判断，避免拖拽按钮)
  const target = e.target as HTMLElement;
  if (e.button === 0 && appWindow.value && target.closest('.floating-ball')) {
    try {
      await appWindow.value.startDragging();
    } catch (error) {
      console.error('拖拽失败:', error);
    }
  }
};


// 退出应用
const handleExitApp = async (e: MouseEvent) => {
  e.preventDefault();
  trackClick('exit_app');
  try {
    // 退出前强制保存一次位置
    console.log('[App] 🚪 App exiting, triggering final position save...');
    await saveWindowPosition(true);
    await exit(0);
  } catch (err) {
    console.error('[App] ❌ Failed to exit app:', err);
    // 降级方案
    if (appWindow.value) {
      await appWindow.value.close();
    }
  }
};


const openInsideCloudHome = async () => {
  if (!isPMPHAIConfigured()) {
    showToast('请先在本地设置或后台管理端启用知识库', 'error');
    return;
  }

  const pageUrl = await pmphaiService.getPageUrl({
    pageName: 'home',
  });
  if (!pageUrl) {
    showToast('知识库地址生成失败', 'error');
    return;
  }

  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(pageUrl);
  } catch (err) {
    console.error('Failed to open URL:', err);
    window.open(pageUrl, '_blank');
  }
};
</script>

<template>
  <DiagnosisPathWindow v-if="isDiagnosisPathWindow" />
  <template v-else>
  <a href="#main-content" class="skip-link">跳转到主要内容</a>

  <div class="state-layer" id="main-content" tabindex="-1">
    <Transition name="morph">
      <div v-show="!isWorking" class="ball-layer" :style="containerStyle">
        <div 
          class="ball-container" 
          :class="{ 'no-interaction': transitioning }"
          :style="ballStyle"
        >
          <!-- 环绕菜单 -->
          <div ref="ringMenuRef" class="ring-menu" :class="{ 'is-active': isHovered }" role="navigation" aria-label="主菜单">
            <button
              class="ring-btn right"
              :class="{ 'manual-hover': hoveredBtnIndex === 1 }"
              @click.stop="openChat"
              aria-label="打开对话"
              title="打开对话"
            >
              <svgIcon file="/chat.svg" :color="'#262626'" :hoverColor="'#2B7FE3'" :fontSize="'18px'"></svgIcon>
            </button>
            <button
              class="ring-btn bottom"
              :class="{ 'manual-hover': hoveredBtnIndex === 2 }"
              @click.stop="openSettings"
              aria-label="打开设置"
              title="设置"
            >
              <svgIcon file="/setting.svg" :color="'#262626'" :hoverColor="'#2B7FE3'" :fontSize="'18px'"></svgIcon>
            </button>
            <button
              class="ring-btn top"
              :class="{ 'manual-hover': hoveredBtnIndex === 0 }"
              @click.stop="handleExitApp"
              aria-label="退出应用"
              title="退出"
            >
              <svgIcon file="/off.svg" :color="'#262626'" :hoverColor="'#2B7FE3'" :fontSize="'18px'"></svgIcon>
            </button>
	             <button
	              class="ring-btn left"
	              :class="{ 'manual-hover': hoveredBtnIndex === 3, 'is-disabled': !hasResumableConsultation }"
	              :disabled="!hasResumableConsultation"
	              @click.stop="handleConsultationRingClick"
                :aria-label="resumableConsultationTitle"
                :title="resumableConsultationTitle"
	            >
                <Icon :icon="resumableConsultationIcon" :size="18" class="ring-btn-icon" aria-hidden="true" />
            </button>
          </div>
          
          <div
            class="floating-ball"
            tabindex="0"
            :class="{ 'is-focused': isFocused, 'is-hovered': isHovered }"
            @mousedown="handleMouseDown"
            @focus="handleFocus"
            @blur="handleBlur"
            @contextmenu.stop
            @dblclick="handleBallDblClick"
          >
            <div class="ball-content">
              <img 
                class="robot-avatar" 
                src="/robot-avatar.png"
                alt="Robot"
                draggable="false"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="morph">
      <div v-show="isWorking" class="assistant-layer" :style="containerStyle">
        <div 
          class="assistant-container" 
          :class="{ 'no-toolbar': isForceUpdateRequired || currentView === 'risk-alert' || currentView === 'voice-interaction' || currentView === 'reception-capsule', 'is-content-hidden': !contentVisible }"
          :style="currentView === 'reception-capsule' ? { borderRadius: '16px', background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: 'none', boxShadow: 'none' } : { borderRadius: '20px' }"
        >
          <ForceUpdateGate v-if="isForceUpdateRequired" :state="forceUpdateState" />
          <template v-else>
          <!-- 工具栏 (risk-alert, voice-interaction, reception-capsule 视图不显示) -->
          <div v-if="currentView !== 'risk-alert' && currentView !== 'voice-interaction' && currentView !== 'reception-capsule'" class="assistant-toolbar" data-tauri-drag-region>
            <div class="toolbar-left" data-tauri-drag-region>
	              <button v-if="currentView === 'settings' || currentView === 'analytics' || currentView === 'symptom-manage' || currentView === 'his-log' || currentView === 'medical-cache' || currentView === 'knowledge-base'" class="icon-btn back-btn" @click="currentView === 'analytics' ? openChat() : handleUserCollapse()" title="返回">
	                 <Icon icon="lucide:arrow-left" class="toolbar-icon" size="20" />
	              </button>
	              <span class="assistant-title" data-tauri-drag-region>{{ assistantTitle }}</span>
	            </div>
	            <div class="toolbar-right" style="display: flex; gap: 8px;">
	              <button
	                v-if="showSessionEntry"
	                class="icon-btn"
	                aria-label="灵活触发"
	                title="灵活触发"
	                @click="openConsultationAssist"
	              >
	                <Icon icon="lucide:sparkles" class="toolbar-icon" size="20" />
	              </button>
	              <button class="icon-btn" aria-label="知识库" title="知识库" @click="openInsideCloudHome">
	                <Icon icon="lucide:book-open" class="toolbar-icon" size="20" />
	              </button>
                <button class="icon-btn feedback-entry-btn" aria-label="问题反馈" title="问题反馈" @click="openFeedbackDialog">
                  <Icon icon="lucide:message-square-warning" class="toolbar-icon" size="20" />
                </button>
              <button class="icon-btn" aria-label="收起" title="收起" @click="handleUserCollapse">
                <Icon icon="lucide:chevron-down" class="toolbar-icon" size="20" />
              </button>
            </div>
          </div>
          <!-- 问诊页面用 v-show 保持常驻，避免切换视图时组件销毁导致数据丢失 -->
          <ConsultationPage
            ref="consultationPageRef"
            v-show="currentView === 'consultation'"
            @close="handleUserCollapse"
            :initialPatientData="currentPatient ?? undefined"
            :assistTrigger="consultationAssistTrigger"
            @consume-auto-trigger="clearConsultationAssistTrigger"
          />
          <ChatPanel v-if="currentView === 'chat'" />
          <RiskAlertPanel
            v-if="currentView === 'risk-alert'"
            :patientName="riskPatientName"
            :gender="riskPatientGender"
            :age="riskPatientAge"
            :risks="riskItems"
            @close="closeRiskAlert"
            @confirm="closeRiskAlert"
          />
          <!-- Voice Interaction View -->
          <VoiceCapsule
            :key="voiceInteractionSessionKey"
            v-if="currentView === 'voice-interaction'"
            :processing="isProcessingVoice"
            @stop="handleVoiceStop"
            @error="handleVoiceError"
            @close="handleUserCollapse"
          />

          <!-- Reception Service (Risk) Capsule -->
          <ReceptionCapsule
            v-if="currentView === 'reception-capsule'"
            :patient-name="riskPatientName"
            :gender="riskPatientGender"
            :age="riskPatientAge"
            :risks="riskItems"
            :analyzing="isRiskAnalyzing"
            @close="closeRiskAlert"
            @toggle-expand="handleRiskExpand"
          />

          <AnalyticsPanel
            v-if="currentView === 'analytics'"
            @close="openChat"
          />
          <SymptomManagement v-if="currentView === 'symptom-manage'" @close="handleUserCollapse" />
          <HisIntegrationLogPanel v-if="currentView === 'his-log'" />
          <MedicalCatalogCachePanel v-if="currentView === 'medical-cache'" />
          <VoiceConsultationNew
            v-if="currentView === 'voice-consultation'"
            :initialPatientData="currentPatient ?? undefined"
            :intentResult="intentResult"
            :intentSource="intentSource"
            @close="handleUserCollapse"
            @cancel="cancelVoiceResult"
          />
          <KnowledgeBasePanel v-if="currentView === 'knowledge-base'" @close="handleUserCollapse" />
          <SettingsPanel
            v-if="currentView === 'settings'"
            @open-symptom-manage="openSymptomManagement"
            @open-medical-cache="openMedicalCatalogCache"
            @open-his-log="openHisIntegrationLog"
          />
          </template>
        </div>
      </div>
    </Transition>
  </div>
  <Transition name="fade">
    <div
      v-if="feedbackDialogVisible && !isForceUpdateRequired"
      class="feedback-overlay"
      :class="{ 'feedback-overlay--suspended': feedbackDialogSuspended }"
      @click.self="closeFeedbackDialog"
    >
      <div class="feedback-dialog">
        <FeedbackSubmissionPanel
          variant="dialog"
          :source-module="feedbackSourceModule"
          @close="closeFeedbackDialog"
          @submitted="closeFeedbackDialog"
          @screenshot-capture-start="suspendFeedbackDialogForCapture"
          @screenshot-capture-end="resumeFeedbackDialogAfterCapture"
        />
      </div>
    </div>
  </Transition>
  <div v-if="transitioning" class="transition-mask" />
  <Toast ref="toastRef" />
  </template>
</template>

<style scoped>
.ball-container {
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  background: transparent;
  pointer-events: auto;
}

/* 动画过程中禁用交互，防止环绕菜单误触发 */
.ball-container.no-interaction {
  pointer-events: none !important;
}
.ball-container.no-interaction .ring-menu {
  display: none;
}

.floating-ball {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4DA2FF 0%, #2B7FE3 50%, #1A6FD5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  user-select: none;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform, box-shadow;
  transform: translateZ(0);
  position: relative;
  z-index: 5;
  box-shadow:
    0 2px 8px rgba(43, 127, 227, 0.3),
    0 4px 16px rgba(43, 127, 227, 0.15);
  outline: none;
}

/* 呼吸光晕动画 */
.floating-ball::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(77, 162, 255, 0.4), rgba(43, 127, 227, 0.2));
  z-index: -1;
  opacity: 0.6;
  animation: ball-breathe 3s ease-in-out infinite;
}

@keyframes ball-breathe {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.15); opacity: 0.7; }
}

/* 环绕菜单层 */
.ring-menu {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

/* 展开时的柔和光晕背景 */
.ring-menu::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 130px;
  height: 130px;
  margin-top: -65px;
  margin-left: -65px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(240, 245, 255, 0.92) 0%,
    rgba(235, 243, 255, 0.75) 45%,
    rgba(230, 240, 255, 0.3) 70%,
    transparent 100%
  );
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: -1;
}

.ring-menu.is-active::before {
  opacity: 1;
  transform: scale(1);
}

/* JS 驱动 (is-active) 或 CSS 原生 Hover 均可触发 */
.ring-menu.is-active {
  pointer-events: auto;
}

.floating-ball:hover,
.floating-ball.is-hovered {
  transform: scale(1.08);
  box-shadow:
    0 3px 12px rgba(43, 127, 227, 0.35),
    0 6px 24px rgba(43, 127, 227, 0.2);
}

.floating-ball:hover::before,
.floating-ball.is-hovered::before {
  animation-play-state: paused;
  opacity: 0.8;
  transform: scale(1.2);
}

/* 环绕菜单按钮 */
.ring-btn {
  position: absolute;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(43, 127, 227, 0.08);
  background: rgba(255, 255, 255, 0.92);
  color: #6B7B8D;
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.06),
    0 2px 8px rgba(43, 127, 227, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.3);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ring-menu.is-active .ring-btn {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

/* 按钮依次弹出的延迟动画 */
.ring-menu.is-active .ring-btn.top { transition-delay: 0ms; }
.ring-menu.is-active .ring-btn.right { transition-delay: 40ms; }
.ring-menu.is-active .ring-btn.bottom { transition-delay: 80ms; }
.ring-menu.is-active .ring-btn.left { transition-delay: 120ms; }

.ring-btn:hover,
.ring-btn.manual-hover {
  background: #fff;
  color: #2B7FE3;
  border-color: rgba(43, 127, 227, 0.2);
  transform: scale(1.12) !important;
  box-shadow:
    0 2px 8px rgba(43, 127, 227, 0.15),
    0 4px 16px rgba(43, 127, 227, 0.1);
}

.ring-btn:active {
  transform: scale(0.95) !important;
  transition-duration: 0.1s;
}

.ring-btn.is-disabled,
.ring-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  filter: grayscale(0.6);
}

.ring-btn.is-disabled:hover,
.ring-btn:disabled:hover {
  background: rgba(255, 255, 255, 0.92);
  color: inherit;
  border-color: rgba(43, 127, 227, 0.08);
  transform: none !important;
  box-shadow:
    0 2px 8px rgba(43, 127, 227, 0.06),
    0 4px 16px rgba(43, 127, 227, 0.04);
}

/* 禁用状态下：让图标本身不响应 hover 颜色切换，避免“看上去还可点”的误导；
   但仍保留按钮外圈的 cursor: not-allowed 作为禁用标识。 */
.ring-btn.is-disabled .svg-icon,
.ring-btn:disabled .svg-icon,
.ring-btn.is-disabled .ring-btn-icon,
.ring-btn:disabled .ring-btn-icon {
  pointer-events: none;
}

.ring-icon { width: 16px; height: 16px; stroke-width: 1.8; }

/* 按钮分布位置 */
.ring-btn.top { top: 16px; left: 47%; margin-left: -17px; }
.ring-btn.right { top: 50%; right: 16px; margin-top: -17px; }
.ring-btn.bottom { bottom: 16px; left: 47%; margin-left: -17px; }
.ring-btn.left { top: 50%; left: 16px; margin-top: -17px; }

/* 未激活时的收缩动画 */
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.top { transform: translateY(12px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.right { transform: translateX(-12px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.bottom { transform: translateY(-12px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.left { transform: translateX(12px) scale(0.1); }

.ball-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  position: relative;
  z-index: 2;
}

.robot-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.floating-ball:hover .robot-avatar,
.floating-ball.is-hovered .robot-avatar {
  transform: scale(1.06);
}

.tooltip {
  display: none;
}

.feedback-entry-btn {
  color: #f97316;
}

.feedback-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 24px 24px;
  background: rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.feedback-dialog {
  width: min(720px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow: auto;
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
}

.feedback-overlay--suspended {
  opacity: 0;
  pointer-events: none;
}

</style>

<style>
/* 导入统一设计令牌 - 医疗产品设计系统 */
@import './styles/design-tokens.css';

/**
 * 应用特定的变量覆盖
 *
 * 注意：大部分样式已迁移到独立的 CSS 模块
 * - global.css: 全局基础样式
 * - layouts/app-layout.css: 布局和容器样式
 * - animations/morph.css: 过渡动画
 *
 * 此处仅保留应用特定的变量覆盖
 */
:root {
  /* 玻璃态效果 - 使用自定义透明度以适配浮动球设计 */
  --surface-glass: rgba(255, 255, 255, 0.65);
  --surface-glass-weak: rgba(255, 255, 255, 0.45);
}
</style>
