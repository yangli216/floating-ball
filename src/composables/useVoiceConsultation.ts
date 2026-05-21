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
import type { ViewType } from '@/constants/windowSizes';
import { trackClick, trackError, trackRecommendationAction } from '@services/operationTracker';
import type { AppPatient } from '@/types/appState';
import {
  clearVoiceConsultationCacheById,
  hasVoiceConsultationCache,
  loadVoiceConsultationCacheEntry,
  persistVoiceConsultationCacheEntry,
  resolveVoiceConsultationId,
  useVoiceIntentRecognition,
  type VoiceConsultationCacheEntry,
  type VoiceIntentResult,
} from '@features/voice-consultation';
import {
  buildVoiceClinicalResultInput,
  type ClinicalResultInput,
} from '@features/clinical-result';
import { submitConsultationUserLog } from '@services/consultationUserLog';
import {
  getPatientContextAllergyHistory,
  getPatientContextCurrentMedicationHistory,
  getPatientContextPastMedicalHistory,
} from '@/utils/patientContext';

export {
  clearVoiceConsultationCache,
  getVoiceConsultationEditorSnapshot,
  hasVoiceConsultationCache,
  updateVoiceConsultationCache,
} from '@features/voice-consultation';
export type { VoiceEditorSnapshot } from '@features/voice-consultation';

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
    currentView,
    currentPatient,
    showToast,
    workMode,
  } = options;

  const { enterWorkMode, exitWork } = workMode;

  const intentRecognition = useVoiceIntentRecognition();
  const intentResult = ref<ClinicalResultInput | null>(null);
  /**
   * 当前 intentResult 的来源。
   * - 'llm'：本次刚刚由 LLM 解析的全新结果，不应叠加 editorSnapshot
   *   （快照属于上一次会话编辑痕迹，否则会污染新会话的诊断/治疗对应关系）
   * - 'cache'：从同就诊缓存恢复，需要叠加 editorSnapshot 还原医生编辑现场
   */
  const intentSource = ref<'llm' | 'cache' | null>(null);
  const isProcessingVoice = ref(false);
  let processingToken = 0;

  function currentConsultationId(): string {
    return resolveVoiceConsultationId(currentPatient.value);
  }

  function withConsultationId(extra?: Record<string, unknown>): Record<string, unknown> {
    return { consultationId: currentConsultationId(), ...extra };
  }

  function readCache(consultationId: string): VoiceConsultationCacheEntry | null {
    return loadVoiceConsultationCacheEntry(consultationId);
  }

  function writeCache(entry: VoiceConsultationCacheEntry): void {
    persistVoiceConsultationCacheEntry(entry);
    console.log('[VoiceConsultation] Cache persisted', {
      consultationId: entry.consultationId,
      savedAt: entry.savedAt,
      transcriptionLength: entry.transcribedText.length,
    });
  }

  function clearCache(consultationId?: string): void {
    if (!consultationId) {
      return;
    }
    clearVoiceConsultationCacheById(consultationId);
  }

  async function showIntentResult(result: VoiceIntentResult, source: 'llm' | 'cache'): Promise<void> {
    intentSource.value = source;
    intentResult.value = buildVoiceClinicalResultInput(result);
    currentView.value = 'voice-consultation';

    try {
      await enterWorkMode();
    } catch (e) {
      console.error('[VoiceConsultation] Failed to enter preferred voice-consultation size:', e);
    }

    console.log('[VoiceConsultation] Intent result applied', { source });
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
          consultationId: resolveVoiceConsultationId(currentPatient.value),
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
    intentSource.value = null;
    intentRecognition.clearTranscripts();
  }

  async function resumeCachedVoiceResult(): Promise<boolean> {
    const consultationId = resolveVoiceConsultationId(currentPatient.value);
    const cached = readCache(consultationId);

    if (!cached) {
      console.log('[VoiceConsultation] No cached voice result found', { consultationId });
      return false;
    }

    await showIntentResult(cached.intentResult, 'cache');
    showToast('已恢复上次未提交的语音病例解析结果', 'info');
    console.log('[VoiceConsultation] Restored cached voice result', {
      consultationId,
      savedAt: cached.savedAt,
    });
    return true;
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
      const normalizedText = transcribedText.trim();
      const consultationId = resolveVoiceConsultationId(currentPatient.value);
      void submitConsultationUserLog({
        consultationId,
        consultationType: 'voice',
        patient: currentPatient.value,
        speech: {
          text: normalizedText,
          audioBlob,
          mimeType: audioBlob?.type || 'audio/wav',
        },
      });
      const cached = readCache(consultationId);
      if (cached?.transcribedText === normalizedText) {
        console.log('[VoiceConsultation] Cache hit, skip LLM parsing', {
          consultationId,
          transcriptionLength: normalizedText.length,
        });
        isProcessingVoice.value = false;
        await showIntentResult(cached.intentResult, 'cache');
        return;
      }

      intentRecognition.clearTranscripts();
      intentRecognition.addTranscript(transcribedText);
      const result = await intentRecognition.processTranscript(transcribedText, {
        memoryContext: '',
        patientContext: {
          pastMedicalHistory: getPatientContextPastMedicalHistory(currentPatient.value) || null,
          allergyHistory: getPatientContextAllergyHistory(currentPatient.value) || null,
          currentMedicationHistory: getPatientContextCurrentMedicationHistory(currentPatient.value) || null,
        },
      });

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
      writeCache({
        consultationId,
        transcribedText: normalizedText,
        intentResult: result,
        savedAt: Date.now(),
      });
      await showIntentResult(result, 'llm');

      console.log('[VoiceConsultation] Intent recognition completed successfully');
    } catch (err: unknown) {
      if (currentToken !== processingToken) {
        return;
      }

      isProcessingVoice.value = false;
      console.error('[VoiceConsultation] Processing failed:', err);
      trackError('voice_processing_failed', err, withConsultationId());
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
    clearCache(resolveVoiceConsultationId(currentPatient.value));
    trackError('voice_recording_error', err, withConsultationId());
    showToast('录音出错: ' + err, 'error');
    await writeCancelledResult('录音出错: ' + err);
    exitWork('error');
  }

  // ========== 结果处理 ==========

  /**
   * 取消病历结果
   */
  async function cancelVoiceResult(): Promise<void> {
    trackClick('voice_result_cancel', withConsultationId());
    trackRecommendationAction('record', 'voice-record', 'rejected');
    resetVoiceSessionState();
    clearCache(resolveVoiceConsultationId(currentPatient.value));
    await writeCancelledResult('用户取消语音问诊结果');
    await exitWork('cancelled');
  }

  // ========== 导出 ==========

  return {
    intentResult,
    intentSource,
    isProcessingVoice,
    resetVoiceSessionState,
    resumeCachedVoiceResult,
    hasCachedVoiceResult: (patient?: AppPatient | null) => hasVoiceConsultationCache(patient ?? currentPatient.value),
    handleVoiceStop,
    handleVoiceError,
    cancelVoiceResult,
  };
}
