<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from "vue";
import { getCurrentWindow, Window as TauriWindow, PhysicalPosition, currentMonitor, type Monitor } from "@tauri-apps/api/window";
import { exit } from '@tauri-apps/plugin-process';
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { load, Store } from '@tauri-apps/plugin-store';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import ChatPanel from "./components/ChatPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import ConsultationPage from "./components/ConsultationPage.vue";
import Toast from "./components/Toast.vue";
import RiskAlertPanel, { type RiskItem } from "./components/RiskAlertPanel.vue";
import VoiceCapsule from "./components/VoiceCapsule.vue";
import ReceptionCapsule from "./components/ReceptionCapsule.vue";
import VoiceConsultationResult, { type GeneratedRecord } from "./components/VoiceConsultationResult.vue";
import { chat, analyzePatientRisks, type ChatMessage } from "./services/llm";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { provide } from "vue";
import { PROMPTS } from "./prompts";

const appWindow = ref<TauriWindow | null>(null);
const toastRef = ref<InstanceType<typeof Toast> | null>(null);
const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
  toastRef.value?.show(msg, type, duration);
};
provide('showToast', showToast);
const isFocused = ref(false);
const isHovered = ref(false);
const hoveredBtnIndex = ref(-1); // -1 means no button hovered
const isWorking = ref(false);
const isMoving = ref(false);
const currentView = ref<'chat' | 'settings' | 'consultation' | 'risk-alert' | 'voice-interaction' | 'voice-result' | 'reception-capsule'>('chat');
const currentPatient = ref<any>(null);
const ringMenuRef = ref<HTMLElement | null>(null);

// 风险提示状态
const isRiskAnalyzing = ref(false);
const riskPatientName = ref('');
const riskPatientGender = ref<'M' | 'F'>('M');
const riskPatientAge = ref(0);
const riskItems = ref<RiskItem[]>([]);
let unlistenHover: UnlistenFn | null = null;
let unlistenMousePos: UnlistenFn | null = null;
let unlistenMoved: UnlistenFn | null = null;
let unlistenResize: UnlistenFn | null = null;
let store: Store | null = null;
let moveTimeout: ReturnType<typeof setTimeout> | null = null;
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
const cachedMonitor = ref<Monitor | null>(null);
const lastBallPos = ref<{x: number, y: number} | null>(null);
const ballOffset = ref<{x: number, y: number}>({ x: 0, y: 0 });
const morphOrigin = ref('80px 80px');
const containerStyle = computed(() => ({
  transformOrigin: morphOrigin.value
}));

const ballStyle = computed(() => ({
  transform: `translate(${ballOffset.value.x}px, ${ballOffset.value.y}px)`,
  transition: 'opacity 0.2s ease'
}));

const handleFocus = () => { isFocused.value = true; };
const handleBlur = () => { isFocused.value = false; };

// 保存窗口位置
const saveWindowPosition = async () => {
  if (!appWindow.value || !store) return;
  try {
    const pos = await appWindow.value.outerPosition();
    // 只有在小球模式下才保存位置，避免展开后位置偏移覆盖了正确的小球位置
    if (!isWorking.value && !transitioning.value) {
      lastBallPos.value = { x: pos.x, y: pos.y }; // Update in-memory cache
      await store.set('window_pos', { x: pos.x, y: pos.y });
      await store.save();
    }
  } catch (err) {
    console.error('保存窗口位置失败:', err);
  }
};

// 恢复窗口位置
const restoreWindowPosition = async () => {
  if (!appWindow.value || !store) return;
  try {
    const pos = await store.get<{x: number, y: number}>('window_pos');
    console.log('[App] Restoring window position:', pos);
    
    let safeX = 100;
    let safeY = 100;

    if (pos) {
        try {
            const monitor = await currentMonitor();
            if (monitor) {
                const size = monitor.size;
                const mPos = monitor.position;
                // Check bounds: within monitor roughly
                if (pos.x >= mPos.x && pos.x < mPos.x + size.width &&
                    pos.y >= mPos.y && pos.y < mPos.y + size.height) {
                    safeX = pos.x;
                    safeY = pos.y;
                } else {
                    console.warn('[App] Restored position out of bounds:', pos, 'Monitor:', mPos, size);
                }
            } else {
                // No monitor info, just ensure not negative
                safeX = Math.max(0, pos.x);
                safeY = Math.max(0, pos.y);
            }
        } catch (e) {
            console.warn('[App] Position validation failed:', e);
            // Fallback to simple check
            safeX = Math.max(0, pos.x);
            safeY = Math.max(0, pos.y);
        }
    }

    console.log('[App] Final position to set:', {x: safeX, y: safeY});
    await appWindow.value.setPosition(new PhysicalPosition(safeX, safeY));
    
  } catch (err) {
    console.error('恢复窗口位置失败:', err);
    // Ultimate fallback
    await appWindow.value.setPosition(new PhysicalPosition(100, 100));
  }
};

