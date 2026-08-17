import { describe, expect, it, vi } from 'vitest';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { useSymptomConsultationFinalWriteback } from './useSymptomConsultationFinalWriteback';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const diagnosis = {
  name: '上呼吸道感染',
  code: 'J06.900',
  rate: '高',
  rationale: '符合当前症状',
} satisfies Diagnosis;

const labItem = {
  type: 'lab_test',
  name: '血常规',
  reason: '辅助判断感染',
  selected: true,
  matchedItem: {
    id: 'LAB-1',
    name: '血常规',
    sdSrv: '41',
    mutualRecognitionCode: 'MUTUAL-1',
  },
} satisfies TreatmentRecommendation;

function createController(onSuccess = vi.fn()) {
  return useSymptomConsultationFinalWriteback({
    resolveConsultationId: () => 'visit-1',
    canSubmit: () => true,
    getSelectedDiagnosis: () => diagnosis,
    getPatientTetId: () => 'tenant-1',
    getRecord: () => ({ chiefComplaint: '发热1天', historyOfPresentIllness: '患者发热1天。' }),
    getPastMedicalHistory: () => '既往体健。',
    runPreflight: async () => ({ ready: true, selected: [labItem] }),
    orderItemResolvers: {
      getServiceCode: (item) => item.matchedItem?.sdSrv || '',
      getServiceId: (item) => item.matchedItem?.id || '',
      getServiceName: (item) => item.name,
      getExecDeptId: () => 'DEPT-1',
      getPartId: () => '',
      getJsonField: () => '{}',
    },
    notify: vi.fn(),
    formatError: () => '发送失败',
    onSuccess,
  });
}

describe('useSymptomConsultationFinalWriteback', () => {
  it('registers the request before dispatch so an immediate pending feedback can open the dialog', async () => {
    let resolveInvoke!: () => void;
    invokeMock.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveInvoke = resolve; }));
    const controller = createController();

    const submitPromise = controller.submit();
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledOnce());
    const result = invokeMock.mock.calls[0][1].result as Record<string, any>;

    expect(controller.pendingRequestId.value).toBe(result.requestId);
    expect(result.orderList[0].mutualRecognitionCode).toBe('MUTUAL-1');
    expect(controller.consumeMutualRecognitionFeedback({
      consultationId: 'visit-1',
      requestId: result.requestId,
      status: 'pending',
      items: [{ idSrv: 'LAB-1', naSrv: '血常规', sdSrv: '41', mutualRecognitionCode: 'MUTUAL-1' }],
    })).toBe(true);
    expect(controller.mutualRecognition.open.value).toBe(true);

    resolveInvoke();
    await submitPromise;
  });

  it('finishes only after a matching final success feedback', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    const controller = createController(onSuccess);
    await controller.submit();
    const requestId = controller.pendingRequestId.value;

    controller.finalizeFeedback({ requestId: 'other', status: 'success' });
    expect(controller.busy.value).toBe(true);
    controller.finalizeFeedback({ requestId, status: 'success' });

    expect(controller.busy.value).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith('visit-1');
  });
});
