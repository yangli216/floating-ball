import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { generateInpatientEmrPreviewStream } from '../api/inpatientEmrService';
import {
  cloneInpatientEmrTrace,
  createInpatientEmrTrace,
  finishInpatientEmrTrace,
  finishInpatientEmrTraceStage,
  startInpatientEmrTraceStage,
} from '../lib/inpatientEmrObservability';
import {
  recordInpatientEmrFailureTraceLog,
  recordInpatientEmrTraceLog,
} from './inpatientEmrTraceLog';
import type {
  InpatientEmrGenerationProgress,
  InpatientEmrGenerationRequest,
  InpatientEmrGenerationResult,
  InpatientEmrGenerationStep,
  InpatientEmrStepKey,
} from '../types';

export interface InpatientEmrReferenceFeedbackPayload {
  consultationId?: string;
  requestId?: string;
  status?: 'pending' | 'success' | 'failed';
  message?: string;
}

const STEP_DEFINITIONS: Array<Pick<InpatientEmrGenerationStep, 'key' | 'title' | 'description'>> = [
  { key: 'patient', title: '获取住院上下文', description: '获取本次文书所需 HIS 数据' },
  { key: 'orders', title: '整理诊疗摘要', description: '汇总诊断、医嘱、检验检查和治疗信息' },
  { key: 'temperature', title: '整理病历依据', description: '核对生命体征、历史病历、会诊和手术资料' },
  { key: 'template', title: '解析病历', description: '识别 data-id 字段和生成规则' },
  { key: 'generate', title: 'AI 生成', description: '按字段规则生成医生审核草稿' },
];

function createInitialSteps(): InpatientEmrGenerationStep[] {
  return STEP_DEFINITIONS.map((step) => ({
    ...step,
    status: 'pending',
    detail: '等待处理',
  }));
}

function getRequestId(request: InpatientEmrGenerationRequest): string {
  return request.requestId || `inpatient-emr-${Date.now()}`;
}

function buildEmrContent(result: InpatientEmrGenerationResult, values: Record<string, string>): string {
  const aiFields = result.template.fields.filter((field) => field.aiSuitable);
  const progressText = values.病程记录文本;
  if (progressText?.trim()) return progressText.trim();
  return aiFields
    .map((field) => values[field.id])
    .filter((value) => value?.trim())
    .join('\n\n');
}

function pickAiGeneratedFieldValues(result: InpatientEmrGenerationResult): Record<string, string> {
  const fieldIds = new Set(
    result.template.fields
      .filter((field) => field.aiSuitable)
      .map((field) => field.id),
  );
  const values: Record<string, string> = {};
  Object.entries(result.fieldValues).forEach(([fieldId, value]) => {
    if (fieldIds.has(fieldId)) {
      values[fieldId] = value;
    }
  });
  return values;
}

