import { describe, expect, it } from 'vitest';
import {
  buildMutualRecognitionDecisionPayload,
  normalizeMutualRecognitionItems,
} from './mutualRecognition';

describe('mutual recognition contract', () => {
  it('normalizes and deduplicates PHIS recognizable items', () => {
    const items = normalizeMutualRecognitionItems({
      requestId: 'request-1',
      status: 'pending',
      items: [
        {
          idSrv: 'LAB-1',
          idCli: 'CLI-1',
          naSrv: '血常规',
          sdSrv: '41',
          mutualRecognitionCode: 'B32R1WZZZ-00',
          priceSale: 20,
        },
        { idSrv: 'LAB-1', naSrv: '重复血常规', sdSrv: '41' },
        { idSrv: 'EXAM-1', naCli: '胸部CT', sdSrv: '31' },
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      idSrv: 'LAB-1',
      name: '血常规',
      type: 'lab_test',
      mutualRecognitionCode: 'B32R1WZZZ-00',
      priceSale: 20,
    });
    expect(items[1]).toMatchObject({ idSrv: 'EXAM-1', type: 'examination' });
  });

  it('builds a partial recognition decision with the original request id', () => {
    expect(buildMutualRecognitionDecisionPayload({
      consultationId: 'visit-1',
      requestId: 'record-confirmed-1',
      decision: 'recognize',
      recognizedItemIds: ['LAB-1', 'LAB-1', 'EXAM-1'],
      timestamp: 123,
    })).toEqual({
      consultationId: 'visit-1',
      timestamp: 123,
      resultType: 'reference-request',
      requestId: 'record-confirmed-1',
      referenceType: 'batch',
      action: 'batch',
      referenceStatus: 'pending',
      referenceMessage: '等待 PHIS 根据医生互认决策完成保存并回执。',
      recognitionDecision: {
        decision: 'recognize',
        recognizedItemIds: ['LAB-1', 'EXAM-1'],
      },
    });
  });

  it('omits recognized ids for not-recognize and cancel decisions', () => {
    for (const decision of ['not_recognize', 'cancel'] as const) {
      const payload = buildMutualRecognitionDecisionPayload({
        consultationId: 'visit-1',
        requestId: 'request-1',
        decision,
        recognizedItemIds: ['LAB-1'],
      });
      expect(payload.recognitionDecision).toEqual({ decision });
    }
  });
});
