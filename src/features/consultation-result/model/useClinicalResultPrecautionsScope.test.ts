import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useClinicalResultPrecautionsScope } from './useClinicalResultPrecautionsScope';

describe('useClinicalResultPrecautionsScope', () => {
  it('rebuilds generated precautions from selected formal diagnoses only', () => {
    const precautions = ref('膀胱炎健康教育');
    const setSystemBaseline = vi.fn();
    const scope = useClinicalResultPrecautionsScope({
      precautions,
      buildScopedPrecautions: (names) => `scoped:${names.join(',')}`,
      setSystemBaseline,
    });

    scope.captureGeneratedPrecautions(['输尿管结石', '膀胱炎']);
    const result = scope.syncToSelectedDiagnoses(['输尿管结石']);

    expect(result.updated).toBe(true);
    expect(result.preservedManualEdit).toBe(false);
    expect(precautions.value).toBe('scoped:输尿管结石');
    expect(setSystemBaseline).toHaveBeenLastCalledWith('scoped:输尿管结石');
  });

  it('restores the generated source when all source diagnoses are selected', () => {
    const precautions = ref('高血压与糖尿病联合教育');
    const scope = useClinicalResultPrecautionsScope({
      precautions,
      buildScopedPrecautions: (names) => `scoped:${names.join(',')}`,
    });

    scope.captureGeneratedPrecautions(['高血压', '糖尿病']);
    scope.syncToSelectedDiagnoses(['高血压']);
    scope.syncToSelectedDiagnoses(['糖尿病', '高血压']);

    expect(precautions.value).toBe('高血压与糖尿病联合教育');
  });

  it('preserves a doctor edit when diagnosis selection changes', () => {
    const precautions = ref('系统文案');
    const scope = useClinicalResultPrecautionsScope({
      precautions,
      buildScopedPrecautions: (names) => `scoped:${names.join(',')}`,
    });

    scope.captureGeneratedPrecautions(['急性上呼吸道感染']);
    precautions.value = '医生手工修改后的注意事项';
    const result = scope.syncToSelectedDiagnoses(['急性胃肠炎']);

    expect(result.updated).toBe(false);
    expect(result.preservedManualEdit).toBe(true);
    expect(precautions.value).toBe('医生手工修改后的注意事项');
  });
});
