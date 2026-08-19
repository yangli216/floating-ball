// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { useClinicalRecordFactConfirmation } from './useClinicalRecordFactConfirmation';

function createController(
  request: () => Promise<string>,
  historyOfPresentIllness = '患者胸闷1天。',
) {
  return useClinicalRecordFactConfirmation({
      getRecord: () => ({
        chiefComplaint: '胸闷1天',
        historyOfPresentIllness,
        pastMedicalHistory: '',
        personalHistory: '',
        familyHistory: '',
        physicalExam: '',
      }),
      getDiagnoses: () => [{ name: '胸闷待查', code: '', rate: '70%', rationale: '' }],
      request: async () => request(),
      formatError: () => '分析失败',
  });
}

describe('useClinicalRecordFactConfirmation', () => {
  it('keeps AI candidates as non-blocking reading prompts', async () => {
    const controller = createController(async () => JSON.stringify({
      items: [{
        field: 'historyOfPresentIllness',
        question: '是否伴胸痛？',
        negativeRecordText: '否认胸痛',
        rationale: '排除急性冠脉事件',
        priority: 'critical',
      }],
    }));

    await controller.generateSuggestions();

    expect(controller.suggestions.value).toEqual([
      expect.objectContaining({ priority: 'critical', status: 'pending', negativeRecordText: '否认胸痛' }),
    ]);
    expect('ensureWritebackReady' in controller).toBe(false);
    expect('confirmNegative' in controller).toBe(false);
    expect('confirmPositive' in controller).toBe(false);
    expect('markNotApplicable' in controller).toBe(false);
  });

  it('drops legacy resolved cache entries and restores only reading prompts', async () => {
    const controller = createController(async () => JSON.stringify({
      items: [{
        field: 'physicalExam',
        question: '肺部是否有湿啰音？',
        negativeRecordText: '双肺未闻及湿啰音',
        rationale: '核对肺部体征',
        priority: 'general',
      }],
    }));
    controller.restoreSuggestions([{
      id: 'legacy-confirmed',
      field: 'historyOfPresentIllness',
      question: '是否伴胸痛？',
      negativeRecordText: '否认胸痛',
      rationale: '历史缓存',
      priority: 'critical',
      status: 'confirmed-negative',
      confirmedText: '否认胸痛',
    }]);
    expect(controller.suggestions.value).toEqual([]);
    await controller.generateSuggestions();
    expect(controller.suggestions.value).toEqual([
      expect.objectContaining({ field: 'physicalExam', status: 'pending' }),
    ]);
  });

  it('keeps general and critical priorities for visual distinction only', async () => {
    const controller = createController(async () => JSON.stringify({
      items: [{
        field: 'familyHistory',
        question: '直系亲属是否有高血压？',
        negativeRecordText: '否认高血压家族史',
        rationale: '完善危险因素',
        priority: 'general',
      }, {
        field: 'physicalExam',
        question: '是否存在肺部啰音？',
        negativeRecordText: '双肺未闻及啰音',
        rationale: '核查肺部体征',
        priority: 'critical',
      }],
    }));

    await controller.generateSuggestions();
    expect(controller.suggestions.value.map((item) => item.priority)).toEqual(['general', 'critical']);
    const dismissedId = controller.suggestions.value[0]?.id || '';
    controller.dismissSuggestion(dismissedId);
    expect(controller.suggestions.value).toHaveLength(2);
    expect(controller.suggestions.value[0]?.status).toBe('dismissed');
    expect(controller.getFieldSuggestions('familyHistory')).toEqual([]);
    expect(controller.getFieldSuggestions('physicalExam')).toEqual([
      expect.objectContaining({ priority: 'critical', status: 'pending' }),
    ]);
    controller.restoreSuggestions(controller.suggestions.value);
    expect(controller.suggestions.value[0]?.status).toBe('dismissed');
  });
});
