import { computed, shallowRef, watch, type Ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import { getPatientContextAnchorId } from '@/utils/patientContext';
import {
  buildVoiceOutpatientEmrPatientInput,
  buildVoiceOutpatientEmrRecordContext,
  isPreparedOutpatientEmrWritebackPayload,
  resolveVoiceOutpatientEmrStartContext,
} from '../lib/voiceOutpatientEmr';
import type {
  OutpatientEmrAnalysisRequest,
  OutpatientEmrPreparedWritebackPayload,
  VoiceOutpatientEmrStartContext,
} from '../types';

export interface VoiceOutpatientEmrWorkflowOptions {
  currentPatient: Ref<AppPatient | null>;
  startAnalysis: (request: OutpatientEmrAnalysisRequest) => Promise<void>;
  notify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function useVoiceOutpatientEmrWorkflow(
  options: VoiceOutpatientEmrWorkflowOptions,
) {
  const startContext = shallowRef<VoiceOutpatientEmrStartContext | null>(null);
  const baseWritebackPayload = shallowRef<OutpatientEmrPreparedWritebackPayload | null>(null);
  const analysisRequestId = shallowRef('');

  function clear(): void {
    startContext.value = null;
    baseWritebackPayload.value = null;
    analysisRequestId.value = '';
  }

  function prepareFromStartVoice(payload: unknown): boolean {
    const resolution = resolveVoiceOutpatientEmrStartContext(payload);
    if (resolution.kind === 'none') {
      clear();
      return true;
    }
    if (resolution.kind === 'invalid') {
      clear();
      options.notify?.(resolution.message, 'error');
      return false;
    }
    const currentVisitId = getPatientContextAnchorId(options.currentPatient.value);
    if (currentVisitId !== resolution.context.visitId) {
      clear();
      options.notify?.('动态门诊模板与当前接诊就诊不一致，已拒绝启动语音问诊。', 'error');
      return false;
    }
    startContext.value = resolution.context;
    baseWritebackPayload.value = null;
    analysisRequestId.value = '';
    return true;
  }

  async function handleWritebackPrepared(payload: unknown): Promise<boolean> {
    const context = startContext.value;
    if (!context) return false;
    if (!isPreparedOutpatientEmrWritebackPayload(
      payload,
      context.visitId,
      context.template.requestId,
    )) {
      options.notify?.('语音问诊回写快照与当前动态模板任务不匹配。', 'error');
      return false;
    }

    try {
      const patient = options.currentPatient.value;
      const request: OutpatientEmrAnalysisRequest = {
        visitId: context.visitId,
        templateId: context.template.templateId,
        templateName: context.template.templateName,
        templateHtml: context.template.templateHtml,
        templateDefinition: context.template.templateDefinition,
        targetFieldIds: [...context.template.targetFieldIds],
        recordContext: buildVoiceOutpatientEmrRecordContext(payload),
        patient: buildVoiceOutpatientEmrPatientInput({
          idPi: patient?.idPi || patient?.patientId,
          name: patient?.naPi || patient?.patientName,
          sdSexText: patient?.sdSexText || patient?.genderText,
          ageText: patient?.ageText,
        }),
        requestId: context.template.requestId,
      };
      baseWritebackPayload.value = payload;
      analysisRequestId.value = request.requestId;
      await options.startAnalysis(request);
      return true;
    } catch (error) {
      baseWritebackPayload.value = null;
      analysisRequestId.value = '';
      options.notify?.(
        error instanceof Error ? error.message : String(error),
        'error',
      );
      return false;
    }
  }

  function resolveBaseWritebackPayload(
    request: OutpatientEmrAnalysisRequest | null,
  ): OutpatientEmrPreparedWritebackPayload | null {
    if (!request || request.requestId !== analysisRequestId.value) return null;
    return baseWritebackPayload.value;
  }

  watch(
    () => getPatientContextAnchorId(options.currentPatient.value),
    (visitId) => {
      if (startContext.value && visitId !== startContext.value.visitId) clear();
    },
  );

  return {
    hasTemplateContinuation: computed(() => Boolean(startContext.value)),
    deferredWritebackRequestId: computed(() => startContext.value?.template.requestId || ''),
    baseWritebackPayload: computed(() => baseWritebackPayload.value),
    prepareFromStartVoice,
    handleWritebackPrepared,
    resolveBaseWritebackPayload,
    clear,
  };
}

export type VoiceOutpatientEmrWorkflow = ReturnType<typeof useVoiceOutpatientEmrWorkflow>;
