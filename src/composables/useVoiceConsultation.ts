/**
 * 语音问诊业务逻辑 Composable
 *
 * 管理语音问诊的完整流程，包括：
 * - 语音识别处理
 * - 意图识别与结构化提取
 * - 结果确认与提交
 * - 错误处理
 *
 * @module composables/useVoiceConsultation
 */

import { ref, type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import type { ViewType } from '../constants/windowSizes';
import { WINDOW_SIZES } from '../constants/windowSizes';
import { trackClick, trackError, trackRecommendationAction } from '../services/operationTracker';
import type { GeneratedRecord } from '../components/VoiceConsultationResult.vue';
import type { AppPatient } from '../types/appState';
import { useVoiceIntentRecognition, type VoiceIntentResult } from './useVoiceIntentRecognition';

/**
 * 语音问诊配置参数
 */
export interface VoiceConsultationOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** 当前视图 */
  currentView: Ref<ViewType>;
  /** 当前患者信息 */
  currentPatient: Ref<AppPatient | null>;
  /** Toast 提示函数 */
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  /** 窗口管理 API */
  windowMgmt: {
    smartExpand: (width: number, height: number) => Promise<void>;
    resizeWindowForView: (view: ViewType) => Promise<void>;
  };
  /** 工作模式 API */
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
    exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>;
  };
}

/**
 * 语音问诊业务逻辑 Composable
 *
 * @param options - 配置参数
 * @returns 语音问诊 API
 *
 * @example
 * ```typescript
 * const voiceConsultation = useVoiceConsultation({
 *   appWindow,
 *   currentView,
 *   currentPatient,
 *   showToast,
 *   windowMgmt,
 *   workMode,
 * });
 *
 * // 处理语音停止事件
 * await voiceConsultation.handleVoiceStop(audioBlob, transcribedText);
 *
 * // 确认并提交病历
 * await voiceConsultation.handleResultConfirm(record);
 * ```
 */
