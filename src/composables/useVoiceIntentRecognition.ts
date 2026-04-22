/**
 * 语音意图识别 Composable
 *
 * 处理流程: ASR 转写文本 → LLM 意图识别 → 结构化提取 → 医疗数据匹配
 * 处理模式: 句段批处理（录制停止后一次性处理）
 */

import { ref } from 'vue';
import { chat, type ChatMessage } from '../services/llm';
import { isTestModeEnabled } from '../services/aliyunSpeech';
import { medicalDataService } from '../services/medicalData';
import {
  PROMPTS,
  type VoiceExtractionResult,
  type VoiceRecordDraft,
  type TreatmentHint,
  type DiagnosisHint,
} from '../prompts';
import { trackError, startTimedOperation } from '../services/operationTracker';

/** Mock 模式下缓存的意图识别结果，避免重复调用 LLM */
let cachedTestModeTranscript = '';
let cachedTestModeResult: VoiceIntentResult | null = null;

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
  allergyHistory: string;
  currentMedicationHistory: string;
  symptoms: string[];
  negativeSymptoms: string[];
  diagnoses: MatchedDiagnosis[];
  treatments: MatchedTreatment[];
  treatmentPlan: string;
  healthEducation: string;
}

interface NormalizedVoiceExtractionResult {
  recordDraft: VoiceRecordDraft;
  diagnosisHints: DiagnosisHint[];
  treatmentHints: TreatmentHint[];
  error: boolean;
  message?: string;
}

interface VoiceIntentDebugSnapshot {
  transcript: string;
  rawOutput?: string;
  normalizedExtraction?: NormalizedVoiceExtractionResult;
  result?: VoiceIntentResult;
  matchedDiagnoses?: MatchedDiagnosis[];
  matchedTreatments?: MatchedTreatment[];
  excludedTreatments?: Array<{ treatment: MatchedTreatment; reason: 'conditional' | 'historical-self-medication' }>;
  repairUsed?: boolean;
  fromCache?: boolean;
  errorMessage?: string;
}

interface TreatmentSegregationResult {
  currentTreatments: MatchedTreatment[];
  deferredPlanNotes: string[];
  historicalMedicationNotes: string[];
  excludedTreatments: Array<{ treatment: MatchedTreatment; reason: 'conditional' | 'historical-self-medication' }>;
}

interface ParsedVoiceExtractionResult {
  payload: VoiceExtractionResult | null;
  issues: string[];
}

let cachedTestModeDebugSnapshot: VoiceIntentDebugSnapshot | null = null;

function publishVoiceIntentDebug(snapshot: VoiceIntentDebugSnapshot): void {
  const debugHost = globalThis as typeof globalThis & {
    __voiceIntentDebug__?: VoiceIntentDebugSnapshot;
  };

  debugHost.__voiceIntentDebug__ = snapshot;

  console.groupCollapsed('[VoiceIntent] Debug snapshot');
  console.log('Transcript:', snapshot.transcript);
  if (snapshot.rawOutput) {
    console.log('Raw LLM output:', snapshot.rawOutput);
  }
  if (snapshot.normalizedExtraction) {
    console.log('Normalized extraction:', snapshot.normalizedExtraction);
  }
  if (snapshot.matchedDiagnoses) {
    console.log('Matched diagnoses:', snapshot.matchedDiagnoses);
  }
  if (snapshot.matchedTreatments) {
    console.log('Matched treatments:', snapshot.matchedTreatments);
  }
  if (snapshot.result) {
    console.log('Voice intent result:', snapshot.result);
  }
  if (snapshot.errorMessage) {
    console.warn('Voice intent error:', snapshot.errorMessage);
  }
  if (snapshot.fromCache) {
    console.info('Snapshot source: test-mode cache');
  }
  console.groupEnd();
}

function getText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getText(item))
    .filter(Boolean);
}

function getHintSourceType(value: unknown): 'explicit' | 'inferred' | 'uncertain' {
  if (value === 'explicit' || value === 'inferred' || value === 'uncertain') {
    return value;
  }

  return 'explicit';
}

function appendNegativeSymptoms(historyOfPresentIllness: string, negativeSymptoms: string[]): string {
  if (negativeSymptoms.length === 0) {
    return historyOfPresentIllness;
  }

  const missingNegativeSymptoms = negativeSymptoms.filter((item) => !historyOfPresentIllness.includes(item));
  if (missingNegativeSymptoms.length === 0) {
    return historyOfPresentIllness;
  }

  const negativeSentence = `否认${missingNegativeSymptoms.join('、')}。`;
  if (!historyOfPresentIllness) {
    return negativeSentence;
  }

  return `${historyOfPresentIllness.replace(/[。；;，,\s]*$/u, '')}。${negativeSentence}`;
}

