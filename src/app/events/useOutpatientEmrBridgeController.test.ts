import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutpatientEmrAnalysisRequest } from '@features/outpatient-emr/types';

const mocks = vi.hoisted(() => ({
  listenerOptions: null as null | {
    eventName: string;
    handler: (event: { payload: OutpatientEmrAnalysisRequest }) => void;
    autoStart?: boolean;
  },
}));

vi.mock('@shared/composables/useTauriEventListener', () => ({
  useTauriEventListener: vi.fn((options) => {
    mocks.listenerOptions = options;
    return {
      startListener: vi.fn(async () => undefined),
      clearListener: vi.fn(),
    };
  }),
}));

import { useOutpatientEmrBridgeController } from './useOutpatientEmrBridgeController';

function createRequest(
  overrides: Partial<OutpatientEmrAnalysisRequest> = {},
): OutpatientEmrAnalysisRequest {
  return {
    visitId: 'VIS-1',
    templateId: 'TPL-1',
    templateName: '门诊通用模板',
    templateHtml: '<section data-id="article-personal" data-article="个人史" data-name="个人史"></section>',
    templateDefinition: '[{"ID":"article-personal","NAME":"个人史","ARTICLE":"个人史","eles":[]}]',
    targetFieldIds: ['personalHistory'],
    recordContext: { recordText: '咳嗽 3 天' },
    requestId: 'REQ-1',
    ...overrides,
  };
}

function createController() {
  const openOutpatientEmr = vi.fn(async () => undefined);
  const onCancelled = vi.fn(async () => undefined);
  const onCompleted = vi.fn(async () => undefined);
  const notify = vi.fn();
  const controller = useOutpatientEmrBridgeController({
    openOutpatientEmr,
    onCancelled,
    onCompleted,
    notify,
    autoStart: false,
  });

  return {
    controller,
    openOutpatientEmr,
    onCancelled,
    onCompleted,
    notify,
  };
}

describe('useOutpatientEmrBridgeController', () => {
  afterEach(() => {
    mocks.listenerOptions = null;
    vi.restoreAllMocks();
  });

  it('subscribes to the dedicated Bridge event and opens its first request', async () => {
    const { controller, openOutpatientEmr } = createController();
    const request = createRequest();

    expect(mocks.listenerOptions).toEqual(expect.objectContaining({
      eventName: 'start-outpatient-emr-analysis',
      autoStart: false,
    }));

    mocks.listenerOptions?.handler({ payload: request });

    await vi.waitFor(() => expect(openOutpatientEmr).toHaveBeenCalledOnce());
    expect(controller.activeRequest.value).toBe(request);
  });

  it('restores an exact retry without replacing the active request object', async () => {
    const { controller, openOutpatientEmr } = createController();
    const original = createRequest();
    const retry = createRequest();

    await controller.handleStartAnalysis(original);
    await controller.handleStartAnalysis(retry);

    expect(openOutpatientEmr).toHaveBeenCalledTimes(2);
    expect(controller.activeRequest.value).toBe(original);
  });

  it.each([
    ['visit', { visitId: 'VIS-2' }],
    ['template', { templateId: 'TPL-2' }],
    ['template name', { templateName: '门诊复诊模板' }],
    ['rendered template', { templateHtml: '<section data-id="changed"></section>' }],
    ['template definition', { templateDefinition: '[]' }],
    ['target selection', { targetFieldIds: ['familyHistory'] }],
    ['patient facts', { patient: { idPi: 'PAT-2' } }],
    ['record context', { recordContext: { recordText: '发热 1 天' } }],
  ])('rejects a reused requestId with a different %s identity', async (_label, overrides) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr, notify } = createController();
    const original = createRequest();

    await controller.handleStartAnalysis(original);
    await controller.handleStartAnalysis(createRequest(overrides));

    expect(openOutpatientEmr).toHaveBeenCalledOnce();
    expect(controller.activeRequest.value).toBe(original);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('请求 ID 冲突'), 'error');
  });

  it('allows a new requestId to replace the active task', async () => {
    const { controller, openOutpatientEmr } = createController();
    const next = createRequest({ requestId: 'REQ-2', templateId: 'TPL-2' });

    await controller.handleStartAnalysis(createRequest());
    await controller.handleStartAnalysis(next);

    expect(openOutpatientEmr).toHaveBeenCalledTimes(2);
    expect(controller.activeRequest.value).toBe(next);
  });

  it('clears the active request on cancel and successful completion', async () => {
    const { controller, onCancelled, onCompleted } = createController();

    await controller.handleStartAnalysis(createRequest());
    await controller.cancelAnalysis();
    expect(controller.activeRequest.value).toBeNull();
    expect(onCancelled).toHaveBeenCalledOnce();

    await controller.handleStartAnalysis(createRequest({ requestId: 'REQ-2' }));
    await controller.completeAnalysis();
    expect(controller.activeRequest.value).toBeNull();
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it('does not open an incomplete runtime payload', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr, notify } = createController();

    await controller.handleStartAnalysis(createRequest({ requestId: '   ' }));

    expect(openOutpatientEmr).not.toHaveBeenCalled();
    expect(controller.activeRequest.value).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('缺少必填字段'), 'error');
  });

  it('rejects a request without a renderer-selected target field', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr, notify } = createController();

    await controller.handleStartAnalysis(createRequest({ targetFieldIds: [] }));

    expect(openOutpatientEmr).not.toHaveBeenCalled();
    expect(controller.activeRequest.value).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('缺少必填字段'), 'error');
  });

  it.each([
    ['surrounding target whitespace', [' personalHistory']],
    ['duplicate target ids', ['personalHistory', 'personalHistory']],
  ])('rejects %s instead of correcting the renderer selection', async (_label, targetFieldIds) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr } = createController();

    await controller.handleStartAnalysis(createRequest({ targetFieldIds }));

    expect(openOutpatientEmr).not.toHaveBeenCalled();
    expect(controller.activeRequest.value).toBeNull();
  });

  it('rejects a context with no clinical facts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr } = createController();

    await controller.handleStartAnalysis(createRequest({
      recordContext: { recordText: ' ', sections: {}, structuredFacts: [] },
    }));

    expect(openOutpatientEmr).not.toHaveBeenCalled();
  });

  it.each([
    ['surrounding whitespace', { name: ' 张三' }],
    ['an unsupported field', { patientId: 'PAT-1' }],
  ])('rejects patient data with %s', async (_label, patient) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { controller, openOutpatientEmr } = createController();

    await controller.handleStartAnalysis(createRequest({
      patient: patient as OutpatientEmrAnalysisRequest['patient'],
    }));

    expect(openOutpatientEmr).not.toHaveBeenCalled();
  });
});