export function useVoiceConsultation(options: VoiceConsultationOptions) {
  const {
    appWindow,
    currentView,
    currentPatient,
    showToast,
    windowMgmt,
    workMode,
  } = options;

  const { resizeWindowForView } = windowMgmt;
  const { enterWorkMode, exitWork } = workMode;

  const intentRecognition = useVoiceIntentRecognition();
  const intentResult = ref<VoiceIntentResult | null>(null);
  const isProcessingVoice = ref(false);
  let processingToken = 0;

  function resolveConsultationId(patient: AppPatient | null): string {
    return String(patient?.idPi || patient?.patientId || patient?.id || 'unknown');
  }

  // ========== 语音处理 ==========

  /**
   * 处理语音停止事件
   *
   * 流程：
   * 1. 调用意图识别处理转写文本
   * 2. 保存意图识别结果
   * 3. 切换到语音问诊视图并调整窗口大小
   *
   * @param audioBlob - 录音音频数据（当前未使用）
   * @param transcribedText - 转写后的文本
   */
  /**
   * 写入取消/错误结果到后端，使 SDK 轮询能检测到终止信号
   */
  async function writeCancelledResult(reason: string): Promise<void> {
    try {
      await invoke('complete_consultation', {
        result: {
          consultationId: resolveConsultationId(currentPatient.value),
          timestamp: Date.now(),
          resultType: 'cancelled',
          requestId: `voice-cancelled-${Date.now()}`,
          reason,
        },
      });
      console.log('[VoiceConsultation] Cancelled result written to backend:', reason);
    } catch (e) {
      console.error('[VoiceConsultation] Failed to write cancelled result:', e);
    }
  }

  function resetVoiceSessionState(): void {
    processingToken += 1;
    isProcessingVoice.value = false;
    intentResult.value = null;
    intentRecognition.clearTranscripts();
  }

  async function handleVoiceStop(audioBlob: Blob, transcribedText: string): Promise<void> {
    console.log('[VoiceConsultation] handleVoiceStop received blob:', audioBlob?.size, 'bytes');
    console.log('[VoiceConsultation] Transcribed text:', transcribedText);

    if (!transcribedText?.trim()) {
      showToast('未识别到有效语音内容', 'error');
      return;
    }

    const currentToken = processingToken + 1;
    processingToken = currentToken;
    isProcessingVoice.value = true;
    try {
      intentRecognition.clearTranscripts();
      intentRecognition.addTranscript(transcribedText);
      const result = await intentRecognition.processTranscript(transcribedText);

      if (currentToken !== processingToken) {
        return;
      }

      if (!result) {
        isProcessingVoice.value = false;
        const errMsg = intentRecognition.processingError.value || '意图识别失败';
        showToast(errMsg, 'error');
        await writeCancelledResult(errMsg);
        setTimeout(() => {
          if (currentToken === processingToken) {
            exitWork('error');
          }
        }, 2000);
        return;
      }

      isProcessingVoice.value = false;
      intentResult.value = result;
      currentView.value = 'voice-consultation';

      // Resize window for Voice Consultation View
      if (appWindow.value) {
        try {
          await appWindow.value.setResizable(true);
          await resizeWindowForView('voice-consultation');
        } catch (e) {
          console.error('[VoiceConsultation] Failed to resize for voice-consultation:', e);
        }
      } else {
        await enterWorkMode(WINDOW_SIZES.VOICE_CONSULTATION.width, WINDOW_SIZES.VOICE_CONSULTATION.height);
      }

      console.log('[VoiceConsultation] Intent recognition completed successfully');
    } catch (err: unknown) {
      if (currentToken !== processingToken) {
        return;
      }

      isProcessingVoice.value = false;
      console.error('[VoiceConsultation] Processing failed:', err);
      trackError('voice_processing_failed', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      showToast(`处理失败: ${errMessage}`, 'error');
      await writeCancelledResult(`处理失败: ${errMessage}`);
      setTimeout(() => {
        if (currentToken === processingToken) {
          exitWork('error');
        }
      }, 2000);
    }
  }

  /**
   * 处理语音错误
   *
   * @param err - 错误信息
   */
  async function handleVoiceError(err: unknown): Promise<void> {
    resetVoiceSessionState();
    trackError('voice_recording_error', err);
    showToast('录音出错: ' + err, 'error');
    await writeCancelledResult('录音出错: ' + err);
    exitWork('error');
  }

  // ========== 结果处理 ==========

  /**
   * 确认并提交病历结果
   *
   * @param record - 生成的病历记录
   */
  async function handleResultConfirm(record: GeneratedRecord): Promise<void> {
    console.log('[VoiceConsultation] Confirmed record:', record);
    trackClick('voice_result_confirm');
    trackRecommendationAction('record', 'voice-record', 'adopted');

    try {
      const requestId = `voice-record-${Date.now()}`;
      await invoke('complete_consultation', {
        result: {
          consultationId: resolveConsultationId(currentPatient.value),
          timestamp: Date.now(),
          resultType: 'final-report',
          requestId,
          ...record,
        },
      });
      showToast('病历已生成并回传系统', 'success');
      await exitWork();
    } catch (e: unknown) {
      console.error('[VoiceConsultation] Failed to save result:', e);
      trackError('voice_result_submit_failed', e);
      showToast('回传失败: ' + e, 'error');
    }
  }

  /**
   * 取消病历结果
   */
  async function cancelVoiceResult(): Promise<void> {
    trackClick('voice_result_cancel');
    trackRecommendationAction('record', 'voice-record', 'rejected');
    resetVoiceSessionState();
    await writeCancelledResult('用户取消语音问诊结果');
    await exitWork('cancelled');
  }

  // ========== 导出 ==========

  return {
    intentResult,
    isProcessingVoice,
    resetVoiceSessionState,
    handleVoiceStop,
    handleVoiceError,
    handleResultConfirm,
    cancelVoiceResult,
  };
}