function composePastMedicalHistory(recordDraft: VoiceRecordDraft): string {
  const pastMedicalHistory = getText(recordDraft.pastMedicalHistory);
  const allergyHistory = getText(recordDraft.allergyHistory);
  const currentMedicationHistory = getText(recordDraft.currentMedicationHistory);
  const sections: string[] = [];

  if (pastMedicalHistory) {
    sections.push(/^既往史[:：]/u.test(pastMedicalHistory) ? pastMedicalHistory : `既往史：${pastMedicalHistory}`);
  }

  if (allergyHistory) {
    sections.push(/^过敏史[:：]/u.test(allergyHistory) ? allergyHistory : `过敏史：${allergyHistory}`);
  }

  if (currentMedicationHistory) {
    sections.push(/^(长期用药|现用药|当前用药)[:：]/u.test(currentMedicationHistory)
      ? currentMedicationHistory
      : `长期用药：${currentMedicationHistory}`);
  }

  if (sections.length === 0) {
    return '无特殊';
  }

  return sections.join('；');
}

function normalizeDiagnosisHints(hints: DiagnosisHint[] | undefined): DiagnosisHint[] {
  if (!Array.isArray(hints)) {
    return [];
  }

  return hints
    .map((hint) => ({
      ...hint,
      name: getText(hint?.name),
      code: getText(hint?.code),
      evidenceText: getText(hint?.evidenceText),
      sourceType: getHintSourceType(hint?.sourceType),
      rationale: getText(hint?.rationale),
      confidence: hint?.confidence === 'high' || hint?.confidence === 'medium' || hint?.confidence === 'low'
        ? hint.confidence
        : undefined,
    }))
    .filter((hint) => hint.name);
}

function normalizeTreatmentHints(hints: TreatmentHint[] | undefined): TreatmentHint[] {
  if (!Array.isArray(hints)) {
    return [];
  }

  return hints
    .map((hint) => ({
      ...hint,
      name: getText(hint?.name),
      text: getText(hint?.text),
      evidenceText: getText(hint?.evidenceText || hint?.text),
      sourceType: getHintSourceType(hint?.sourceType),
      goal: getText(hint?.goal),
      spec: getText(hint?.spec),
      dosage: getText(hint?.dosage),
      dosageUnit: getText(hint?.dosageUnit),
      frequency: getText(hint?.frequency),
      frequencyKey: getText(hint?.frequencyKey),
      usage: getText(hint?.usage),
      usageKey: getText(hint?.usageKey),
      totalQty: getText(hint?.totalQty),
      totalUnit: getText(hint?.totalUnit),
      days: getText(hint?.days),
    }))
    .filter((hint) => hint.name);
}

function normalizeSentence(value: string): string {
  return value.trim().replace(/[。；;，,\s]+$/u, '');
}

function getTreatmentEvidenceCorpus(hint: Pick<TreatmentHint, 'name' | 'evidenceText' | 'text' | 'goal'>): string {
  return normalizeSentence([hint.name, hint.evidenceText, hint.text, hint.goal].filter(Boolean).join(' '));
}

function isConditionalTreatmentHint(hint: TreatmentHint): boolean {
  const corpus = getTreatmentEvidenceCorpus(hint);
  return /如果|若|待|查完|结果出来|结果回报|明确后|必要时|再用|再考虑|细菌感染就|病毒感染就|视情况/u.test(corpus);
}

function isHistoricalSelfMedicationHint(hint: TreatmentHint): boolean {
  const corpus = getTreatmentEvidenceCorpus(hint);
  return /吃了|已服用|已经服用|自行服用|自服|服用过|在家服用|院外已用/u.test(corpus);
}

function buildDeferredTreatmentNote(hint: TreatmentHint): string {
  const corpus = getTreatmentEvidenceCorpus(hint);
  if (/血常规|CRP|C反应蛋白|检验结果|化验结果|感染性质|细菌感染/u.test(corpus)) {
    return `待检验结果明确感染性质后，再评估是否使用${hint.name}`;
  }

  return `视后续病情评估结果，再决定是否使用${hint.name}`;
}

function buildHistoricalMedicationNote(hint: TreatmentHint): string {
  return `院外曾自行使用${hint.name}`;
}

