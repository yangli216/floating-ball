export type DifferentialDiagnosisPresentationKind = 'default' | 'system-error' | 'clinical-risk';

export interface DifferentialDiagnosisPresentationInput {
  systemError: string;
  clinicalRiskCount: number;
}

export interface DifferentialDiagnosisPresentation {
  kind: DifferentialDiagnosisPresentationKind;
  title: string;
}

export function resolveDifferentialDiagnosisPresentation(
  input: DifferentialDiagnosisPresentationInput,
): DifferentialDiagnosisPresentation {
  if (input.systemError.trim()) {
    return {
      kind: 'system-error',
      title: '鉴别诊断生成失败',
    };
  }
  if (input.clinicalRiskCount > 0) {
    return {
      kind: 'clinical-risk',
      title: `发现${input.clinicalRiskCount}个问题`,
    };
  }
  return {
    kind: 'default',
    title: '诊断鉴别',
  };
}
