import type {
  InpatientEmrGenerationTrace,
  InpatientEmrTraceStage,
  InpatientEmrTraceStageKey,
  InpatientEmrTraceStageStatus,
} from '../types';

const TRACE_STAGE_TITLES: Record<InpatientEmrTraceStageKey, string> = {
  hisContext: 'HIS 住院上下文',
  outpatientRecord: '门诊病历正文',
  templateResolve: '模板解析',
  aiFirstToken: 'AI 首段返回',
  aiGenerate: 'AI 生成总耗时',
  writebackDispatch: '回写发送',
  writebackFeedback: 'HIS 回执',
};

export function createInpatientEmrTrace(seed?: string): InpatientEmrGenerationTrace {
  const startedAt = Date.now();
  return {
    traceId: seed || `inpatient-emr-${startedAt}`,
    startedAt,
    stages: [],
  };
}

function ensureTraceStage(
  trace: InpatientEmrGenerationTrace,
  key: InpatientEmrTraceStageKey,
): InpatientEmrTraceStage {
  const existing = trace.stages.find((stage) => stage.key === key);
  if (existing) return existing;

  const stage: InpatientEmrTraceStage = {
    key,
    title: TRACE_STAGE_TITLES[key],
    status: 'pending',
  };
  trace.stages.push(stage);
  return stage;
}

export function startInpatientEmrTraceStage(
  trace: InpatientEmrGenerationTrace,
  key: InpatientEmrTraceStageKey,
  detail?: string,
  meta?: InpatientEmrTraceStage['meta'],
): InpatientEmrTraceStage {
  const stage = ensureTraceStage(trace, key);
  stage.status = 'running';
  stage.startedAt = Date.now();
  stage.endedAt = undefined;
  stage.durationMs = undefined;
  stage.detail = detail;
  stage.meta = { ...(stage.meta || {}), ...(meta || {}) };
  return stage;
}

export function finishInpatientEmrTraceStage(
  trace: InpatientEmrGenerationTrace,
  key: InpatientEmrTraceStageKey,
  status: Exclude<InpatientEmrTraceStageStatus, 'running' | 'pending'>,
  detail?: string,
  meta?: InpatientEmrTraceStage['meta'],
): InpatientEmrTraceStage {
  const stage = ensureTraceStage(trace, key);
  const endedAt = Date.now();
  stage.status = status;
  stage.endedAt = endedAt;
  if (!stage.startedAt) {
    stage.startedAt = endedAt;
  }
  stage.durationMs = Math.max(0, endedAt - stage.startedAt);
  stage.detail = detail || stage.detail;
  stage.meta = { ...(stage.meta || {}), ...(meta || {}) };
  return stage;
}

export function finishInpatientEmrTrace(trace: InpatientEmrGenerationTrace): void {
  trace.endedAt = Date.now();
}

export function cloneInpatientEmrTrace(trace: InpatientEmrGenerationTrace): InpatientEmrGenerationTrace {
  return {
    ...trace,
    stages: trace.stages.map((stage) => ({
      ...stage,
      meta: stage.meta ? { ...stage.meta } : undefined,
    })),
  };
}
