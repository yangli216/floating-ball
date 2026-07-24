import type { TreatmentPlanInitialDraft } from '@features/treatment-plan';
import type { ChronicDiseasePatientSummary } from '../types';

export interface ChronicCheckSuggestion {
  id: string;
  label: string;
  purpose: string;
  type: 'exam' | 'lab_test';
}

export function buildChronicCheckSuggestions(
  summary: ChronicDiseasePatientSummary,
): ChronicCheckSuggestion[] {
  const items: ChronicCheckSuggestion[] = [];
  if (summary.diseaseTags.some((item) => item.diseaseType === 'hypertension')) {
    items.push(
      { id: 'lipid', label: '血脂四项', purpose: '心血管总体风险复核', type: 'lab_test' },
      { id: 'renal', label: '肾功能（肌酐 / eGFR）', purpose: '靶器官损害与用药安全复核', type: 'lab_test' },
    );
  }
  if (summary.diseaseTags.some((item) => item.diseaseType === 'type2_diabetes')) {
    items.push(
      { id: 'hba1c', label: '糖化血红蛋白（HbA1c）', purpose: '近期血糖控制评估', type: 'lab_test' },
      { id: 'urine', label: '尿白蛋白/肌酐比值', purpose: '糖尿病肾病筛查记录复核', type: 'lab_test' },
      { id: 'fundus', label: '眼底检查', purpose: '糖尿病视网膜病变筛查核实', type: 'exam' },
    );
  }
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function buildChronicTreatmentPlanInitialDraft(input: {
  summary: ChronicDiseasePatientSummary;
  suggestions: ChronicCheckSuggestion[];
  selectedIds: string[];
  requestId: string;
}): TreatmentPlanInitialDraft {
  const selected = new Set(input.selectedIds);
  return {
    requestId: input.requestId,
    patientAnchorId: input.summary.visitId || input.summary.patientId,
    sourceModule: 'chronic_disease',
    title: '两慢病检查检验草稿',
    items: input.suggestions
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        sourceId: item.id,
        type: item.type,
        name: item.label,
        reason: item.purpose,
      })),
  };
}
