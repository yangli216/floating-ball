import type {
  ChatMessage,
  LLMConfigOverride,
} from '@/services/llm';

export type ClinicalResultTreatmentRequestKind = 'medication' | 'exam' | 'lab_test' | 'procedure';

export interface ClinicalResultDiagnosisPromptParams {
  patientName: string;
  gender: string;
  age: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
}

export interface ClinicalResultTreatmentPromptParams {
  patientName: string;
  gender: string;
  age: string;
  diagnosisName: string;
  diagnosisCode: string;
  chiefComplaint: string;
}

export interface ClinicalResultPromptAsset<TParams> {
  system: string;
  buildUserPrompt: (params: TParams) => string;
}

export type ClinicalResultDiagnosisPromptAsset = ClinicalResultPromptAsset<ClinicalResultDiagnosisPromptParams>;

export type ClinicalResultTreatmentPromptAsset = ClinicalResultPromptAsset<ClinicalResultTreatmentPromptParams>;

export type ClinicalResultTreatmentPromptAssets = Record<
  ClinicalResultTreatmentRequestKind,
  ClinicalResultTreatmentPromptAsset
>;

export interface ClinicalResultAiRequestSpec {
  messages: ChatMessage[];
  config: LLMConfigOverride;
}

export type ClinicalResultDiagnosisRequestSpec = ClinicalResultAiRequestSpec;

export interface ClinicalResultAiTraceBase {
  sourceModule?: string;
  operationModule?: string;
  consultationId?: string;
}

export interface ClinicalResultAiTraceOverride {
  scene?: string;
  operationAction?: string;
  title?: string;
}

export type ClinicalResultTreatmentTraceOverrides = Partial<Record<
  ClinicalResultTreatmentRequestKind,
  ClinicalResultAiTraceOverride
>>;

export interface ClinicalResultTreatmentRequestSpec {
  kind: ClinicalResultTreatmentRequestKind;
  messages: ClinicalResultAiRequestSpec['messages'];
  config: ClinicalResultAiRequestSpec['config'];
}

interface TreatmentTraceSpec {
  scene: string;
  operationAction: string;
  title: string;
}

const DEFAULT_TRACE_BASE: Required<ClinicalResultAiTraceBase> = {
  sourceModule: 'voice_consultation_ai',
  operationModule: 'voice_consultation',
  consultationId: '',
};

const TREATMENT_TRACE_BY_KIND: Record<ClinicalResultTreatmentRequestKind, TreatmentTraceSpec> = {
  medication: {
    scene: 'voice-consultation-treatment-medication',
    operationAction: 'generate_treatment_recommendation',
    title: '语音问诊生成用药推荐',
  },
  exam: {
    scene: 'voice-consultation-treatment-examination',
    operationAction: 'generate_examination_recommendation',
    title: '语音问诊生成检查推荐',
  },
  lab_test: {
    scene: 'voice-consultation-treatment-lab-test',
    operationAction: 'generate_lab_test_recommendation',
    title: '语音问诊生成检验推荐',
  },
  procedure: {
    scene: 'voice-consultation-treatment-procedure',
    operationAction: 'generate_procedure_recommendation',
    title: '语音问诊生成处置推荐',
  },
};

function resolveTraceBase(traceBase?: ClinicalResultAiTraceBase): Required<ClinicalResultAiTraceBase> {
  return {
    sourceModule: traceBase?.sourceModule || DEFAULT_TRACE_BASE.sourceModule,
    operationModule: traceBase?.operationModule || DEFAULT_TRACE_BASE.operationModule,
    consultationId: traceBase?.consultationId || '',
  };
}

export function buildClinicalResultDiagnosisRequestSpec(
  params: ClinicalResultDiagnosisPromptParams,
  prompt: ClinicalResultDiagnosisPromptAsset,
  traceBase?: ClinicalResultAiTraceBase,
  traceOverride?: ClinicalResultAiTraceOverride,
): ClinicalResultDiagnosisRequestSpec {
  const resolvedTrace = resolveTraceBase(traceBase);
  return {
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.buildUserPrompt(params) },
    ],
    config: {
      traceContext: {
        scene: traceOverride?.scene || 'voice-consultation-diagnosis',
        sourceModule: resolvedTrace.sourceModule,
        operationModule: resolvedTrace.operationModule,
        operationAction: traceOverride?.operationAction || 'generate_diagnosis_recommendation',
        title: traceOverride?.title || '语音问诊生成诊断推荐',
        consultationId: resolvedTrace.consultationId,
      },
    },
  };
}

export function buildClinicalResultTreatmentRequestSpecs(
  params: ClinicalResultTreatmentPromptParams,
  prompts: ClinicalResultTreatmentPromptAssets,
  traceBase?: ClinicalResultAiTraceBase,
  traceOverrides: ClinicalResultTreatmentTraceOverrides = {},
): ClinicalResultTreatmentRequestSpec[] {
  return (['medication', 'exam', 'lab_test', 'procedure'] as const).map((kind) => (
    buildClinicalResultTreatmentRequestSpec(
      kind,
      params,
      prompts[kind],
      traceBase,
      traceOverrides[kind],
    )
  ));
}

export function buildClinicalResultTreatmentRequestSpec(
  kind: ClinicalResultTreatmentRequestKind,
  params: ClinicalResultTreatmentPromptParams,
  prompt: ClinicalResultTreatmentPromptAsset,
  traceBase?: ClinicalResultAiTraceBase,
  traceOverride?: ClinicalResultAiTraceOverride,
): ClinicalResultTreatmentRequestSpec {
  const resolvedTrace = resolveTraceBase(traceBase);
  const trace = TREATMENT_TRACE_BY_KIND[kind];
  return {
    kind,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.buildUserPrompt(params) },
    ],
    config: {
      traceContext: {
        scene: traceOverride?.scene || trace.scene,
        sourceModule: resolvedTrace.sourceModule,
        operationModule: resolvedTrace.operationModule,
        operationAction: traceOverride?.operationAction || trace.operationAction,
        title: traceOverride?.title || trace.title,
        consultationId: resolvedTrace.consultationId,
      },
    },
  };
}
