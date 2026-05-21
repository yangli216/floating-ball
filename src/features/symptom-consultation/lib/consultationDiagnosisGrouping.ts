import type { Diagnosis } from '@/types/consultation';

export interface DiagnosisCategoryInfo {
  key: string;
  range: string;
  title: string;
  order: number;
}

export interface DiagnosisDisplayGroup {
  key: string;
  title: string;
  rangeLabel?: string;
  diagnoses: Diagnosis[];
  order: number;
  showHeader: boolean;
}

export interface BuildDiagnosisDisplayGroupsInput {
  diagnoses: Diagnosis[];
  mode: 'western' | 'tcm';
  getCategoryInfo: (code: string) => DiagnosisCategoryInfo | null;
}

export function buildDiagnosisGroupKey(category: DiagnosisCategoryInfo | null): string {
  return category ? `icd10-${category.key}` : 'icd10-unknown';
}

export function buildDiagnosisDisplayGroups(
  input: BuildDiagnosisDisplayGroupsInput,
): DiagnosisDisplayGroup[] {
  if (input.diagnoses.length === 0) {
    return [];
  }

  if (input.mode === 'tcm') {
    return [
      {
        key: 'tcm',
        title: '中医辨证',
        diagnoses: input.diagnoses,
        order: 0,
        showHeader: false,
      },
    ];
  }

  const groupMap = new Map<string, DiagnosisDisplayGroup>();

  input.diagnoses.forEach((diagnosis) => {
    const category = input.getCategoryInfo(diagnosis.code);
    const groupKey = buildDiagnosisGroupKey(category);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        title: category?.title || '未分类/待确认',
        rangeLabel: category?.range,
        diagnoses: [],
        order: category?.order ?? Number.MAX_SAFE_INTEGER,
        showHeader: true,
      });
    }

    groupMap.get(groupKey)?.diagnoses.push(diagnosis);
  });

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}
