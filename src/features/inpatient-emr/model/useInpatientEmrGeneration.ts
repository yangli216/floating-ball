import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { generateInpatientEmrPreviewStream } from '../api/inpatientEmrService';
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
  { key: 'patient', title: '获取患者基本信息', description: '住院登记、诊断和患者基础信息' },
  { key: 'orders', title: '获取医嘱信息', description: '当日住院医嘱与同组开立内容' },
  { key: 'temperature', title: '获取体温单数据', description: '体温、血压、呼吸、血氧等生命体征' },
  { key: 'template', title: '解析病历', description: '识别 data-id 字段和生成规则' },
  { key: 'generate', title: '病历生成中', description: '按字段规则生成医生审核草稿' },
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

    try {
      result.value = await generateInpatientEmrPreviewStream(request, updateStep, (partial) => {
        result.value = partial;
      });
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      const runningStep = steps.value.find((step) => step.status === 'running');
      updateStep({
        key: runningStep?.key || 'generate',
        status: 'error',
        detail: errorMessage.value,
      });
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

  async function writeBack(): Promise<void> {
    if (!result.value) return;
    isWritingBack.value = true;
    writebackStatus.value = 'pending';
    writebackMessage.value = '正在发送回写事件，等待 HIS 侧保存并回执';

    const request = result.value.request;
    const requestId = getRequestId(request);
    pendingWritebackRequestId.value = requestId;
    const fieldValues = pickAiGeneratedFieldValues(result.value);
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
      writebackStatus.value = 'success';
      writebackMessage.value = '已发送给 HIS，后续可通过 reference-feedback 回执更新保存结果';
    } catch (error) {
      writebackStatus.value = 'error';
      writebackMessage.value = error instanceof Error ? error.message : String(error);
      pendingWritebackRequestId.value = '';
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
      writebackStatus.value = 'success';
      writebackMessage.value = payload.message || 'HIS 已完成病历回填';
      pendingWritebackRequestId.value = '';
      return 'success';
    }

    if (payload.status === 'failed') {
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
  };
}