// Update cached monitor
const updateCurrentMonitor = async () => {
  try {
    const start = performance.now();
    cachedMonitor.value = await currentMonitor();
    console.log('[App] Monitor cache updated:', cachedMonitor.value ? 'Success' : 'Null', `${(performance.now() - start).toFixed(2)}ms`);
  } catch (e) {
    console.warn('[App] Failed to update monitor cache:', e);
  }
};

// 智能调整展开位置
const smartExpand = async (targetW: number, targetH: number, targetMonitor?: Monitor | null) => {
  if (!appWindow.value) return;
  
  try {
    let monitor = targetMonitor;
    if (monitor) {
        console.log('[App] smartExpand: Using provided monitor');
    } else if (cachedMonitor.value) {
        monitor = cachedMonitor.value;
        console.log('[App] smartExpand: Using CACHED monitor');
    } else {
        console.log('[App] smartExpand: Cache MISS, calling currentMonitor()...');
        const start = performance.now();
        monitor = await currentMonitor();
        console.log('[App] smartExpand: currentMonitor() took', (performance.now() - start).toFixed(2), 'ms');
    }
    
    if (!monitor) {
        console.warn('[App] smartExpand: No monitor found');
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
    
    // 检查右边界
    if (newX + targetPhysicalW > monitorPos.x + monitorSize.width) {
      newX = (monitorPos.x + monitorSize.width) - targetPhysicalW;
    }
    
    // 检查下边界
    if (newY + targetPhysicalH > monitorPos.y + monitorSize.height) {
      newY = (monitorPos.y + monitorSize.height) - targetPhysicalH;
    }
    
    // 检查左边界 (防止调整后超出左边)
    if (newX < monitorPos.x) {
      newX = monitorPos.x;
    }
    
    // 检查上边界
    if (newY < monitorPos.y) {
      newY = monitorPos.y;
    }
    
    if (newX !== windowPos.x || newY !== windowPos.y) {
      await appWindow.value.setPosition(new PhysicalPosition(newX, newY));
    }
  } catch (err) {
    console.error('智能位置调整失败:', err);
  }
};

const openSettings = async () => {
  currentView.value = 'settings';
  if (!isWorking.value) {
    await enterWorkMode();
  }
};

const openChat = async () => {
  currentView.value = 'chat';
  if (!isWorking.value) {
    await enterWorkMode();
  }
};

const openConsultation = async () => {
  currentView.value = 'consultation';
  if (!isWorking.value) {
    await enterWorkMode();
  } else {
    // If already working, resize window if needed
    if (appWindow.value) {
      await appWindow.value.setSize(new LogicalSize(TARGET_CONSULTATION_W, TARGET_CONSULTATION_H));
      await smartExpand(TARGET_CONSULTATION_W, TARGET_CONSULTATION_H /*, monitor */);
    }
  }
};
const transitioning = ref(false);
const exiting = ref(false);
const TRANSITION_MS = 300;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const TARGET_WORK_W = 420;
const TARGET_WORK_H = 560;
const TARGET_CONSULTATION_W = 1200;
const TARGET_CONSULTATION_H = 900;
const TARGET_BALL_W = 160;
const TARGET_BALL_H = 160;
const TARGET_CAPSULE_W = 360;
const TARGET_CAPSULE_H = 80;
const TARGET_CAPSULE_EXPANDED_H = 400; // Increased height for risk details
const TARGET_RESULT_W = 1200;
const TARGET_RESULT_H = 900;

// Voice Consultation State
const generatedRecord = ref<GeneratedRecord | null>(null);

const startVoiceInteraction = async () => {
  currentView.value = 'voice-interaction';
  if (!isWorking.value) {
    await enterWorkMode(TARGET_CAPSULE_W, TARGET_CAPSULE_H);
  } else {
      // If already working (e.g. from Chat), resize to capsule
      enterWorkMode(TARGET_CAPSULE_W, TARGET_CAPSULE_H);
  }
};

  const handleVoiceStop = async (audioBlob: Blob, transcribedText: string) => {
  console.log('[App.vue] handleVoiceStop received blob:', audioBlob?.size, 'bytes');
  console.log('[App.vue] Transcribed text:', transcribedText);
  
  generatedRecord.value = null; // Reset
  currentView.value = 'voice-result';
  
  // Explicitly resize window for Result View
  if (appWindow.value) {
    try {
        await appWindow.value.setResizable(true);
        await appWindow.value.setSize(new LogicalSize(TARGET_RESULT_W, TARGET_RESULT_H));
        await smartExpand(TARGET_RESULT_W, TARGET_RESULT_H /*, monitor */);
    } catch (e) {
        console.error('Failed to resize for result:', e);
    }
  } else {
     await enterWorkMode(TARGET_RESULT_W, TARGET_RESULT_H);
  }
  
  try {
    // Use the transcribed text directly from realtime service
    const text = transcribedText;
    console.log('[Voice] Using realtime transcription:', text);

    if (!text || text.trim().length === 0) {
        throw new Error("未能识别到有效语音");
    }

    // 2. LLM Generation - Based on medical record requirements
    const messages: ChatMessage[] = [
        { role: 'system', content: PROMPTS.medical.recordGeneration.system },
        { role: 'user', content: PROMPTS.medical.recordGeneration.buildUserPrompt(text) }
    ];

    console.log('[LLM] Sending request to LLM...');
    console.log('[LLM] Input text length:', text.length, 'chars');
    const llmStart = Date.now();
    const jsonStr = await chat(messages);
    console.log(`[LLM] Response received in ${Date.now() - llmStart}ms`);
    console.log('[LLM] Raw response:', jsonStr);
    
    // Try to parse JSON (handle potential markdown code blocks)
    let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
    // Also try to extract JSON from text if wrapped in other content
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleanJson = jsonMatch[0];
    }
    
    console.log('[LLM] Cleaned JSON:', cleanJson);
    
    const parsed = JSON.parse(cleanJson);
    
    // Check if LLM detected irrelevant content
    if (parsed.error) {
        console.warn('[LLM] Irrelevant content detected:', parsed.message);
        showToast(parsed.message || '输入内容与医疗问诊场景无关', 'error');
        setTimeout(() => { exitWork(); }, 2000);
        return;
    }
    
    // Validate required fields
    const requiredFields = ['chiefComplaint', 'historyOfPresentIllness', 'diagnosisList'];
    const missingFields = requiredFields.filter(f => !parsed[f]);
    if (missingFields.length > 0) {
        console.warn('[LLM] Missing required fields:', missingFields);
        // Fill with defaults
        if (missingFields.includes('chiefComplaint')) parsed.chiefComplaint = '未能识别';
        if (missingFields.includes('historyOfPresentIllness')) parsed.historyOfPresentIllness = '未能识别';
        if (missingFields.includes('diagnosisList')) parsed.diagnosisList = [];
    }
    
    // Ensure arrays are initialized
    parsed.diagnosisList = parsed.diagnosisList || [];
    parsed.medications = parsed.medications || [];
    parsed.examinations = parsed.examinations || [];
    
    generatedRecord.value = parsed as GeneratedRecord;
    console.log('[Voice] Medical record generated successfully');

  } catch (err: any) {
    console.error('[Voice] Processing failed:', err);
    showToast(`处理失败: ${err.message || err}`, 'error');
    setTimeout(() => {
        exitWork();
    }, 2000);
  }
};

