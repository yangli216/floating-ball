/**
 * 语音意图识别 Composable
 *
 * 处理流程: ASR 转写文本 → LLM 意图识别 → 结构化提取 → 医疗数据匹配
 * 处理模式: 句段批处理（录制停止后一次性处理）
 */

import { ref } from 'vue';
import { chat, type ChatMessage } from '../services/llm';
import { medicalDataService } from '../services/medicalData';
import {
  VoiceIntentRecognitionPrompt,
  type VoiceExtractionResult,
  type TreatmentHint,
  type DiagnosisHint,
} from '../prompts/voiceIntentPrompts';
import { trackError, startTimedOperation } from '../services/operationTracker';

export interface MatchedTreatment extends TreatmentHint {
  /** 匹配到的标准库项目 */
  matchedItem?: { id: string; name: string; spec?: string; code?: string } | null;
}

export interface MatchedDiagnosis extends DiagnosisHint {
  /** 匹配到的标准诊断库项目 */
  matchedItem?: { id: string; code: string; name: string } | null;
}

export interface VoiceIntentResult {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  symptoms: string[];
  diagnoses: MatchedDiagnosis[];
  treatments: MatchedTreatment[];
}

export function useVoiceIntentRecognition() {
  const isProcessing = ref(false);
  const processingError = ref<string | null>(null);
  const result = ref<VoiceIntentResult | null>(null);
  const rawTranscripts = ref<string[]>([]);

  function addTranscript(text: string) {
    if (text.trim()) {
      rawTranscripts.value.push(text.trim());
    }
  }

  function clearTranscripts() {
    rawTranscripts.value = [];
    result.value = null;
    processingError.value = null;
  }

  function getFullTranscript(): string {
    return rawTranscripts.value.join('\n');
  }

  async function processTranscript(transcribedText?: string): Promise<VoiceIntentResult | null> {
    const text = transcribedText || getFullTranscript();
    if (!text.trim()) {
      processingError.value = '未检测到有效语音内容';
      return null;
    }

    isProcessing.value = true;
    processingError.value = null;
    const finishTimer = startTimedOperation('voice_intent_recognition');

    try {
      // Step 1: LLM 意图识别 + 结构化提取
      const messages: ChatMessage[] = [
        { role: 'system', content: VoiceIntentRecognitionPrompt.system },
        { role: 'user', content: VoiceIntentRecognitionPrompt.buildUserPrompt(text) },
      ];

      const jsonStr = await chat(messages);
      let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanJson = jsonMatch[0];

      const parsed: VoiceExtractionResult = JSON.parse(cleanJson);

      if (parsed.error) {
        processingError.value = parsed.message || '无法识别有效的医疗内容';
        finishTimer(false, { errorMessage: parsed.message });
        return null;
      }

      // Step 2: 匹配诊断提示到诊断数据库
      const matchedDiagnoses: MatchedDiagnosis[] = (parsed.diagnosisHints || []).map(
        (hint) => matchDiagnosisHint(hint)
      );

      // Step 3: 匹配治疗方案提示到医疗数据库
      const matchedTreatments: MatchedTreatment[] = (parsed.treatmentHints || []).map(
        (hint) => matchTreatmentHint(hint)
      );

      const intentResult: VoiceIntentResult = {
        chiefComplaint: parsed.chiefComplaint || '',
        historyOfPresentIllness: parsed.historyOfPresentIllness || '',
        pastMedicalHistory: parsed.pastMedicalHistory || '无特殊',
        symptoms: parsed.symptoms || [],
        diagnoses: matchedDiagnoses,
        treatments: matchedTreatments,
      };

      result.value = intentResult;
      finishTimer(true, {
        transcriptionLength: text.length,
        symptomCount: intentResult.symptoms.length,
        diagnosisHintCount: matchedDiagnoses.length,
        diagnosisMatchedCount: matchedDiagnoses.filter((d) => d.matchedItem).length,
        treatmentHintCount: matchedTreatments.length,
        matchedCount: matchedTreatments.filter((t) => t.matchedItem).length,
      });

      return intentResult;
    } catch (err: unknown) {
      trackError('voice_intent_recognition_failed', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      processingError.value = `意图识别失败: ${errMessage}`;
      finishTimer(false, { errorMessage: errMessage });
      return null;
    } finally {
      isProcessing.value = false;
    }
  }

  function matchDiagnosisHint(hint: DiagnosisHint): MatchedDiagnosis {
    let matchedItem: MatchedDiagnosis['matchedItem'] = null;
    // Try matching by name first, then by code
    const matched = medicalDataService.matchDiagnosis(hint.name)
      || (hint.code ? medicalDataService.matchDiagnosis(hint.code) : null);
    if (matched) {
      matchedItem = { id: matched.id, code: matched.code, name: matched.name };
    }
    return { ...hint, matchedItem };
  }

  function matchTreatmentHint(hint: TreatmentHint): MatchedTreatment {
    let matchedItem: MatchedTreatment['matchedItem'] = null;

    switch (hint.type) {
      case 'medicine': {
        const medicine = medicalDataService.matchMedicine(hint.name);
        if (medicine) {
          matchedItem = { id: medicine.id, name: medicine.name, spec: medicine.spec };
        }
        break;
      }
      case 'examination': {
        const item = medicalDataService.matchExamItem(hint.name);
        if (item) {
          matchedItem = { id: item.id, name: item.name };
        }
        break;
      }
      case 'labTest': {
        const item = medicalDataService.matchLabTestItem(hint.name);
        if (item) {
          matchedItem = { id: item.id, name: item.name };
        }
        break;
      }
      case 'procedure': {
        const item = medicalDataService.matchProcedureItem(hint.name);
        if (item) {
          matchedItem = { id: item.id, name: item.name };
        }
        break;
      }
    }

    return { ...hint, matchedItem };
  }

  return {
    isProcessing,
    processingError,
    result,
    rawTranscripts,
    addTranscript,
    clearTranscripts,
    getFullTranscript,
    processTranscript,
  };
}
