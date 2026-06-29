import { describe, expect, it } from 'vitest';
import { buildDiagnosisRationale } from './clinicalResultNarrative';

describe('buildDiagnosisRationale', () => {
  it('uses concise explicit-diagnosis wording and does not duplicate identical evidence', () => {
    const evidence = '近期历史就诊记录有“2型糖尿病”诊断';
    const rationale = buildDiagnosisRationale({
      name: '2型糖尿病',
      evidenceText: evidence,
      rationale: evidence,
      sourceType: 'explicit',
      confidence: 'high',
      matchedItem: {
        id: 'diag-e11',
        code: 'E11.900',
        name: '2型糖尿病',
      },
    }, '2型糖尿病', {
      chiefComplaint: '2型糖尿病确诊后复诊续方',
      historyOfPresentIllness: '既往确诊2型糖尿病，本次复诊评估并续方。',
    });

    expect(rationale).toContain('建议采用2型糖尿病');
    expect(rationale).not.toContain('模型初步考虑');
    expect(rationale.match(/近期历史就诊记录/u)).toHaveLength(1);
  });
});