function mergeNarrative(base: string, additions: string[]): string {
  const uniqueAdditions = additions
    .map((item) => normalizeSentence(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

  if (uniqueAdditions.length === 0) {
    return base;
  }

  const normalizedBase = normalizeSentence(base || '');
  const preservedBase = !normalizedBase || normalizedBase === '无特殊' ? '' : normalizedBase;
  const segments = [preservedBase, ...uniqueAdditions].filter(Boolean);
  return segments.length > 0 ? segments.join('；') : '无特殊';
}

function segregateTreatmentHints(hints: MatchedTreatment[]): TreatmentSegregationResult {
  return hints.reduce<TreatmentSegregationResult>((acc, hint) => {
    if (hint.type !== 'medicine') {
      acc.currentTreatments.push(hint);
      return acc;
    }

    if (isHistoricalSelfMedicationHint(hint)) {
      acc.historicalMedicationNotes.push(buildHistoricalMedicationNote(hint));
      acc.excludedTreatments.push({ treatment: hint, reason: 'historical-self-medication' });
      return acc;
    }

    if (isConditionalTreatmentHint(hint)) {
      acc.deferredPlanNotes.push(buildDeferredTreatmentNote(hint));
      acc.excludedTreatments.push({ treatment: hint, reason: 'conditional' });
      return acc;
    }

    acc.currentTreatments.push(hint);
    return acc;
  }, {
    currentTreatments: [],
    deferredPlanNotes: [],
    historicalMedicationNotes: [],
    excludedTreatments: [],
  });
}

function normalizeVoiceExtraction(parsed: VoiceExtractionResult): NormalizedVoiceExtractionResult {
  const recordDraft: VoiceRecordDraft = {
    chiefComplaint: getText(parsed.recordDraft?.chiefComplaint || parsed.chiefComplaint),
    historyOfPresentIllness: getText(parsed.recordDraft?.historyOfPresentIllness || parsed.historyOfPresentIllness),
    pastMedicalHistory: getText(parsed.recordDraft?.pastMedicalHistory || parsed.pastMedicalHistory) || '无特殊',
    allergyHistory: getText(parsed.recordDraft?.allergyHistory || parsed.allergyHistory) || '无特殊',
    currentMedicationHistory: getText(parsed.recordDraft?.currentMedicationHistory || parsed.currentMedicationHistory) || '无特殊',
    symptoms: getTextList(parsed.recordDraft?.symptoms || parsed.symptoms),
    negativeSymptoms: getTextList(parsed.recordDraft?.negativeSymptoms || parsed.negativeSymptoms),
    treatmentPlan: getText(parsed.recordDraft?.treatmentPlan || parsed.treatmentPlan),
    healthEducation: getText(parsed.recordDraft?.healthEducation || parsed.healthEducation),
  };

  recordDraft.historyOfPresentIllness = appendNegativeSymptoms(
    recordDraft.historyOfPresentIllness,
    recordDraft.negativeSymptoms || [],
  );

  return {
    recordDraft,
    diagnosisHints: normalizeDiagnosisHints(parsed.diagnosisHints),
    treatmentHints: normalizeTreatmentHints(parsed.treatmentHints),
    error: !!parsed.error,
    message: getText(parsed.message),
  };
}

function extractJsonCandidate(rawOutput: string): string {
  const cleaned = rawOutput.replace(/```json\n?|\n?```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : cleaned;
}

function validateVoiceExtractionPayload(payload: unknown): string[] {
  const issues: string[] = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['根节点必须是 JSON 对象'];
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error !== 'boolean') {
    issues.push('字段 error 必须是 boolean');
  }

  if (typeof record.message !== 'undefined' && typeof record.message !== 'string') {
    issues.push('字段 message 必须是 string');
  }

  const recordDraft = record.recordDraft;
  if (typeof recordDraft !== 'undefined') {
    if (!recordDraft || typeof recordDraft !== 'object' || Array.isArray(recordDraft)) {
      issues.push('字段 recordDraft 必须是对象');
    } else {
      const recordDraftObject = recordDraft as Record<string, unknown>;
      if (typeof recordDraftObject.chiefComplaint !== 'undefined' && typeof recordDraftObject.chiefComplaint !== 'string') {
        issues.push('recordDraft.chiefComplaint 必须是 string');
      }
      if (typeof recordDraftObject.historyOfPresentIllness !== 'undefined' && typeof recordDraftObject.historyOfPresentIllness !== 'string') {
        issues.push('recordDraft.historyOfPresentIllness 必须是 string');
      }
      if (typeof recordDraftObject.pastMedicalHistory !== 'undefined' && typeof recordDraftObject.pastMedicalHistory !== 'string') {
        issues.push('recordDraft.pastMedicalHistory 必须是 string');
      }
      if (typeof recordDraftObject.symptoms !== 'undefined' && !Array.isArray(recordDraftObject.symptoms)) {
        issues.push('recordDraft.symptoms 必须是数组');
      }
      if (typeof recordDraftObject.negativeSymptoms !== 'undefined' && !Array.isArray(recordDraftObject.negativeSymptoms)) {
        issues.push('recordDraft.negativeSymptoms 必须是数组');
      }
    }
  }

  const hasCompatibleLegacyFields =
    typeof record.chiefComplaint === 'string'
    || typeof record.historyOfPresentIllness === 'string'
    || typeof record.pastMedicalHistory === 'string'
    || Array.isArray(record.diagnosisHints)
    || Array.isArray(record.treatmentHints);

  if (typeof recordDraft === 'undefined' && !hasCompatibleLegacyFields && record.error !== true) {
    issues.push('缺少 recordDraft，也缺少兼容旧结构的病例字段');
  }

  if (typeof record.diagnosisHints !== 'undefined' && !Array.isArray(record.diagnosisHints)) {
    issues.push('字段 diagnosisHints 必须是数组');
  }

  if (Array.isArray(record.diagnosisHints)) {
    record.diagnosisHints.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push(`diagnosisHints[${index}] 必须是对象`);
        return;
      }

      if (typeof (item as Record<string, unknown>).name !== 'string') {
        issues.push(`diagnosisHints[${index}].name 必须是 string`);
      }
    });
  }

  if (typeof record.treatmentHints !== 'undefined' && !Array.isArray(record.treatmentHints)) {
    issues.push('字段 treatmentHints 必须是数组');
  }

  if (Array.isArray(record.treatmentHints)) {
    record.treatmentHints.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push(`treatmentHints[${index}] 必须是对象`);
        return;
      }

      const treatmentItem = item as Record<string, unknown>;
      if (typeof treatmentItem.type !== 'string') {
        issues.push(`treatmentHints[${index}].type 必须是 string`);
      }
      if (typeof treatmentItem.name !== 'string') {
        issues.push(`treatmentHints[${index}].name 必须是 string`);
      }
    });
  }

  return issues;
}

