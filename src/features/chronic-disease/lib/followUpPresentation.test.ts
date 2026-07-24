import { describe, expect, it } from 'vitest';
import { buildFollowUpPresentation } from './followUpPresentation';

describe('follow-up presentation', () => {
  it('shows only the hypertension follow-up fields for a hypertension marker', () => {
    expect(buildFollowUpPresentation(['hypertension'])).toEqual({
      mode: 'hypertension',
      diseaseTypes: ['hypertension'],
      hasHypertension: true,
      hasDiabetes: false,
      label: '高血压随访',
    });
  });

  it('shows only the diabetes follow-up fields for a diabetes marker', () => {
    expect(buildFollowUpPresentation(['type2_diabetes'])).toEqual({
      mode: 'type2_diabetes',
      diseaseTypes: ['type2_diabetes'],
      hasHypertension: false,
      hasDiabetes: true,
      label: '2 型糖尿病随访',
    });
  });

  it('combines both disease field groups in a stable order for dual markers', () => {
    expect(buildFollowUpPresentation(['type2_diabetes', 'hypertension'])).toEqual({
      mode: 'combined',
      diseaseTypes: ['hypertension', 'type2_diabetes'],
      hasHypertension: true,
      hasDiabetes: true,
      label: '高血压 + 2 型糖尿病联合随访',
    });
  });
});