const handleVoiceError = (err: any) => {
  showToast('录音出错: ' + err, 'error');
  exitWork();
};

import { invoke } from "@tauri-apps/api/core";

// ... existing code ...

const handleResultConfirm = async (record: GeneratedRecord) => {
    console.log('Confirmed record:', record);
    
    try {
        await invoke('complete_consultation', {
            result: {
                consultationId: currentPatient.value?.id || 'unknown',
                timestamp: Date.now(),
                ...record
            }
        });
        showToast('病历已生成并回传系统', 'success');
        await exitWork();
    } catch (e: any) {
        console.error('Failed to save result:', e);
        showToast('回传失败: ' + e, 'error');
    }
};

const cancelVoiceResult = async () => {
    await exitWork();
};

// 关闭风险提示界面

const closeRiskAlert = async () => {
  await exitWork();
};

const handleRiskExpand = async (expanded: boolean) => {
    console.log('[App] handleRiskExpand:', expanded);
    const h = expanded ? TARGET_CAPSULE_EXPANDED_H : TARGET_CAPSULE_H;
    
    // We reuse enterWorkMode to resize window smoothly
    // Since we are already in work mode, it should just trigger resize
    try {
        if (appWindow.value) {
            await smartExpand(TARGET_CAPSULE_W, h);
            await appWindow.value.setSize(new LogicalSize(TARGET_CAPSULE_W, h));
        }
    } catch (e) {
        console.error('Failed to resize for risk details:', e);
    }
};

// 等待窗口达到指定逻辑尺寸
const waitForWindowSize = async (logicalW: number, logicalH: number, timeout = 1000) => {
  if (!appWindow.value) return;
  console.time('Target: waitForWindowSize');
  let scale = 1;
  try {
    scale = await appWindow.value.scaleFactor();
  } catch {}
  const targetW = Math.round(logicalW * scale);
  const targetH = Math.round(logicalH * scale);
  const start = performance.now();
  
  while (performance.now() - start < timeout) {
    try {
      const size = await appWindow.value.innerSize();
      const reached = Math.abs(size.width - targetW) <= 10 && Math.abs(size.height - targetH) <= 10;
      if (reached) {
        console.timeEnd('Target: waitForWindowSize');
        return;
      }
    } catch {
      break;
    }
    await wait(16);
  }
  console.warn(`waitForWindowSize TIMEOUT after ${timeout}ms. Target: ${targetW}x${targetH}`);
  console.timeEnd('Target: waitForWindowSize');
};

