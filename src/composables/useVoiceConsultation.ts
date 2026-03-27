/**
 * 语音问诊业务逻辑 Composable
 *
 * 管理语音问诊的完整流程，包括：
 * - 语音识别处理
 * - LLM 病历生成
 * - 结果确认与提交
 * - 错误处理
 *
 * @module composables/useVoiceConsultation
 */

import { type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import type { ViewType } from '../constants/windowSizes';
import { WINDOW_SIZES } from '../constants/windowSizes';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { trackClick, trackError, trackRecommendationAction, startTimedOperation } from '../services/operationTracker';
import type { GeneratedRecord } from '../components/VoiceConsultationResult.vue';
import type { AppPatient } from '../types/appState';

/**
 * 语音问诊配置参数
 */
export interface VoiceConsultationOptions {
  /** Tauri 窗口实例引用 */
  appWindow: Ref<TauriWindow | null>;
  /** 当前视图 */
  currentView: Ref<ViewType>;
  /** 生成的病历记录 */
  generatedRecord: Ref<GeneratedRecord | null>;
  /** 当前患者信息 */
  currentPatient: Ref<AppPatient | null>;
  /** Toast 提示函数 */
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  /** 窗口管理 API */
  windowMgmt: {
    smartExpand: (width: number, height: number) => Promise<void>;
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
 *   generatedRecord,
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
    generatedRecord,
    currentPatient,
    showToast,
    windowMgmt,
    workMode,
  } = options;

  const { smartExpand } = windowMgmt;
  const { enterWorkMode, exitWork } = workMode;

  function resolveConsultationId(patient: AppPatient | null): string {
    return String(patient?.idPi || patient?.patientId || patient?.id || 'unknown');
  }

  // ========== 语音处理 ==========

  /**
   * 处理语音停止事件
   *
   * 流程：
   * 1. 切换到结果视图并调整窗口大小
   * 2. 调用 LLM 生成病历
   * 3. 解析并验证 JSON 结果
   * 4. 更新 generatedRecord
   *
   * @param audioBlob - 录音音频数据（当前未使用）
   * @param transcribedText - 转写后的文本
   */
  async function handleVoiceStop(audioBlob: Blob, transcribedText: string): Promise<void> {
    console.log('[VoiceConsultation] handleVoiceStop received blob:', audioBlob?.size, 'bytes');
    console.log('[VoiceConsultation] Transcribed text:', transcribedText);

    generatedRecord.value = null; // Reset
    currentView.value = 'voice-result';

    // Explicitly resize window for Result View
    if (appWindow.value) {
      try {
        await appWindow.value.setResizable(true);
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.RESULT.width, WINDOW_SIZES.RESULT.height)
        );
        await smartExpand(WINDOW_SIZES.RESULT.width, WINDOW_SIZES.RESULT.height);
      } catch (e) {
        console.error('[VoiceConsultation] Failed to resize for result:', e);
      }
    } else {
      await enterWorkMode(WINDOW_SIZES.RESULT.width, WINDOW_SIZES.RESULT.height);
    }

    const finishVoiceLlm = startTimedOperation('voice_llm_processing');
    try {
      // Use the transcribed text directly from realtime service
      const text = transcribedText;
      console.log('[VoiceConsultation] Using realtime transcription:', text);

      if (!text || text.trim().length === 0) {
        throw new Error('未能识别到有效语音');
      }

      // 2. LLM Generation - Based on medical record requirements
      const messages: ChatMessage[] = [
        { role: 'system', content: PROMPTS.consultation.medicalRecordGeneration.system },
        { role: 'user', content: PROMPTS.consultation.medicalRecordGeneration.buildUserPrompt(text) },
      ];

      console.log('[VoiceConsultation] Sending request to LLM...');
      console.log('[VoiceConsultation] Input text length:', text.length, 'chars');
      const llmStart = Date.now();
      const jsonStr = await chat(messages);
      console.log(`[VoiceConsultation] Response received in ${Date.now() - llmStart}ms`);
      console.log('[VoiceConsultation] Raw response:', jsonStr);

      // Try to parse JSON (handle potential markdown code blocks)
      let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
      // Also try to extract JSON from text if wrapped in other content
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }

      console.log('[VoiceConsultation] Cleaned JSON:', cleanJson);

      const parsed = JSON.parse(cleanJson);

      // Check if LLM detected irrelevant content
      if (parsed.error) {
        console.warn('[VoiceConsultation] Irrelevant content detected:', parsed.message);
        showToast(parsed.message || '输入内容与医疗问诊场景无关', 'error');
        setTimeout(() => {
          exitWork('cancelled');
        }, 2000);
        return;
      }

      // Validate required fields
      const requiredFields = ['chiefComplaint', 'historyOfPresentIllness', 'diagnosisList'];
      const missingFields = requiredFields.filter((f) => !parsed[f]);
      if (missingFields.length > 0) {
        console.warn('[VoiceConsultation] Missing required fields:', missingFields);
        // Fill with defaults
        if (missingFields.includes('chiefComplaint')) parsed.chiefComplaint = '未能识别';
        if (missingFields.includes('historyOfPresentIllness'))
          parsed.historyOfPresentIllness = '未能识别';
        if (missingFields.includes('diagnosisList')) parsed.diagnosisList = [];
      }

      // Ensure arrays are initialized
      parsed.diagnosisList = parsed.diagnosisList || [];
      parsed.medications = parsed.medications || [];
      parsed.examinations = parsed.examinations || [];
      parsed.labTests = parsed.labTests || [];
      parsed.procedures = parsed.procedures || [];

      generatedRecord.value = parsed as GeneratedRecord;
      console.log('[VoiceConsultation] Medical record generated successfully');
      finishVoiceLlm(true, {
        transcriptionLength: text.length,
        diagnosisCount: parsed.diagnosisList.length,
      });
    } catch (err: unknown) {
      console.error('[VoiceConsultation] Processing failed:', err);
      trackError('voice_processing_failed', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      finishVoiceLlm(false, { errorMessage: errMessage });
      showToast(`处理失败: ${errMessage}`, 'error');
      setTimeout(() => {
        exitWork('error');
      }, 2000);
    }
  }

  /**
   * 处理语音错误
   *
   * @param err - 错误信息
   */
  function handleVoiceError(err: unknown): void {
    trackError('voice_recording_error', err);
    showToast('录音出错: ' + err, 'error');
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
      await invoke('complete_consultation', {
        result: {
          consultationId: resolveConsultationId(currentPatient.value),
          timestamp: Date.now(),
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
    await exitWork('cancelled');
  }

  // ========== 导出 ==========

  return {
    handleVoiceStop,
    handleVoiceError,
    handleResultConfirm,
    cancelVoiceResult,
  };
}
