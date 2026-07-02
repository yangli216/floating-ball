import { describe, expect, it, vi } from 'vitest';
import type { Diagnosis } from '@/types/consultation';
import { useClinicalResultDiagnosisChecklist } from './useClinicalResultDiagnosisChecklist';

vi.mock('@features/clinical-result', async () => (
  import('../../clinical-result/diagnosisChecklist')
));

const diagnosis: Diagnosis = {
  code: 'J18.900',
  name: '肺炎',
  rate: '90%',
  rationale: '结合发热、咳嗽考虑',
};

function createController(request: (input: {
  diagnosisName: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
}) => Promise<string>) {
  const notify = vi.fn();
  const controller = useClinicalResultDiagnosisChecklist({
    getChiefComplaint: () => '发热伴咳嗽3天',
    getHistoryOfPresentIllness: () => '最高体温39℃，伴黄痰。',
    request,
    formatError: () => '诊断鉴别生成失败：请稍后重试。',
    notify,
  });
  return { controller, notify };
}

describe('useClinicalResultDiagnosisChecklist', () => {
  it('opens the modal, requests current record context and stores normalized items', async () => {
    const request = vi.fn(async () => JSON.stringify({
      isNeeded: true,
      items: [{ question: ' 询问胸痛 ', recordText: ' 排除胸膜炎 ' }],
    }));
    const { controller } = createController(request);

    await controller.openDiagnosisChecklist(diagnosis);

    expect(request).toHaveBeenCalledWith({
      diagnosisName: '肺炎',
      chiefComplaint: '发热伴咳嗽3天',
      historyOfPresentIllness: '最高体温39℃，伴黄痰。',
    });
    expect(controller.showChecklistModal.value).toBe(true);
    expect(controller.isChecklistLoading.value).toBe(false);
    expect(controller.activeChecklistDiagnosis.value).toEqual(diagnosis);
    expect(controller.checklistItems.value).toEqual([{
      question: '询问胸痛',
      recordText: '排除胸膜炎',
    }]);
  });

  it('shows the empty notification when no review item is needed', async () => {
    const { controller, notify } = createController(async () => JSON.stringify({ isNeeded: false }));

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.checklistItems.value).toEqual([]);
    expect(controller.checklistGenerationError.value).toBe('');
    expect(notify).toHaveBeenCalledWith('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
  });

  it('turns a critical mismatch into a blocking dialog error', async () => {
    const { controller } = createController(async () => JSON.stringify({
      isNeeded: true,
      severity: 'critical',
      items: [{ question: '当前诊断与病历不匹配', recordText: '复核诊断方向' }],
    }));

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.checklistItems.value).toEqual([]);
    expect(controller.checklistGenerationError.value).toBe('当前诊断与病历不匹配');
  });

  it('normalizes request failures and notifies the page', async () => {
    const { controller, notify } = createController(async () => {
      throw new Error('network failed');
    });

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.isChecklistLoading.value).toBe(false);
    expect(controller.checklistGenerationError.value).toBe('诊断鉴别生成失败：请稍后重试。');
    expect(notify).toHaveBeenCalledWith('诊断鉴别生成失败：请稍后重试。', 'error');
  });

  it('invalidates an in-flight response when the modal is closed', async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const { controller } = createController(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const pending = controller.openDiagnosisChecklist(diagnosis);
    expect(controller.isChecklistLoading.value).toBe(true);
    controller.closeChecklistModal();
    resolveRequest?.(JSON.stringify({
      isNeeded: true,
      items: [{ question: '迟到结果', recordText: '' }],
    }));
    await pending;

    expect(controller.showChecklistModal.value).toBe(false);
    expect(controller.isChecklistLoading.value).toBe(false);
    expect(controller.checklistItems.value).toEqual([]);
  });
});
