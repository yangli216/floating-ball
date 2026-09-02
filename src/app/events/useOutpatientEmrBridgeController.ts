import { computed, shallowRef } from 'vue';
import { isSameOutpatientEmrAnalysisRequestSnapshot } from '@features/outpatient-emr/lib/outpatientEmrRequestIdentity';
import type { OutpatientEmrAnalysisRequest } from '@features/outpatient-emr/types';
import { useTauriEventListener } from '@shared/composables/useTauriEventListener';

export type OutpatientEmrBridgeNotify = (
  message: string,
  type?: 'success' | 'error' | 'info',
) => void;

export interface OutpatientEmrBridgeControllerOptions {
  openOutpatientEmr: () => Promise<void>;
  onCancelled?: () => void | Promise<void>;
  onCompleted?: () => void | Promise<void>;
  notify?: OutpatientEmrBridgeNotify;
  autoStart?: boolean;
}

function isExactNonEmptyString(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim();
}

function hasNonEmptyFact(value: unknown, visited: Set<object>): boolean {
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  return Array.isArray(value)
    ? value.some((item) => hasNonEmptyFact(item, visited))
    : Object.values(value).some((item) => hasNonEmptyFact(item, visited));
}

function hasStrictPatient(patient: unknown): boolean {
  if (patient === undefined || patient === null) return true;
  if (typeof patient !== 'object' || Array.isArray(patient)) return false;

  const allowedFields = new Set(['idPi', 'name', 'sdSexText', 'ageText']);
  return Object.entries(patient).every(([key, value]) => (
    allowedFields.has(key)
    && typeof value === 'string'
    && value === value.trim()
  ));
}

function hasRequiredRequestFields(
  request: OutpatientEmrAnalysisRequest | null | undefined,
): request is OutpatientEmrAnalysisRequest {
  return Boolean(
    request
    && isExactNonEmptyString(request.visitId)
    && isExactNonEmptyString(request.templateId)
    && isExactNonEmptyString(request.requestId)
    && isExactNonEmptyString(request.templateName)
    && typeof request.templateHtml === 'string'
    && request.templateHtml.trim().length > 0
    && typeof request.templateDefinition === 'string'
    && request.templateDefinition.trim().length > 0
    && Array.isArray(request.targetFieldIds)
    && request.targetFieldIds.length > 0
    && request.targetFieldIds.every((fieldId) => (
      isExactNonEmptyString(fieldId)
    ))
    && new Set(request.targetFieldIds).size === request.targetFieldIds.length
    && request.recordContext
    && typeof request.recordContext === 'object'
    && !Array.isArray(request.recordContext)
    && hasNonEmptyFact(request.recordContext, new Set<object>())
    && hasStrictPatient(request.patient),
  );
}

function isSameRequestId(
  current: OutpatientEmrAnalysisRequest,
  incoming: OutpatientEmrAnalysisRequest,
): boolean {
  return current.requestId === incoming.requestId;
}

/**
 * Owns the local Bridge event and shell-level task identity for outpatient EMR analysis.
 * Template analysis and writeback stay inside the outpatient-emr feature.
 */
export function useOutpatientEmrBridgeController(
  options: OutpatientEmrBridgeControllerOptions,
) {
  const activeRequest = shallowRef<OutpatientEmrAnalysisRequest | null>(null);

  async function handleStartAnalysis(
    incoming: OutpatientEmrAnalysisRequest | null | undefined,
  ): Promise<void> {
    if (!hasRequiredRequestFields(incoming)) {
      console.warn('[OutpatientEmrBridge] INVALID_REQUEST');
      options.notify?.('门诊模板分析请求缺少必填字段，无法打开分析页。', 'error');
      return;
    }

    const current = activeRequest.value;
    if (current && isSameRequestId(current, incoming)) {
      if (!isSameOutpatientEmrAnalysisRequestSnapshot(current, incoming)) {
        console.warn('[OutpatientEmrBridge] REQUEST_ID_CONFLICT', {
          visitMatches: current.visitId === incoming.visitId,
          templateMatches: current.templateId === incoming.templateId,
          templateHtmlMatches: current.templateHtml === incoming.templateHtml,
          templateDefinitionMatches: current.templateDefinition === incoming.templateDefinition,
        });
        options.notify?.('门诊模板分析请求 ID 冲突，已保留当前任务。', 'error');
        return;
      }

      // Keep the original object so the page can restore its current draft instead of
      // retriggering analysis from a retried HTTP/SDK request.
      await options.openOutpatientEmr();
      return;
    }

    activeRequest.value = incoming;
    await options.openOutpatientEmr();
  }

  async function cancelAnalysis(): Promise<void> {
    if (!activeRequest.value) return;
    activeRequest.value = null;
    await options.onCancelled?.();
  }

  async function completeAnalysis(): Promise<void> {
    if (!activeRequest.value) return;
    activeRequest.value = null;
    await options.onCompleted?.();
  }

  useTauriEventListener<OutpatientEmrAnalysisRequest>({
    eventName: 'start-outpatient-emr-analysis',
    handler: (event) => {
      void handleStartAnalysis(event.payload).catch((error) => {
        console.error('[OutpatientEmrBridge] Failed to open outpatient EMR analysis:', error);
        options.notify?.('门诊模板分析页打开失败，请稍后重试。', 'error');
      });
    },
    logContext: 'OutpatientEmrBridge',
    autoStart: options.autoStart,
  });

  return {
    activeRequest: computed(() => activeRequest.value),
    handleStartAnalysis,
    cancelAnalysis,
    completeAnalysis,
  };
}

export type OutpatientEmrBridgeController = ReturnType<typeof useOutpatientEmrBridgeController>;