export function useInpatientEmrGeneration() {
  const steps = ref<InpatientEmrGenerationStep[]>(createInitialSteps());
  const currentRequest = ref<InpatientEmrGenerationRequest | null>(null);
  const result = ref<InpatientEmrGenerationResult | null>(null);
  const errorMessage = ref('');
  const isGenerating = ref(false);
  const isWritingBack = ref(false);
  const writebackMessage = ref('');
  const writebackStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle');
  const pendingWritebackRequestId = ref('');

  const activeStepKey = computed<InpatientEmrStepKey | null>(() => {
    return steps.value.find((step) => step.status === 'running')?.key || null;
  });

  const completedStepCount = computed(() => steps.value.filter((step) => step.status === 'done').length);

  function resetSteps(): void {
    steps.value = createInitialSteps();
  }

  function reset(): void {
    currentRequest.value = null;
    result.value = null;
    errorMessage.value = '';
    writebackMessage.value = '';
    writebackStatus.value = 'idle';
    pendingWritebackRequestId.value = '';
    isGenerating.value = false;
    isWritingBack.value = false;
    resetSteps();
  }

  function updateStep(progress: InpatientEmrGenerationProgress): void {
    steps.value = steps.value.map((step) => (
      step.key === progress.key
        ? { ...step, status: progress.status, detail: progress.detail || step.detail }
        : step
    ));
  }

  async function start(request: InpatientEmrGenerationRequest): Promise<void> {
    currentRequest.value = request;
    result.value = null;
    errorMessage.value = '';
    writebackMessage.value = '';
    writebackStatus.value = 'idle';
    pendingWritebackRequestId.value = '';
    isGenerating.value = true;
    resetSteps();
    const generationTrace = createInpatientEmrTrace(request.requestId);

    try {
      result.value = await generateInpatientEmrPreviewStream(request, updateStep, (partial) => {
        result.value = partial;
      }, generationTrace);
      void recordInpatientEmrTraceLog(result.value, 'generation');
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      finishInpatientEmrTrace(generationTrace);
      const runningStep = steps.value.find((step) => step.status === 'running');
      updateStep({
        key: runningStep?.key || 'generate',
        status: 'error',
        detail: errorMessage.value,
      });
      void recordInpatientEmrFailureTraceLog(request, generationTrace, 'generation', errorMessage.value);
      if (result.value) {
        void recordInpatientEmrTraceLog(result.value, 'generation', 'error', errorMessage.value);
      }
    } finally {
      isGenerating.value = false;
    }
  }

  function updateFieldValue(fieldId: string, content: string): void {
    if (!result.value) return;
    const fieldValues = {
      ...result.value.fieldValues,
      [fieldId]: content,
    };
    result.value.fieldValues = fieldValues;
    result.value.emrContent = buildEmrContent(result.value, fieldValues);
  }

  function syncResultTrace(): void {
    if (!result.value) return;
    result.value.trace = cloneInpatientEmrTrace(result.value.trace);
  }

  async function writeBack(): Promise<boolean> {
    if (!result.value) return false;
    const currentResult = result.value;
    isWritingBack.value = true;
    writebackStatus.value = 'pending';
    writebackMessage.value = '正在发送回写事件，等待 HIS 侧保存并回执';

    const baseRequest = currentResult.request;
    const requestId = getRequestId(baseRequest);
    currentResult.request = {
      ...baseRequest,
      requestId,
    };
    const request = currentResult.request;
    pendingWritebackRequestId.value = requestId;
    startInpatientEmrTraceStage(currentResult.trace, 'writebackDispatch', '正在发送回写事件', {
      requestId,
      admissionId: request.admissionId,
    });
    syncResultTrace();
    const fieldValues = pickAiGeneratedFieldValues(currentResult);
    const payload = {
      status: 'success',
      consultationId: request.admissionId,
      timestamp: Date.now(),
      resultType: 'record-confirmed',
      requestId,
      referenceType: 'batch',
      action: 'batch',
      referenceStatus: 'pending',
      referenceMessage: '等待 HIS 完成住院病历回填并回执。',
      emrType: 'inpatient-emr',
      admissionId: request.admissionId,
      templateName: request.templateName || '',
      fieldValues,
      sourceModule: 'inpatient-emr',
    };

    try {
      await invoke('complete_consultation', { result: payload });
      finishInpatientEmrTraceStage(currentResult.trace, 'writebackDispatch', 'success', '回写事件已发送', {
        requestId,
        fieldCount: Object.keys(fieldValues).length,
      });
      startInpatientEmrTraceStage(currentResult.trace, 'writebackFeedback', '等待 HIS reference-feedback 回执', {
        requestId,
      });
      syncResultTrace();
      void recordInpatientEmrTraceLog(currentResult, 'writeback-dispatch', 'pending', '已发送给 HIS，等待 reference-feedback 回执');
      writebackStatus.value = 'success';
      writebackMessage.value = '已发送给 HIS，后续可通过 reference-feedback 回执更新保存结果';
      return true;
    } catch (error) {
      finishInpatientEmrTraceStage(
        currentResult.trace,
        'writebackDispatch',
        'error',
        error instanceof Error ? error.message : String(error),
        { requestId },
      );
      syncResultTrace();
      void recordInpatientEmrTraceLog(
        currentResult,
        'writeback-dispatch',
        'error',
        error instanceof Error ? error.message : String(error),
      );
      writebackStatus.value = 'error';
      writebackMessage.value = error instanceof Error ? error.message : String(error);
      pendingWritebackRequestId.value = '';
      return false;
    } finally {
      isWritingBack.value = false;
    }
  }

  function applyReferenceFeedback(payload: InpatientEmrReferenceFeedbackPayload): 'success' | 'failed' | null {
    if (!result.value || !payload.status) return null;
    if (payload.consultationId && payload.consultationId !== result.value.request.admissionId) return null;
    if (
      pendingWritebackRequestId.value
      && payload.requestId
      && payload.requestId !== pendingWritebackRequestId.value
    ) {
      return null;
    }

    if (payload.status === 'success') {
      finishInpatientEmrTraceStage(result.value.trace, 'writebackFeedback', 'success', payload.message || 'HIS 已完成病历回填', {
        requestId: payload.requestId || pendingWritebackRequestId.value,
      });
      syncResultTrace();
      void recordInpatientEmrTraceLog(result.value, 'writeback-feedback', 'success', payload.message || 'HIS 已完成病历回填');
      writebackStatus.value = 'success';
      writebackMessage.value = payload.message || 'HIS 已完成病历回填';
      pendingWritebackRequestId.value = '';
      return 'success';
    }

    if (payload.status === 'failed') {
      finishInpatientEmrTraceStage(result.value.trace, 'writebackFeedback', 'error', payload.message || 'HIS 病历回填失败', {
        requestId: payload.requestId || pendingWritebackRequestId.value,
      });
      syncResultTrace();
      void recordInpatientEmrTraceLog(result.value, 'writeback-feedback', 'error', payload.message || 'HIS 病历回填失败');
      writebackStatus.value = 'error';
      writebackMessage.value = payload.message || 'HIS 病历回填失败，请调整后重试';
      pendingWritebackRequestId.value = '';
      return 'failed';
    }

    return null;
  }

  return {
    steps,
    currentRequest,
    result,
    errorMessage,
    isGenerating,
    isWritingBack,
    writebackMessage,
    writebackStatus,
    activeStepKey,
    completedStepCount,
    start,
    updateFieldValue,
    writeBack,
    applyReferenceFeedback,
    reset,
  };
}
