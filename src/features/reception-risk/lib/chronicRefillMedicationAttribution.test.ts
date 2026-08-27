import { describe, expect, it } from 'vitest';
import type { HisVisitRecord } from '@/services/his/types';
import {
  buildChronicRefillMedicationAttributionItems,
  normalizeChronicRefillMedicationAttributions,
  selectAttributedChronicRefillVisitMedications,
} from './chronicRefillMedicationAttribution';

const conditions = [
  { id: '高血压', diagnosis: '原发性高血压', diagnosisGroup: '高血压' },
  { id: '骨质疏松', diagnosis: '骨质疏松', diagnosisGroup: '骨质疏松' },
];

describe('chronicRefillMedicationAttribution', () => {
  it('builds stable items from structured prescriptions before text summaries', () => {
    const visit: HisVisitRecord = {
      visitId: 'visit-20260715',
      visitTime: new Date('2026-07-15T08:18:08+08:00').getTime(),
      medications: ['缬沙坦片 10mg*7片/盒', '碳酸钙片 0.3g*140片/瓶'],
      medicationOrders: [
        { orderId: 'order-valsartan', productId: 'med-1', name: '缬沙坦片', spec: '10mg*7片/盒' },
        { orderId: 'order-calcium', productId: 'med-2', name: '碳酸钙片', spec: '0.3g*140片/瓶' },
      ],
    };

    const result = buildChronicRefillMedicationAttributionItems(visit, conditions);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([
      'visit-20260715::order-valsartan::0',
      'visit-20260715::order-calcium::0',
    ]);
    expect(result.every((item) => item.source === 'structured')).toBe(true);
    expect(result[0].candidateConditionIds).toEqual(['高血压', '骨质疏松']);
  });

  it('accepts only whitelisted item and condition ids from the model', () => {
    const items = buildChronicRefillMedicationAttributionItems({
      visitId: 'visit-1',
      visitTime: 1,
      medicationOrders: [
        { orderId: 'order-valsartan', name: '缬沙坦片' },
        { orderId: 'order-calcium', name: '碳酸钙片' },
      ],
    }, conditions);

    const result = normalizeChronicRefillMedicationAttributions(items, {
      assignments: [
        {
          itemId: items[0].id,
          conditionId: '高血压',
          confidence: 'high',
          reason: '  常用降压药  ',
        },
        {
          itemId: items[1].id,
          conditionId: '模型新增诊断',
          confidence: 'high',
          reason: '越权归类',
        },
        {
          itemId: 'unknown-item',
          conditionId: '骨质疏松',
          confidence: 'high',
          reason: '模型新增药品',
        },
      ],
    });

    expect(result[0]).toMatchObject({
      suggestedConditionId: '高血压',
      confidence: 'high',
      reason: '常用降压药',
    });
    expect(result[1].suggestedConditionId).toBeUndefined();
  });

  it('restores only high or medium confidence medication assigned to a selected condition', () => {
    const visit: HisVisitRecord = {
      visitId: 'visit-1',
      visitTime: 1,
      medications: ['缬沙坦片（10mg*7片）', '碳酸钙片（0.3g*140片）'],
      medicationOrders: [
        { orderId: 'order-valsartan', name: '缬沙坦片' },
        { orderId: 'order-calcium', name: '碳酸钙片' },
      ],
    };
    const items = buildChronicRefillMedicationAttributionItems(visit, conditions).map((item) => ({
      ...item,
      suggestedConditionId: item.medication.name === '缬沙坦片' ? '高血压' : '骨质疏松',
      confidence: 'high' as const,
    }));
    const result = selectAttributedChronicRefillVisitMedications(
      visit,
      items,
      new Set(['高血压']),
    );

    expect(result.medications).toEqual(['缬沙坦片（10mg*7片）']);
    expect(result.medicationOrders).toEqual([
      expect.objectContaining({ orderId: 'order-valsartan' }),
    ]);

    const lowConfidenceResult = selectAttributedChronicRefillVisitMedications(
      visit,
      items.map((item) => item.medication.name === '缬沙坦片'
        ? { ...item, confidence: 'low' as const }
        : item),
      new Set(['高血压']),
    );
    expect(lowConfidenceResult.medications).toBeUndefined();
    expect(lowConfidenceResult.medicationOrders).toBeUndefined();
  });
});