function parseVoiceExtractionPayload(rawOutput: string): ParsedVoiceExtractionResult {
  const jsonCandidate = extractJsonCandidate(rawOutput);

  try {
    const parsed = JSON.parse(jsonCandidate) as VoiceExtractionResult;
    const issues = validateVoiceExtractionPayload(parsed);
    return {
      payload: issues.length === 0 ? parsed : parsed,
      issues,
    };
  } catch (error) {
    const parseMessage = error instanceof Error ? error.message : String(error);
    return {
      payload: null,
      issues: [`JSON 解析失败: ${parseMessage}`],
    };
  }
}

async function repairVoiceExtractionPayload(
  transcribedText: string,
  rawOutput: string,
  issues: string[],
): Promise<VoiceExtractionResult> {
  const repairedOutput = await chat([
    { role: 'system', content: PROMPTS.consultation.voiceIntentRepair.system },
    {
      role: 'user',
      content: PROMPTS.consultation.voiceIntentRepair.buildUserPrompt({
        transcribedText,
        rawOutput,
        issues,
      }),
    },
  ]);

  const repairedParseResult = parseVoiceExtractionPayload(repairedOutput);
  if (!repairedParseResult.payload || repairedParseResult.issues.length > 0) {
    throw new Error(`语音结构化结果修复失败: ${repairedParseResult.issues.join('；')}`);
  }

  return repairedParseResult.payload;
}

