// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { Diagnosis } from '@/types/consultation';
import { useDiagnosisSelection } from './useDiagnosisSelection';

function diagnosis(name: string, id: string): Diagnosis {
  return {
    id,
    code: '',
    name,
    rate: '高置信',
    rationale: '',
  };
}

describe('useDiagnosisSelection initial selection', () => {
  it('selects every doctor-scoped formal diagnosis for chronic refill', () => {
    const diagnoses = ref([
      diagnosis('原发性高血压', 'diag_hypertension'),
      diagnosis('2型糖尿病', 'standard-diabetes'),
      diagnosis('骨质疏松', 'standard-osteoporosis'),
      diagnosis('冠心病', 'standard-coronary-disease'),
    ]);
    const selection = useDiagnosisSelection({ diagnoses });

    selection.replaceInitialDiagnosisSelection(diagnoses.value, true);

    expect(selection.selectedDiagnoses.value.map((item) => item.name)).toEqual([
      '原发性高血压',
      '2型糖尿病',
      '骨质疏松',
      '冠心病',
    ]);
    expect(selection.selectedDiagnosis.value?.name).toBe('2型糖尿病');
  });

  it('keeps the single-primary default for other result channels', () => {
    const diagnoses = ref([
      diagnosis('原发性高血压', 'standard-hypertension'),
      diagnosis('2型糖尿病', 'standard-diabetes'),
    ]);
    const selection = useDiagnosisSelection({ diagnoses });

    selection.replaceInitialDiagnosisSelection(diagnoses.value, false);

    expect(selection.selectedDiagnoses.value.map((item) => item.name)).toEqual([
      '原发性高血压',
    ]);
    expect(selection.selectedDiagnosis.value?.name).toBe('原发性高血压');
  });
});
