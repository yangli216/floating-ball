import {
  recordHisIntegrationLog,
  summarizeHisPayload,
  type HisIntegrationLogStatus,
} from '@/services/hisIntegrationLog';
import type {
  InpatientEmrEvidenceSummary,
  InpatientEmrGenerationRequest,
  InpatientEmrGenerationResult,
  InpatientEmrGenerationTrace,
  InpatientEmrTraceStageKey,
} from '../types';

export type InpatientEmrTraceLogPhase =
  | 'generation'
  | 'writeback-dispatch'
  | 'writeback-feedback';

function stageDuration(
  trace: InpatientEmrGenerationTrace,
  key: InpatientEmrTraceStageKey,
): number | undefined {
  return trace.stages.find((stage) => stage.key === key)?.durationMs;
}

function totalDuration(trace: InpatientEmrGenerationTrace): number | undefined {
  if (!trace.endedAt) return undefined;
  return Math.max(0, trace.endedAt - trace.startedAt);
}

function hasStageError(trace: InpatientEmrGenerationTrace): boolean {
  return trace.stages.some((stage) => stage.status === 'error');
}

function evidenceStatusSummary(summary: InpatientEmrEvidenceSummary): Record<string, unknown> {
  return {
    hisContext: {
      status: summary.hisContext.status,
      count: summary.hisContext.count,
      meta: summary.hisContext.meta,
    },
    outpatientRecord: {
      status: summary.outpatientRecord.status,
      count: summary.outpatientRecord.count,
      meta: summary.outpatientRecord.meta,
    },
    doctorSupplement: {
      status: summary.doctorSupplement.status,
      count: summary.doctorSupplement.count,
    },
    template: {
      status: summary.template.status,
      count: summary.template.count,
      meta: summary.template.meta,
    },
    aiGeneration: {
      status: summary.aiGeneration.status,
      count: summary.aiGeneration.count,
      meta: summary.aiGeneration.meta,
    },
  };
}

function traceStageSummary(trace: InpatientEmrGenerationTrace): Array<Record<string, unknown>> {
  return trace.stages.map((stage) => ({
    key: stage.key,
    title: stage.title,
    status: stage.status,
    durationMs: stage.durationMs,
    detail: stage.detail,
    meta: stage.meta,
  }));
}

function generationStatus(result: InpatientEmrGenerationResult): HisIntegrationLogStatus {
  if (result.evidenceSummary.aiGeneration.status === 'waiting') return 'pending';
  if (hasStageError(result.trace)) return 'business_error';
  return 'success';
}

function phaseOperation(phase: InpatientEmrTraceLogPhase): string {
  if (phase === 'writeback-dispatch') return 'inpatient-emr.writeback.dispatch';
  if (phase === 'writeback-feedback') return 'inpatient-emr.writeback.feedback';
  return 'inpatient-emr.generation.trace';
}

function phaseDuration(result: InpatientEmrGenerationResult, phase: InpatientEmrTraceLogPhase): number | undefined {
  if (phase === 'writeback-dispatch') return stageDuration(result.trace, 'writebackDispatch');
  if (phase === 'writeback-feedback') return stageDuration(result.trace, 'writebackFeedback');
  return totalDuration(result.trace);
}

function buildRequestSummary(result: InpatientEmrGenerationResult, phase: InpatientEmrTraceLogPhase): unknown {
  return buildRequestSummaryFromRequest(result.request, phase);
}

function buildRequestSummaryFromRequest(
  request: InpatientEmrGenerationRequest,
  phase: InpatientEmrTraceLogPhase,
): unknown {
  return summarizeHisPayload({
    phase,
    admissionId: request.admissionId,
    requestId: request.requestId,
    templateId: request.templateId,
    templateName: request.templateName,
    recordTime: request.recordTime,
    outpatientVisitId: request.outpatientVisitId,
    hasDoctorSupplement: Boolean(request.doctorSupplement?.trim()),
    doctorSupplementLength: request.doctorSupplement?.trim().length || 0,
    hasRequestHisContext: Boolean(request.hisContext),
  });
}

function buildResponseSummary(result: InpatientEmrGenerationResult, phase: InpatientEmrTraceLogPhase): unknown {
  const aiFieldCount = result.template.fields.filter((field) => field.aiSuitable).length;
  return summarizeHisPayload({
    phase,
    traceId: result.trace.traceId,
    totalDurationMs: totalDuration(result.trace),
    stageDurations: {
      hisContext: stageDuration(result.trace, 'hisContext'),
      outpatientRecord: stageDuration(result.trace, 'outpatientRecord'),
      templateResolve: stageDuration(result.trace, 'templateResolve'),
      aiFirstToken: stageDuration(result.trace, 'aiFirstToken'),
      aiGenerate: stageDuration(result.trace, 'aiGenerate'),
      writebackDispatch: stageDuration(result.trace, 'writebackDispatch'),
      writebackFeedback: stageDuration(result.trace, 'writebackFeedback'),
    },
    evidence: evidenceStatusSummary(result.evidenceSummary),
    stages: traceStageSummary(result.trace),
    fieldCount: result.template.fields.length,
    aiFieldCount,
    generatedFieldCount: Object.keys(result.fieldValues).length,
  });
}

export async function recordInpatientEmrTraceLog(
  result: InpatientEmrGenerationResult,
  phase: InpatientEmrTraceLogPhase,
  status?: HisIntegrationLogStatus,
  message?: string,
): Promise<void> {
  await recordHisIntegrationLog({
    traceId: result.trace.traceId,
    direction: 'outbound',
    operation: phaseOperation(phase),
    method: 'TRACE',
    path: 'features/inpatient-emr',
    status: status || generationStatus(result),
    durationMs: phaseDuration(result, phase),
    requestSummary: buildRequestSummary(result, phase),
    responseSummary: buildResponseSummary(result, phase),
    consultationId: result.request.admissionId,
    requestId: result.request.requestId,
    businessMessage: message,
  });
}

export async function recordInpatientEmrFailureTraceLog(
  request: InpatientEmrGenerationRequest,
  trace: InpatientEmrGenerationTrace,
  phase: InpatientEmrTraceLogPhase,
  message: string,
): Promise<void> {
  await recordHisIntegrationLog({
    traceId: trace.traceId,
    direction: 'outbound',
    operation: phaseOperation(phase),
    method: 'TRACE',
    path: 'features/inpatient-emr',
    status: 'error',
    durationMs: totalDuration(trace),
    requestSummary: buildRequestSummaryFromRequest(request, phase),
    responseSummary: summarizeHisPayload({
      phase,
      traceId: trace.traceId,
      totalDurationMs: totalDuration(trace),
      stageDurations: {
        hisContext: stageDuration(trace, 'hisContext'),
        outpatientRecord: stageDuration(trace, 'outpatientRecord'),
        templateResolve: stageDuration(trace, 'templateResolve'),
        aiFirstToken: stageDuration(trace, 'aiFirstToken'),
        aiGenerate: stageDuration(trace, 'aiGenerate'),
        writebackDispatch: stageDuration(trace, 'writebackDispatch'),
        writebackFeedback: stageDuration(trace, 'writebackFeedback'),
      },
      stages: traceStageSummary(trace),
      errorMessage: message,
    }),
    consultationId: request.admissionId,
    requestId: request.requestId,
    errorMessage: message,
  });
}
