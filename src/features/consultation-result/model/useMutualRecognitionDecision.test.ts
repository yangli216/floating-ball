import { describe, expect, it, vi } from 'vitest';
import { useMutualRecognitionDecision } from './useMutualRecognitionDecision';

describe('useMutualRecognitionDecision', () => {
  it('opens only for the current writeback and sends a partial decision with the same request id', async () => {
    const sendDecision = vi.fn().mockResolvedValue(undefined);
    const controller = useMutualRecognitionDecision({
      resolveConsultationId: () => 'visit-1',
      resolvePendingRequestId: () => 'request-1',
      sendDecision,
    });

    expect(controller.handleFeedback({
      consultationId: 'visit-1',
      requestId: 'request-1',
      status: 'pending',
      items: [
        { idSrv: 'LAB-1', naSrv: '血常规', sdSrv: '41', mutualRecognitionCode: 'M-1' },
        { idSrv: 'EXAM-1', naSrv: '胸部DR', sdSrv: '31', mutualRecognitionCode: 'M-2' },
      ],
    })).toBe(true);
    expect(controller.open.value).toBe(true);
    expect(controller.selectedItemIds.value).toEqual(['LAB-1', 'EXAM-1']);

    controller.setItemSelected('EXAM-1', false);
    await controller.submitDecision('recognize');

    expect(sendDecision).toHaveBeenCalledWith(expect.objectContaining({
      consultationId: 'visit-1',
      requestId: 'request-1',
      resultType: 'reference-request',
      recognitionDecision: {
        decision: 'recognize',
        recognizedItemIds: ['LAB-1'],
      },
    }));
    expect(controller.open.value).toBe(false);
  });

  it('consumes stale pending feedback without opening the dialog', () => {
    const controller = useMutualRecognitionDecision({
      resolveConsultationId: () => 'visit-1',
      resolvePendingRequestId: () => 'request-current',
    });

    expect(controller.handleFeedback({
      requestId: 'request-old',
      status: 'pending',
      items: [{ idSrv: 'LAB-1', naSrv: '血常规', sdSrv: '41' }],
    })).toBe(true);
    expect(controller.open.value).toBe(false);
  });
});
