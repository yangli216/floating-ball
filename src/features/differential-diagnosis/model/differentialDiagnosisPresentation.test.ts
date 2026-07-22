import { describe, expect, it } from 'vitest';
import { resolveDifferentialDiagnosisPresentation } from './differentialDiagnosisPresentation';

describe('resolveDifferentialDiagnosisPresentation', () => {
  it('renders technical failures as a system error instead of clinical risk', () => {
    expect(resolveDifferentialDiagnosisPresentation({
      systemError: '诊断鉴别生成失败：请稍后重试。',
      clinicalRiskCount: 0,
    })).toEqual({
      kind: 'system-error',
      title: '鉴别诊断生成失败',
    });
  });

  it('uses the clinical problem count only for parsed clinical risks', () => {
    expect(resolveDifferentialDiagnosisPresentation({
      systemError: '',
      clinicalRiskCount: 2,
    })).toEqual({
      kind: 'clinical-risk',
      title: '发现2个问题',
    });
  });
});
