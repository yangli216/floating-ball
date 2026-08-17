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
  percent: number;
  steps: ClinicalGenerationProgressStep[];
}

interface BuildClinicalGenerationProgressInput {
  generation?: ClinicalResultGenerationState;
  treatmentLoading: boolean;
  treatmentStates: Record<ClinicalResultRecommendationType, ClinicalTreatmentGenerationStatus>;
}

const RECORD_PHASES = [
  { key: 'record', label: '病历要点', sections: ['record_core', 'history_context'] as const },
  { key: 'orders', label: '明确医嘱', sections: ['explicit_orders'] as const },
  { key: 'diagnosis', label: '诊断建议', sections: ['diagnoses'] as const },
  { key: 'route', label: '推荐路径', sections: ['recommendation_plan', 'record_extra'] as const },
];

const CHRONIC_REFILL_PHASES = [
  { key: 'record', label: '病历基础', sections: ['record_core', 'history_context', 'diagnoses'] as const },
  { key: 'review', label: '复诊核查', sections: ['review_plan'] as const },
  { key: 'medicine', label: '用药方案', sections: ['recommended_medicines'] as const },
  { key: 'extra', label: '健康指导', sections: ['record_extra'] as const },
];

const TREATMENT_LABELS: Record<ClinicalResultRecommendationType, string> = {
  medicine: '药品',
  exam: '检查',
  lab_test: '检验',
  procedure: '处置',
};

const GENERATED_STAGE_STEPS = [
  { key: 'context', label: '读取历史与院内药品', stage: 'preparing-context' },
  { key: 'content', label: '生成病历与核查项', stage: 'generating-content' },
  { key: 'finalize', label: '整理诊断用药', stage: 'finalizing-result' },
] as const;

function emptyProgress(): ClinicalGenerationProgress {
  return { visible: false, title: '', detail: '', percent: 0, steps: [] };
}

export function buildClinicalGenerationProgress(
  input: BuildClinicalGenerationProgressInput,
): ClinicalGenerationProgress {
  if (input.generation?.status === 'error') {
    return {
      visible: true,
      title: '生成未完成',
      detail: input.generation.message || '生成过程遇到问题，请返回后重试',
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
    const percents = [12, 48, 86];
    return {
      visible: true,
      title: input.generation.message || `正在${GENERATED_STAGE_STEPS[activeIndex]?.label || '生成结果'}`,
      detail: activeIndex === 1
        ? '病历、复诊核查和方案将一次生成，完成后在本页直接展示'
        : '当前页面会保留，完成后结果将在原位置自动出现',
      percent: percents[Math.max(activeIndex, 0)],
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
    const completeCount = completed.filter(Boolean).length;
    const activeLabel = activeIndex >= 0 ? phases[activeIndex].label : '结果校验';
    return {
      visible: true,
      title: input.generation.message || `正在分析：${activeLabel}`,
      detail: `已完成 ${completeCount}/${phases.length} 个分析阶段，内容会逐步呈现`,
      percent: Math.max(8, Math.round((completeCount / phases.length) * 78)),
      steps,
    };
  }

  if (!input.treatmentLoading) return emptyProgress();

  const activeEntries = (Object.entries(input.treatmentStates) as Array<[
    ClinicalResultRecommendationType,
    ClinicalTreatmentGenerationStatus,
  ]>).filter(([, status]) => !['idle', 'deferred', 'skipped'].includes(status));
  const completeCount = activeEntries.filter(([, status]) => status === 'ready' || status === 'error').length;
  const steps = activeEntries.map(([type, status]) => ({
    key: type,
    label: `${TREATMENT_LABELS[type]}目录`,
    status: status === 'ready'
      ? 'complete' as const
      : status === 'error' ? 'error' as const : 'active' as const,
  }));
  return {
    visible: true,
    title: '正在匹配院内诊疗目录',
    detail: completeCount > 0
      ? `已完成 ${completeCount}/${activeEntries.length} 类目录匹配，完成后统一展示方案`
      : '正在并行核对机构可用项目，完成后统一展示方案',
    percent: 78 + Math.round((completeCount / Math.max(1, activeEntries.length)) * 20),
    steps,
  };
}