// 监听状态变化并持久化
watch([isWorking, currentView], async () => {
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
    
    // 监听 Deep Link
    try {
      await onOpenUrl((urls) => {
        console.log('Deep link received:', urls);
        if (urls && urls.length > 0) {
          const url = urls[0];
          showToast(`收到外部调用: ${url}`, 'info');
          
          // Simple routing based on URL
          if (url.includes('voice-consultation')) {
             startVoiceInteraction();
          } else if (!isWorking.value) {
             enterWorkMode();
          }
        }
      });
    } catch (e) {
      console.warn('Failed to register deep link listener:', e);
    }

    // 初始化 store
    store = await load('.settings.dat');
    
    // 恢复应用状态
    // FORCE RESET: 始终以悬浮球模式启动，不恢复之前的展开状态，防止窗口位置/大小异常导致不可见
    try {
        // 仅恢复位置
        console.log('[App] Starting in default Floating Ball mode...');
        isWorking.value = false;
        currentView.value = 'chat';
        
        if (appWindow.value) {
            // 先设置大小，再设置位置
            await appWindow.value.setSize(new LogicalSize(TARGET_BALL_W, TARGET_BALL_H));
            await restoreWindowPosition();
            
            // 确保窗口可见
            await appWindow.value.show();
            await appWindow.value.setFocus();
        }
    } catch (err) {
      console.warn('初始化状态失败:', err);
      await restoreWindowPosition();
    }
    
    // 监听窗口移动结束，保存位置，并更新显示器信息
    unlistenMoved = await appWindow.value.listen('tauri://move', () => {
      isMoving.value = true;
      // 使用防抖保存，避免频繁写入
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        isMoving.value = false;
        saveWindowPosition();
        updateCurrentMonitor(); // Update monitor cache after move
      }, 500);
    });

    // Initial monitor update
    updateCurrentMonitor();

    // 监听窗口大小变化，防止异常缩小
    unlistenResize = await appWindow.value.listen('tauri://resize', async () => {
      if (isWorking.value && !transitioning.value && !exiting.value && appWindow.value) {
        // 使用防抖避免频繁调整
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(async () => {
          if (!isWorking.value) return;
          try {
            const size = await appWindow.value?.innerSize();
            if (size) {
              const targetW = currentView.value === 'consultation' ? TARGET_CONSULTATION_W : TARGET_WORK_W;
              const targetH = currentView.value === 'consultation' ? TARGET_CONSULTATION_H : TARGET_WORK_H;
              const scale = await appWindow.value?.scaleFactor() || 1;
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
  } catch (e) {
    console.warn("初始化窗口失败:", e);
  }
  // 监听 Rust 后端发出的窗口 hover 事件
  try {
    // 监听患者风险提示事件 (接诊服务)
    await listen<any>('show-patient-risks', async (event) => {
      console.log('Received patient risks request:', event.payload);
      const data = event.payload;
      
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
      // 360x80 matches VoiceCapsule size which looks good for this
      currentView.value = 'reception-capsule';
      if (!isWorking.value) {
        await enterWorkMode(TARGET_CAPSULE_W, TARGET_CAPSULE_H);
      } else {
        // Resize if already open
        enterWorkMode(TARGET_CAPSULE_W, TARGET_CAPSULE_H);
      }

      // If backend provided pre-calculated risks, use them immediately
      if (data.risks && data.risks.length > 0) {
        riskItems.value = data.risks;
        isRiskAnalyzing.value = false;
        return;
      }

      // Otherwise, trigger LLM analysis
      try {
        const risks = await analyzePatientRisks(data);
        console.log('LLM Risk Analysis Result:', risks);
        riskItems.value = risks || [];
      } catch (e) {
        console.error('Risk analysis error:', e);
        showToast('风险评估失败', 'error');
      } finally {
        isRiskAnalyzing.value = false;
        
        // If risks exist, show toast as well
        if (riskItems.value.length > 0) {
            showToast(`发现 ${riskItems.value.length} 项健康风险`, 'info');
        }
      }
    });

    await listen<any>('start-consultation', async (event) => {
      console.log('Received consultation request:', event.payload);
      // Validate: Must have active patient logic is good, but we should also allow starting fresh if needed
      // But typically we have reception flow first.
      
      const payload = event.payload || {};
      
      // Update/Merge Global Patient Context
      // This ensures we have the correct keys (naPi, sdSexText) for ConsultationPage
      currentPatient.value = {
          ...(currentPatient.value || {}),
          ...payload,
          // Fallbacks/Mappings if payload is missing strict keys but has loose keys
          naPi: payload.naPi || payload.name || currentPatient.value?.patientName || '未知',
          idPi: payload.idPi || payload.patientId || currentPatient.value?.patientId,
          ageText: payload.ageText || (currentPatient.value?.age ? `${currentPatient.value.age}岁` : ''),
          sdSexText: payload.sdSexText || (currentPatient.value?.gender === 'M' ? '男性' : '女性')
      };
      
      await openConsultation();
    });

    await listen<any>('stop-consultation', async () => {
      console.log('Received stop consultation request');
      // Force exit work mode regardless of current view
      if (isWorking.value) {
        // Optional: clear patient data? 
        // currentPatient.value = null; 
        await exitWork();
      }
    });

    // 监听语音接诊指令
    await listen<any>('start-voice-consultation', async () => {
        console.log('Received start voice consultation command');
        if (!currentPatient.value) {
            showToast('请先接诊患者', 'error');
            return;
        }
        await startVoiceInteraction();
    });

    unlistenHover = await listen<boolean>("hover-change", (event) => {
      // 仅在非工作模式下响应
      if (!isWorking.value) {
        isHovered.value = event.payload;
        if (!event.payload) {
          hoveredBtnIndex.value = -1; // 移出窗口时重置按钮 hover 状态
        }
      }
    });

    unlistenMousePos = await listen<{x: number, y: number}>("mouse-pos", async (event) => {
      if (!isWorking.value && isHovered.value && ringMenuRef.value) {
        // Rust 发送的是物理坐标，需要转换为 CSS 像素
        // 假设 scaleFactor 为 2 (Retina)，物理坐标 200 -> 逻辑坐标 100
        // 但注意：Tauri 的 cursor_position 是物理坐标，而 webview 也是基于 scale 缩放的
        // 我们需要获取当前的 devicePixelRatio
        const dpr = window.devicePixelRatio || 1;
        const logicalX = event.payload.x / dpr;
        const logicalY = event.payload.y / dpr;

        // 查找鼠标下的元素
        // 由于 elementFromPoint 是基于 viewport 的，我们需要确保坐标系匹配
        // Rust 发送的是相对于窗口左上角的坐标，这正是 clientX/clientY 在全屏 webview 中的行为
        
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
  } catch (e) {
    console.error("监听事件失败:", e);
  }
});

onUnmounted(() => {
  if (unlistenHover) unlistenHover();
  if (unlistenMousePos) unlistenMousePos();
  if (unlistenMoved) unlistenMoved();
  if (unlistenResize) unlistenResize();
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
  try {
    await exit(0);
  } catch (err) {
    console.error('退出应用失败:', err);
    // 降级方案
    if (appWindow.value) {
      await appWindow.value.close();
    }
  }
};

// 进入工作模式（展开窗口）
// 进入工作模式（展开窗口）
// 进入工作模式（展开窗口）
// 调整窗口大小的通用方法
const resizeWorkWindow = async (targetW: number, targetH: number) => {
  if (!appWindow.value) return;
  try {
    await appWindow.value.setResizable(true);
    await appWindow.value.setSize(new LogicalSize(targetW, targetH));
    await smartExpand(targetW, targetH);
    await waitForWindowSize(targetW, targetH);
  } catch (err) {
    console.warn('调整窗口大小失败:', err);
  }
};

const enterWorkMode = async (customW?: number, customH?: number) => {
  // 支持在工作模式下动态调整大小
  if (isWorking.value) {
    const targetW = customW ?? (currentView.value === 'consultation' ? TARGET_CONSULTATION_W : TARGET_WORK_W);
    const targetH = customH ?? (currentView.value === 'consultation' ? TARGET_CONSULTATION_H : TARGET_WORK_H);
    await resizeWorkWindow(targetW, targetH);
    return;
  }

  if (transitioning.value) return;
  transitioning.value = true;

  // Apply Always on Top config
  if (appWindow.value) {
    const saved = localStorage.getItem('ALWAYS_ON_TOP');
    const isAlwaysOnTop = saved === null || saved === 'true';
    await appWindow.value.setAlwaysOnTop(isAlwaysOnTop);
  }
  
  // 0. 尝试获取小球位置 (优先使用缓存)
  if (!lastBallPos.value && appWindow.value) {
    try {
      const pos = await appWindow.value.outerPosition();
      lastBallPos.value = { x: pos.x, y: pos.y };
    } catch (e) {
      console.error('Failed to record ball position:', e);
    }
  }

  // 支持自定义尺寸或根据视图类型确定
  const targetW = customW ?? (currentView.value === 'consultation' ? TARGET_CONSULTATION_W : TARGET_WORK_W);
  const targetH = customH ?? (currentView.value === 'consultation' ? TARGET_CONSULTATION_H : TARGET_WORK_H);

  // 1. 调整窗口大小
  await resizeWorkWindow(targetW, targetH);
  
  // 计算展开动画的原点 (从之前记录的小球位置展开)
  if (appWindow.value && lastBallPos.value) {
    try {
      const winPos = await appWindow.value.outerPosition();
      const scale = await appWindow.value.scaleFactor() || 1;
      
      // 计算收缩/展开的原点
      // 原点 = (小球X - 窗口X) + 小球半径中心(80)
      const originX = (lastBallPos.value.x - winPos.x) / scale + 80;
      const originY = (lastBallPos.value.y - winPos.y) / scale + 80;
      
      morphOrigin.value = `${originX}px ${originY}px`;
    } catch (e) {
      console.warn('计算展开原点失败:', e);
      morphOrigin.value = '80px 80px';
    }
  } else {
    morphOrigin.value = '80px 80px';
  }

  // 3. 触发面板展开动画 (Morph Expand)
  isWorking.value = true;
  
  // 4. 等待动画结束
  setTimeout(() => {
    transitioning.value = false;
  }, TRANSITION_MS);
};

// 收起/关闭处理：根据上下文决定是返回胶囊还是退出
const handleCollapse = async () => {
    // 如果处于问诊界面且有当前接诊患者，则收起到接待胶囊
    if (currentView.value === 'consultation' && currentPatient.value) {
        currentView.value = 'reception-capsule';
        // 确保风险提示的基本信息与当前患者一致 (UI同步)
        riskPatientName.value = currentPatient.value.name || currentPatient.value.naPi || '未知';
        riskPatientGender.value = (currentPatient.value.gender === 'F' || currentPatient.value.sdSexText === '女性') ? 'F' : 'M';
        riskPatientAge.value = parseInt(currentPatient.value.age || currentPatient.value.ageText || '0');
        
        // 恢复位置到小球原来的位置 (视觉连贯性)
        if (lastBallPos.value && appWindow.value) {
            try {
                await appWindow.value.setPosition(new PhysicalPosition(lastBallPos.value.x, lastBallPos.value.y));
            } catch (e) {
                console.warn('Failed to restore position for capsule:', e);
            }
        }

        await resizeWorkWindow(TARGET_CAPSULE_W, TARGET_CAPSULE_H);
    } else {
        await exitWork();
    }
};

const exitWork = async () => {
  if (!isWorking.value || transitioning.value || isMoving.value) return;
  
  // Restore Always on Top for ball mode
  if (appWindow.value) {
      await appWindow.value.setAlwaysOnTop(true);
  }

  transitioning.value = true;
  exiting.value = true;
  
  // 1. 计算偏移量 (Logical Pixels)
  if (appWindow.value && lastBallPos.value) {
    try {
      const winPos = await appWindow.value.outerPosition();
      const scale = await appWindow.value.scaleFactor() || 1;
      
      const dx = (lastBallPos.value.x - winPos.x) / scale;
      const dy = (lastBallPos.value.y - winPos.y) / scale;
      
      // 设置 ballOffset，让小球在视觉上直接出现在目标位置
      ballOffset.value = { x: dx, y: dy };
      
      // 计算收缩动画的原点，让窗口向小球目标位置收缩
      // 原点 = (小球X - 窗口X) + 小球半径中心(80)
      const originX = dx + 80;
      const originY = dy + 80;
      morphOrigin.value = `${originX}px ${originY}px`;
      
    } catch (e) {
      console.warn('计算小球偏移失败:', e);
      morphOrigin.value = '80px 80px';
    }
  } else {
    morphOrigin.value = '80px 80px';
  }

  // 2. 触发面板收缩动画 (Morph Shrink)
  isWorking.value = false;
  
  // 强制关闭 hover 状态，防止收缩过程中因鼠标位置导致环绕菜单闪现
  isHovered.value = false;
  
  // 3. 等待动画结束
  await wait(TRANSITION_MS);
  
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
      } else if (store) {
        const savedPos = await store.get<{x: number, y: number}>('window_pos');
        if (savedPos) {
          targetX = savedPos.x;
          targetY = savedPos.y;
          hasTarget = true;
        }
      }

      if (hasTarget) {
        // Step 2: 先移动窗口，再调整大小
        // 这样可以避免 "先缩小导致小球因 offset 处于窗口可视区外而被裁剪消失" 的问题
        
        // 开启 Resizable 以便后续调整大小
        await appWindow.value.setResizable(true);
        
        // 并发执行：窗口移动 + 小球归位
        // 利用透明窗口特性，先让窗口框架对齐目标位置，同时把小球拉回窗口左上角
        const movePromise = appWindow.value.setPosition(new PhysicalPosition(targetX, targetY));
        ballOffset.value = { x: 0, y: 0 };
        await movePromise;

        // Step 3: 移动到位后，再裁剪窗口大小
        // 此时小球已经在 (0,0)，缩小窗口只会切掉多余的透明区域，不会导致小球消失
        await appWindow.value.setSize(new LogicalSize(TARGET_BALL_W, TARGET_BALL_H));
        await appWindow.value.setResizable(false);

        // 二次校验位置 (针对 macOS 边缘情况)
        await wait(50);
        const currentPos = await appWindow.value.outerPosition();
        if (Math.abs(currentPos.x - targetX) > 10 || Math.abs(currentPos.y - targetY) > 10) {
           console.warn('Position mismatch detected, retrying restore...', currentPos, targetX, targetY);
           await appWindow.value.setPosition(new PhysicalPosition(targetX, targetY));
        }
      } else {
        // 如果没有目标位置，仅缩小
        await appWindow.value.setResizable(true);
        await appWindow.value.setSize(new LogicalSize(TARGET_BALL_W, TARGET_BALL_H));
        await appWindow.value.setResizable(false);
      }

      lastBallPos.value = null;
    } catch (err) {
      console.warn('恢复窗口状态失败:', err);
    }
  }
  
  // 5. 等待窗口大小响应
  await waitForWindowSize(TARGET_BALL_W, TARGET_BALL_H);
  
  // 6. 重置状态
  exiting.value = false;
  transitioning.value = false;
};
</script>

<template>
  <div class="state-layer">
    <Transition name="morph">
      <div v-show="!isWorking" class="ball-layer" :style="containerStyle">
        <div 
          class="ball-container" 
          :class="{ 'no-interaction': transitioning }"
          :style="ballStyle"
        >
          <!-- 环绕菜单 -->
          <div ref="ringMenuRef" class="ring-menu" :class="{ 'is-active': isHovered }">
            <button class="ring-btn top" :class="{ 'manual-hover': hoveredBtnIndex === 0 }" @click.stop="openChat" title="打开对话">
              <svg class="ring-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button class="ring-btn right" :class="{ 'manual-hover': hoveredBtnIndex === 1 }" @click.stop="openSettings" title="设置">
              <svg class="ring-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button class="ring-btn bottom" :class="{ 'manual-hover': hoveredBtnIndex === 2 }" @click.stop="handleExitApp" title="退出">
               <svg class="ring-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                <line x1="12" y1="2" x2="12" y2="12"></line>
              </svg>
            </button>
             <button class="ring-btn left" :class="{ 'manual-hover': hoveredBtnIndex === 3 }" @click.stop="openConsultation" title="智能问诊">
              <svg class="ring-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
          </div>
          
          <div
            class="floating-ball"
            tabindex="0"
            :class="{ 'is-focused': isFocused, 'is-hovered': isHovered }"
            @mousedown="handleMouseDown"
            @focus="handleFocus"
            @blur="handleBlur"
            @contextmenu.prevent
            @dblclick="openChat"
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
          :class="{ 'no-toolbar': currentView === 'risk-alert' || currentView === 'voice-interaction' || currentView === 'voice-result' || currentView === 'reception-capsule' }"
          :style="{ borderRadius: (currentView === 'voice-interaction' || currentView === 'reception-capsule') ? '40px' : '20px' }"
        >
          <!-- 工具栏 (risk-alert, voice-interaction, voice-result, reception-capsule 视图不显示) -->
          <div v-if="currentView !== 'risk-alert' && currentView !== 'voice-interaction' && currentView !== 'voice-result' && currentView !== 'reception-capsule'" class="assistant-toolbar" data-tauri-drag-region>
            <div class="toolbar-left" data-tauri-drag-region>
              <button v-if="currentView === 'settings'" class="icon-btn back-btn" @click="openChat" title="返回">
                 <svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M19 12H5M12 19l-7-7 7-7"/>
                 </svg>
              </button>
              <span class="assistant-title" data-tauri-drag-region>
                {{ 
                  currentView === 'chat' ? '智医助理' : 
                  (currentView === 'consultation' ? 
                    (currentPatient ? `智能问诊 - ${currentPatient.name}` : '智能问诊') : 
                    '系统设置') 
                }}
              </span>
            </div>
            <button class="icon-btn" aria-label="收起" title="收起" @click="handleCollapse">
              <svg class="toolbar-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <polyline points="6,10 12,16 18,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <ChatPanel v-if="currentView === 'chat'" />
          <ConsultationPage 
            v-else-if="currentView === 'consultation'" 
            @close="handleCollapse" 
            :initialPatientData="currentPatient"
          />
          <RiskAlertPanel
            v-else-if="currentView === 'risk-alert'"
            :patientName="riskPatientName"
            :gender="riskPatientGender"
            :age="riskPatientAge"
            :risks="riskItems"
            @close="closeRiskAlert"
            @confirm="closeRiskAlert"
          />
          <!-- Voice Interaction View -->
          <VoiceCapsule 
            v-else-if="currentView === 'voice-interaction'"
            @stop="handleVoiceStop"
            @error="handleVoiceError"
          />

          <!-- Reception Service (Risk) Capsule -->
          <ReceptionCapsule
            v-else-if="currentView === 'reception-capsule'"
            :patient-name="riskPatientName"
            :gender="riskPatientGender"
            :age="riskPatientAge"
            :risks="riskItems"
            :analyzing="isRiskAnalyzing"
            @close="closeRiskAlert"
            @toggle-expand="handleRiskExpand"
          />

          <!-- Voice Result View -->
          <VoiceConsultationResult
            v-else-if="currentView === 'voice-result'"
            :initialRecord="generatedRecord"
            :patientInfo="currentPatient"
            @confirm="handleResultConfirm"
            @cancel="cancelVoiceResult"
          />
          <SettingsPanel v-else />
        </div>
      </div>
    </Transition>
  </div>
  <div v-if="transitioning" class="transition-mask" />
  <Toast ref="toastRef" />
</template>

<style scoped>
.ball-container {
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute; /* 绝对定位锚定 */
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
  width: 56px; /* 进一步压缩球体，留出绝对安全的边距 */
  height: 56px;
  border-radius: 50%;
  background: transparent; /* 移除背景，让机器人图片直接显示 */
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
  user-select: none;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform, box-shadow;
  transform: translateZ(0);
  position: relative;
  z-index: 5;
  box-shadow: none; /* 移除阴影 */
  outline: none; /* 移除默认选中框 */
}

/* 环绕菜单层 */
.ring-menu {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

/* 双重保障：JS 驱动 (is-active) 或 CSS 原生 Hover 均可触发 */
.ring-menu.is-active {
  pointer-events: auto;
}

.floating-ball:hover,
.floating-ball.is-hovered {
  transform: scale(1.05);
}

/* 环绕菜单按钮基础样式 */
.ring-btn {
  position: absolute;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  color: var(--text-weak);
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.4);
  transition: all 0.3s var(--anim-ease);
}

.ring-menu.is-active .ring-btn {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}
.ring-btn:hover,
.ring-btn.manual-hover {
  background: #fff;
  color: var(--accent-strong);
  transform: scale(1.1) !important;
  box-shadow: 0 6px 14px rgba(121, 194, 255, 0.3);
}

.ring-icon { width: 18px; height: 18px; }

/* 按钮分布：安全距离 (18px)，确保在 160x160 窗口内完全舒展 */
.ring-btn.top { top: 18px; left: 50%; margin-left: -19px; }
.ring-btn.right { top: 50%; right: 18px; margin-top: -19px; }
.ring-btn.bottom { bottom: 18px; left: 50%; margin-left: -19px; }
.ring-btn.left { top: 50%; left: 18px; margin-top: -19px; }

/* 未激活时的收缩动画 
   逻辑：当菜单不在激活状态(is-active) 且 容器未被悬停(:hover) 时应用隐藏样式 
*/
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.top { transform: translateY(15px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.right { transform: translateX(-15px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.bottom { transform: translateY(-15px) scale(0.1); }
.ring-menu:not(.is-active):not(div:hover > *) .ring-btn.left { transform: translateX(15px) scale(0.1); }


/* 机器人图片模式下无需伪元素内发光 */

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
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  transition: transform 0.4s ease;
  pointer-events: none;
}

.floating-ball:hover .robot-avatar,
.floating-ball.is-hovered .robot-avatar {
  transform: scale(1.08);
}

.tooltip {
  /* 已移除 Tooltip，改用环绕菜单 */
  display: none;
}

</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 主题变量：现代简约 + 玻璃质感 */
:root {
  --accent: #79c2ff;
  --accent-strong: #4fa7ff;
  --panel-bg: #f9fcff; /* 更亮一点的背景 */
  --surface-glass: rgba(255, 255, 255, 0.65);
  --surface-glass-weak: rgba(255, 255, 255, 0.45);
  --text-strong: #1e293b;
  --text-weak: #475569;
  --anim-dur: 250ms;
  --anim-ease: cubic-bezier(0.25, 1, 0.5, 1); /* 平滑减速，无回弹/过冲 */
}

/* 层布局：两种状态层叠并交叉淡化 */
.state-layer {
  position: relative;
  width: 100%;
  height: 100%;
}
.ball-layer,
.assistant-layer {
  position: absolute;
  inset: 0;
}
.ball-layer {
  display: block;
  z-index: 2; /* 退出时圆球遮在面板上方 */
}
.assistant-layer { z-index: 1; }

/* Morph 动画定义 */
.morph-enter-active,
.morph-leave-active {
  transition: all var(--anim-dur) var(--anim-ease);
}

/* 面板进入前/离开后状态：缩小并定位到小球中心 */
.morph-enter-from.assistant-layer,
.morph-leave-to.assistant-layer {
  opacity: 0;
  /* 
     Scale 0.1: 缩小到 10%
     Translate: 微调位置，确保视觉上是从 (80,80) 展开 
     (实际 assistant-layer 是 inset:0 占满全屏的，这里只需要 scale 即可，origin 已设置为 80px 80px)
  */
  transform: scale(0.35); 
}

/* 小球进入前/离开后状态 */
.morph-enter-from.ball-layer,
.morph-leave-to.ball-layer {
  opacity: 0;
  transform: scale(0.5);
}

.assistant-container {
  width: 100%;
  height: 100%;
  border-radius: 20px;
  overflow: hidden;
  position: relative;
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  padding-top: 40px;
}

.assistant-container.no-toolbar {
  padding-top: 0;
}

.assistant-toolbar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: var(--text-strong);
  background: linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 100%);
  z-index: 10;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  margin-right: 4px;
}

.assistant-title {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: var(--text-strong);
  opacity: 0.9;
  text-shadow: 0 1px 2px rgba(255,255,255,0.8);
}

.assistant-container .icon-btn {
  -webkit-app-region: no-drag;
  appearance: none;
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-weak);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.assistant-container .icon-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.06);
  border-radius: 50%;
  opacity: 0;
  transform: scale(0.6);
  transition: all 0.2s ease;
}

.assistant-container .icon-btn:hover {
  color: #ef4444; /* 红色警告色 */
  transform: rotate(90deg); /* 趣味交互 */
}

.assistant-container .icon-btn:hover::before {
  opacity: 1;
  transform: scale(1);
}

.assistant-container .icon-btn:active {
  transform: rotate(90deg) scale(0.92);
}

.assistant-container .toolbar-icon {
  width: 20px;
  height: 20px;
  position: relative;
  z-index: 1;
}

/* 过渡遮罩，柔化窗口尺寸瞬变 */
.transition-mask {
  position: absolute;
  inset: 0;
  background: white; /* 简单白底遮罩，避免视觉干扰 */
  opacity: 0;
  pointer-events: none;
}
</style>
