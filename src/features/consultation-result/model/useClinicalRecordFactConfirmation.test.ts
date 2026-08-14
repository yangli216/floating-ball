// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { useClinicalRecordFactConfirmation } from './useClinicalRecordFactConfirmation';

function createController(
  request: () => Promise<string>,
  applyConfirmedFact = vi.fn(),
  historyOfPresentIllness = '患者胸闷1天。',
) {
  return {
    applyConfirmedFact,
    controller: useClinicalRecordFactConfirmation({
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
      applyConfirmedFact,
      formatError: () => '分析失败',
    }),
  };
}

describe('useClinicalRecordFactConfirmation', () => {
  it('shows AI candidates without writing them until the doctor completes the check', async () => {
    const applyConfirmedFact = vi.fn();
    const { controller } = createController(async () => JSON.stringify({
      items: [{
        field: 'historyOfPresentIllness',
        question: '是否伴胸痛？',
        negativeRecordText: '否认胸痛',
        rationale: '排除急性冠脉事件',
        priority: 'critical',
      }],
    }), applyConfirmedFact);

    await controller.generateSuggestions();

    expect(applyConfirmedFact).not.toHaveBeenCalled();
    expect(controller.ensureWritebackReady()).toBe(false);
    controller.confirmNegative(controller.suggestions.value[0].id);
    expect(applyConfirmedFact).toHaveBeenCalledWith('historyOfPresentIllness', '否认胸痛');
    expect(controller.ensureWritebackReady()).toBe(true);
    expect(controller.explicitFacts.value.filter((item) => item.text === '否认胸痛')).toEqual([
      expect.objectContaining({ source: 'doctor-confirmed' }),
    ]);
    expect(controller.getFieldHighlights('historyOfPresentIllness')).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '否认胸痛', source: 'doctor-confirmed', polarity: 'negative' }),
    ]));
  });

  it('keeps resolved facts when the diagnosis context regenerates pending suggestions', async () => {
    let response = JSON.stringify({
      items: [{
        field: 'historyOfPresentIllness',
        question: '是否伴胸痛？',
        negativeRecordText: '否认胸痛',
        rationale: '排除急性冠脉事件',
        priority: 'critical',
      }],
    });
    const { controller } = createController(async () => response);

    await controller.generateSuggestions();
    controller.confirmNegative(controller.suggestions.value[0].id);
    response = JSON.stringify({
      items: [{
        field: 'physicalExam',
        question: '肺部是否有湿啰音？',
        negativeRecordText: '双肺未闻及湿啰音',
        rationale: '核对肺部体征',
        priority: 'general',
      }],
    });
    await controller.generateSuggestions();

    expect(controller.suggestions.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'confirmed-negative', confirmedText: '否认胸痛' }),
      expect.objectContaining({ field: 'physicalExam', status: 'pending' }),
    ]));
  });

  it('does not block writeback for unresolved general suggestions', async () => {
    const { controller } = createController(async () => JSON.stringify({
      items: [{
        field: 'familyHistory',
        question: '直系亲属是否有高血压？',
        negativeRecordText: '否认高血压家族史',
        rationale: '完善危险因素',
        priority: 'general',
      }],
    }));

    await controller.generateSuggestions();
    expect(controller.ensureWritebackReady()).toBe(true);
  });

  it('does not append an existing negative candidate and replaces it when an abnormal result is recorded', async () => {
    const applyConfirmedFact = vi.fn();
    const response = async () => JSON.stringify({
      items: [{
        field: 'historyOfPresentIllness',
        question: '是否伴胸痛或呼吸困难？',
        negativeRecordText: '否认胸痛、呼吸困难',
        rationale: '核查高风险症状',
        priority: 'critical',
      }],
    });
    const first = createController(response, applyConfirmedFact, '患者咳嗽，否认发热、胸痛及呼吸困难。');

    await first.controller.generateSuggestions();
    first.controller.confirmNegative(first.controller.suggestions.value[0].id);
    expect(applyConfirmedFact).not.toHaveBeenCalled();

    const second = createController(response, applyConfirmedFact, '患者咳嗽，否认发热、胸痛及呼吸困难。');
    await second.controller.generateSuggestions();
    second.controller.confirmPositive(second.controller.suggestions.value[0].id, '活动后胸闷伴气促');
    expect(applyConfirmedFact).toHaveBeenCalledWith(
      'historyOfPresentIllness',
      '活动后胸闷伴气促',
      '否认胸痛、呼吸困难',
    );
  });
});