async function parseOrRepairVoiceExtraction(
  transcribedText: string,
  rawOutput: string,
): Promise<{ payload: VoiceExtractionResult; repairUsed: boolean }> {
  const firstPass = parseVoiceExtractionPayload(rawOutput);
  if (firstPass.payload && firstPass.issues.length === 0) {
    return { payload: firstPass.payload, repairUsed: false };
  }

  console.warn('[VoiceIntent] Voice extraction payload invalid, attempting repair', {
    issues: firstPass.issues,
  });

  const repairedPayload = await repairVoiceExtractionPayload(
    transcribedText,
    rawOutput,
    firstPass.issues,
  );

  return { payload: repairedPayload, repairUsed: true };
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

    const normalizedText = text.trim();

    // Mock 模式下优先使用缓存结果
    if (isTestModeEnabled() && cachedTestModeResult && cachedTestModeTranscript === normalizedText) {
      console.log('[VoiceIntent] Test mode: returning cached result for current transcript');
      isProcessing.value = true;
      // 模拟短暂延迟，让 UI 能展示 loading 效果
      await new Promise(r => setTimeout(r, 600));
      result.value = cachedTestModeResult;
      if (cachedTestModeDebugSnapshot) {
        publishVoiceIntentDebug({
          ...cachedTestModeDebugSnapshot,
          fromCache: true,
        });
      }
      isProcessing.value = false;
      return cachedTestModeResult;
    }

    isProcessing.value = true;
    processingError.value = null;
    const finishTimer = startTimedOperation('voice_intent_recognition');
    let rawOutput = '';

    try {
      // Step 1: LLM 意图识别 + 结构化提取
      const messages: ChatMessage[] = [
        { role: 'system', content: PROMPTS.consultation.voiceIntentRecognition.system },
        { role: 'user', content: PROMPTS.consultation.voiceIntentRecognition.buildUserPrompt(text) },
      ];

      rawOutput = await chat(messages);
      const { payload: parsed, repairUsed } = await parseOrRepairVoiceExtraction(normalizedText, rawOutput);
      const normalizedExtraction = normalizeVoiceExtraction(parsed);

      if (normalizedExtraction.error) {
        processingError.value = normalizedExtraction.message || '无法识别有效的医疗内容';
        finishTimer(false, { errorMessage: normalizedExtraction.message });
        return null;
      }

      // Step 2: 匹配诊断提示到诊断数据库
      const matchedDiagnoses: MatchedDiagnosis[] = normalizedExtraction.diagnosisHints.map(
        (hint) => matchDiagnosisHint(hint)
      );

      // Step 3: 匹配治疗方案提示到医疗数据库
      const matchedTreatments: MatchedTreatment[] = normalizedExtraction.treatmentHints.map(
        (hint) => matchTreatmentHint(hint)
      );
      const segregatedTreatments = segregateTreatmentHints(matchedTreatments);

      const intentResult: VoiceIntentResult = {
        chiefComplaint: normalizedExtraction.recordDraft.chiefComplaint,
        historyOfPresentIllness: normalizedExtraction.recordDraft.historyOfPresentIllness,
        pastMedicalHistory: composePastMedicalHistory({
          ...normalizedExtraction.recordDraft,
          currentMedicationHistory: mergeNarrative(
            normalizedExtraction.recordDraft.currentMedicationHistory || '无特殊',
            segregatedTreatments.historicalMedicationNotes,
          ),
        }),
        allergyHistory: normalizedExtraction.recordDraft.allergyHistory || '无特殊',
        currentMedicationHistory: mergeNarrative(
          normalizedExtraction.recordDraft.currentMedicationHistory || '无特殊',
          segregatedTreatments.historicalMedicationNotes,
        ),
        symptoms: normalizedExtraction.recordDraft.symptoms || [],
        negativeSymptoms: normalizedExtraction.recordDraft.negativeSymptoms || [],
        diagnoses: matchedDiagnoses,
        treatments: segregatedTreatments.currentTreatments,
        treatmentPlan: mergeNarrative(
          normalizedExtraction.recordDraft.treatmentPlan || '',
          segregatedTreatments.deferredPlanNotes,
        ),
        healthEducation: normalizedExtraction.recordDraft.healthEducation || '',
      };

      result.value = intentResult;

      const debugSnapshot: VoiceIntentDebugSnapshot = {
        transcript: normalizedText,
        rawOutput,
        normalizedExtraction,
        result: intentResult,
        matchedDiagnoses,
        matchedTreatments,
        excludedTreatments: segregatedTreatments.excludedTreatments,
        repairUsed,
      };

      publishVoiceIntentDebug(debugSnapshot);

      // Mock 模式下缓存首次 LLM 结果
      if (isTestModeEnabled()) {
        cachedTestModeTranscript = normalizedText;
        cachedTestModeResult = intentResult;
        cachedTestModeDebugSnapshot = debugSnapshot;
        console.log('[VoiceIntent] Test mode: cached LLM result for current transcript');
      }

      finishTimer(true, {
        transcriptionLength: text.length,
        symptomCount: intentResult.symptoms.length,
        negativeSymptomCount: intentResult.negativeSymptoms.length,
        diagnosisHintCount: matchedDiagnoses.length,
        diagnosisMatchedCount: matchedDiagnoses.filter((d) => d.matchedItem).length,
        treatmentHintCount: matchedTreatments.length,
        matchedCount: matchedTreatments.filter((t) => t.matchedItem).length,
        repairUsed,
      });

      return intentResult;
    } catch (err: unknown) {
      trackError('voice_intent_recognition_failed', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      processingError.value = `意图识别失败: ${errMessage}`;
      publishVoiceIntentDebug({
        transcript: normalizedText,
        rawOutput,
        errorMessage: errMessage,
      });
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
