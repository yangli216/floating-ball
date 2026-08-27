import type {
  ClinicalResultGenerationState,
  ClinicalResultRecommendationType,
} from '@features/clinical-result';

export type ClinicalGenerationStepStatus = 'pending' | 'active' | 'complete' | 'error';
export type ClinicalTreatmentGenerationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'deferred'
  | 'skipped'
  | 'error';

export interface ClinicalGenerationProgressStep {
  key: string;
  label: string;
  status: ClinicalGenerationStepStatus;
}

export interface ClinicalGenerationProgress {
  visible: boolean;
  title: string;
  detail: string;
  stepText: string;
  percent: number;
  steps: ClinicalGenerationProgressStep[];
}

interface BuildClinicalGenerationProgressInput {
  generation?: ClinicalResultGenerationState;
  treatmentLoading?: boolean;
  treatmentStates?: Record<ClinicalResultRecommendationType, ClinicalTreatmentGenerationStatus>;
  showTreatmentProgress?: boolean;
}

const RECORD_PHASES = [
  { key: 'record', label: '病历要点', sections: ['record_core', 'history_context'] as const },
  { key: 'diagnosis', label: '诊断建议', sections: ['diagnoses'] as const },
  { key: 'route', label: '诊疗路由', sections: ['recommendation_plan'] as const },
  { key: 'extra', label: '病历完善', sections: ['explicit_orders', 'record_extra'] as const },
];

const CHRONIC_REFILL_PHASES = [
  { key: 'record', label: '病历基础', sections: ['record_core', 'history_context', 'diagnoses'] as const },
  { key: 'review', label: '复诊核查', sections: ['review_plan'] as const },
  { key: 'medicine', label: '用药方案', sections: ['recommended_medicines'] as const },
  { key: 'extra', label: '健康指导', sections: ['record_extra'] as const },
];

const TREATMENT_LABELS: Record<ClinicalResultRecommendationType, string> = {
  medicine: '药品方案',
  exam: '检查方案',
  lab_test: '检验方案',
  procedure: '处置方案',
};

const GENERATED_STAGE_STEPS = [
  { key: 'context', label: '读取历史与院内药品', stage: 'preparing-context' },
  { key: 'content', label: '生成病历与核查项', stage: 'generating-content' },
  { key: 'finalize', label: '整理诊断用药', stage: 'finalizing-result' },
] as const;

function emptyProgress(): ClinicalGenerationProgress {
  return { visible: false, title: '', detail: '', stepText: '', percent: 0, steps: [] };
}

function formatStepText(current: number, total: number): string {
  return `第 ${Math.min(Math.max(current, 1), Math.max(total, 1))}/${Math.max(total, 1)} 步`;
}

function progressPercentForStep(current: number, total: number): number {
  if (total <= 1) return 88;
  const normalizedCurrent = Math.min(Math.max(current, 1), total);
  return Math.round(18 + ((normalizedCurrent - 1) / (total - 1)) * 70);
}

export function buildClinicalGenerationProgress(
  input: BuildClinicalGenerationProgressInput,
): ClinicalGenerationProgress {
  if (input.generation?.status === 'error') {
    return {
      visible: true,
      title: '生成未完成',
      detail: input.generation.message || '生成过程遇到问题，请返回后重试',
      stepText: '生成失败',
      percent: 100,
      steps: [{ key: 'generation-error', label: '生成失败', status: 'error' }],
    };
  }

  if (input.generation?.status === 'streaming' && input.generation.stage) {
    const activeIndex = GENERATED_STAGE_STEPS.findIndex((item) => item.stage === input.generation?.stage);
    const steps = GENERATED_STAGE_STEPS.map((item, index) => ({
      key: item.key,
      label: item.label,
      status: index < activeIndex
        ? 'complete' as const
        : index === activeIndex ? 'active' as const : 'pending' as const,
    }));
    return {
      visible: true,
      title: input.generation.message || `正在${GENERATED_STAGE_STEPS[activeIndex]?.label || '生成结果'}`,
      detail: '',
      stepText: formatStepText(activeIndex + 1, steps.length),
      percent: progressPercentForStep(activeIndex + 1, steps.length),
      steps,
    };
  }

  if (input.generation?.status === 'streaming') {
    const ready = new Set(input.generation.readySections);
    const phases = ready.has('review_plan') || ready.has('recommended_medicines')
      ? CHRONIC_REFILL_PHASES
      : RECORD_PHASES;
    const completed = phases.map((phase) => phase.sections.every((section) => ready.has(section)));
    const activeIndex = completed.findIndex((value) => !value);
    const steps = phases.map((phase, index) => ({
      key: phase.key,
      label: phase.label,
      status: completed[index]
        ? 'complete' as const
        : index === activeIndex ? 'active' as const : 'pending' as const,
    }));
    const activeLabel = activeIndex >= 0 ? phases[activeIndex].label : '生成结果';
    return {
      visible: true,
      title: activeIndex >= 0 ? `正在整理${activeLabel}` : '正在校验生成结果',
      detail: '',
      stepText: formatStepText(activeIndex >= 0 ? activeIndex + 1 : phases.length, phases.length),
      percent: activeIndex >= 0
        ? progressPercentForStep(activeIndex + 1, phases.length)
        : 96,
      steps,
    };
  }

  if (input.showTreatmentProgress === false || !input.treatmentLoading) return emptyProgress();

  const activeEntries = (Object.entries(input.treatmentStates || {}) as Array<[
    ClinicalResultRecommendationType,
    ClinicalTreatmentGenerationStatus,
  ]>).filter(([, status]) => !['idle', 'deferred', 'skipped'].includes(status));
  if (activeEntries.length === 0) return emptyProgress();

  const completeCount = activeEntries.filter(([, status]) => status === 'ready' || status === 'error').length;
  const steps = activeEntries.map(([type, status]) => ({
    key: type,
    label: TREATMENT_LABELS[type],
    status: status === 'ready'
      ? 'complete' as const
      : status === 'error' ? 'error' as const : 'active' as const,
  }));
  return {
    visible: true,
    title: '正在生成诊疗方案',
    detail: '',
    stepText: formatStepText(completeCount + 1, activeEntries.length),
    percent: progressPercentForStep(completeCount + 1, activeEntries.length),
    steps,
  };
}
