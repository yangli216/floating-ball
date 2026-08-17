import { nextTick, ref } from 'vue';
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
}) => Promise<string>, isEnabled?: () => boolean) {
  const notify = vi.fn();
  const primaryDiagnosis = ref<Diagnosis | null>(null);
  const controller = useClinicalResultDiagnosisChecklist({
    isEnabled,
    getConsultationId: () => 'visit-1',
    getPrimaryDiagnosis: () => primaryDiagnosis.value,
    getChiefComplaint: () => '发热伴咳嗽3天',
    getHistoryOfPresentIllness: () => '最高体温39℃，伴黄痰。',
    request,
    formatError: () => '诊断鉴别生成失败：请稍后重试。',
    notify,
  });
  return { controller, notify, primaryDiagnosis };
}

describe('useClinicalResultDiagnosisChecklist', () => {
  it('does not request the ordinary checklist when the channel provides its own review', async () => {
    const request = vi.fn(async () => JSON.stringify({ isNeeded: true }));
    const { controller, primaryDiagnosis } = createController(request, () => false);
    primaryDiagnosis.value = diagnosis;
    await nextTick();
    await controller.openDiagnosisChecklist(diagnosis);
    await controller.prefetchDiagnosisChecklist(diagnosis);
    expect(request).not.toHaveBeenCalled();
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(false);
  });

  it('opens the anchored layer, requests current record context and stores normalized items', async () => {
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
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true);
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toEqual({
      state: 'ready',
      items: [{ question: '询问胸痛', recordText: '排除胸膜炎' }],
      message: '',
    });
  });

  it('shows the empty notification when no review item is needed', async () => {
    const { controller, notify } = createController(async () => JSON.stringify({ isNeeded: false }));

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(false);
    expect(controller.getDiagnosisChecklistPreview(diagnosis).state).toBe('clear');
    expect(notify).toHaveBeenCalledWith('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
  });

  it('turns a critical mismatch into an anchored high-risk layer', async () => {
    const { controller } = createController(async () => JSON.stringify({
      isNeeded: true,
      severity: 'critical',
      items: [{ question: '当前诊断与病历不匹配', recordText: '复核诊断方向' }],
    }));

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true);
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toMatchObject({
      state: 'risk',
      items: [],
      message: '当前诊断与病历不匹配',
    });
  });

  it('normalizes request failures and notifies the page', async () => {
    const { controller, notify } = createController(async () => {
      throw new Error('network failed');
    });

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true);
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toMatchObject({
      state: 'error',
      message: '诊断鉴别生成失败：请稍后重试。',
    });
    expect(notify).toHaveBeenCalledWith('诊断鉴别生成失败：请稍后重试。', 'error');
  });

  it('keeps a manually closed layer dismissed when an in-flight response arrives', async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const { controller } = createController(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const pending = controller.openDiagnosisChecklist(diagnosis);
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true);
    controller.closeDiagnosisChecklist(diagnosis);
    resolveRequest?.(JSON.stringify({
      isNeeded: true,
      items: [{ question: '迟到结果', recordText: '' }],
    }));
    await pending;

    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(false);
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toMatchObject({
      state: 'ready',
      items: [{ question: '迟到结果', recordText: '' }],
    });
  });

  it('prefetches once and opens the cached result without another request', async () => {
    const request = vi.fn(async () => JSON.stringify({
      isNeeded: true,
      items: [{ question: '确认气促', recordText: '无气促' }],
    }));
    const { controller } = createController(request);

    await controller.prefetchDiagnosisChecklist(diagnosis);
    expect(controller.getDiagnosisChecklistStatus(diagnosis)).toEqual({ state: 'ready', itemCount: 1 });
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toEqual({
      state: 'ready',
      items: [{ question: '确认气促', recordText: '无气促' }],
      message: '',
    });

    await controller.openDiagnosisChecklist(diagnosis);
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true);
  });

  it('returns every checklist item to the anchored layer without preview truncation', async () => {
    const items = Array.from({ length: 4 }, (_, index) => ({
      question: `核查要点 ${index + 1}`,
      recordText: `病历描述 ${index + 1}`,
    }));
    const { controller } = createController(async () => JSON.stringify({ isNeeded: true, items }));

    await controller.openDiagnosisChecklist(diagnosis);

    expect(controller.getDiagnosisChecklistStatus(diagnosis).itemCount).toBe(4);
    expect(controller.getDiagnosisChecklistPreview(diagnosis).items).toEqual(items);
  });

  it('automatically prefetches when the primary diagnosis becomes stable', async () => {
    const request = vi.fn(async () => JSON.stringify({ isNeeded: false }));
    const { controller, primaryDiagnosis } = createController(request);

    primaryDiagnosis.value = diagnosis;
    await nextTick();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    expect(controller.getDiagnosisChecklistStatus(diagnosis)).toEqual({ state: 'clear', itemCount: 0 });
  });

  it('closes the old anchored layer when the primary diagnosis context changes', async () => {
    const request = vi.fn(async () => JSON.stringify({
      isNeeded: true,
      items: [{ question: '确认关键症状', recordText: '' }],
    }));
    const { controller, primaryDiagnosis } = createController(request);
    const otherDiagnosis: Diagnosis = {
      code: 'K21.900',
      name: '胃食管反流病',
      rate: '80%',
      rationale: '结合反酸、烧心考虑',
    };

    primaryDiagnosis.value = diagnosis;
    await nextTick();
    await vi.waitFor(() => expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true));

    primaryDiagnosis.value = otherDiagnosis;
    await nextTick();
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(false);
    await vi.waitFor(() => expect(controller.isDiagnosisChecklistOpen(otherDiagnosis)).toBe(true));
  });

  it('proactively opens a critical result for the current primary diagnosis and stays closed after review', async () => {
    const request = vi.fn(async () => JSON.stringify({
      isNeeded: true,
      severity: 'critical',
      items: [{ question: '当前诊断不能解释胸痛', recordText: '请复核急性冠脉综合征' }],
    }));
    const { controller, notify, primaryDiagnosis } = createController(request);

    primaryDiagnosis.value = diagnosis;
    await nextTick();
    await vi.waitFor(() => expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(true));

    expect(controller.getDiagnosisChecklistStatus(diagnosis).state).toBe('risk');
    expect(controller.getDiagnosisChecklistPreview(diagnosis)).toMatchObject({
      state: 'risk',
      items: [],
      message: '当前诊断不能解释胸痛',
    });
    expect(notify).toHaveBeenCalledWith(
      '发现需要优先确认的诊断鉴别风险，请复核当前诊断。',
      'warning',
    );

    controller.closeDiagnosisChecklist(diagnosis);
    await controller.prefetchDiagnosisChecklist(diagnosis);
    expect(controller.isDiagnosisChecklistOpen(diagnosis)).toBe(false);
  });
});
