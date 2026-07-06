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

const TREATMENT_LABELS: Record<ClinicalResultRecommendationType, string> = {
  medicine: '药品',
  exam: '检查',
  lab_test: '检验',
  procedure: '处置',
};

function emptyProgress(): ClinicalGenerationProgress {
  return { visible: false, title: '', detail: '', percent: 0, steps: [] };
}

export function buildClinicalGenerationProgress(
  input: BuildClinicalGenerationProgressInput,
): ClinicalGenerationProgress {
  if (input.generation?.status === 'streaming') {
    const ready = new Set(input.generation.readySections);
    const completed = RECORD_PHASES.map((phase) => phase.sections.every((section) => ready.has(section)));
    const activeIndex = completed.findIndex((value) => !value);
    const steps = RECORD_PHASES.map((phase, index) => ({
      key: phase.key,
      label: phase.label,
      status: completed[index]
        ? 'complete' as const
        : index === activeIndex ? 'active' as const : 'pending' as const,
    }));
    const completeCount = completed.filter(Boolean).length;
    const activeLabel = activeIndex >= 0 ? RECORD_PHASES[activeIndex].label : '结果校验';
    return {
      visible: true,
      title: `正在分析：${activeLabel}`,
      detail: `已完成 ${completeCount}/${RECORD_PHASES.length} 个分析阶段，内容会逐步呈现`,
      percent: Math.max(8, Math.round((completeCount / RECORD_PHASES.length) * 78)),
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
