import { describe, expect, it } from 'vitest';
import type { HisVisitRecord } from '@/services/his/types';
import { buildRecentPrescriptionHistory } from './chronicRefillMedicationHistory';

describe('buildRecentPrescriptionHistory', () => {
  const visits: HisVisitRecord[] = [{
    visitId: 'acute-visit',
    visitTime: new Date('2026-08-10T09:00:00+08:00').getTime(),
    deptName: '全科门诊',
    diagnoses: ['急性上呼吸道感染'],
    medicationOrders: [{
      orderId: 'order-latest',
      productId: 'med-metformin',
      name: '盐酸二甲双胍片',
      spec: '0.5g*60片/瓶',
      days: '30',
      totalQty: '2',
      totalUnit: '瓶',
    }],
  }, {
    visitId: 'chronic-visit',
    visitTime: new Date('2026-07-15T09:00:00+08:00').getTime(),
    deptName: '慢病门诊',
    diagnoses: ['2型糖尿病'],
    medicationOrders: [{
      orderId: 'order-older',
      productId: 'med-metformin',
      name: '盐酸二甲双胍片',
      days: '14',
      totalQty: '1',
      totalUnit: '瓶',
    }, {
      orderId: 'order-other',
      productId: 'med-acarbose',
      name: '阿卡波糖片',
      totalQty: '1',
      totalUnit: '盒',
    }],
  }];

  it('keeps every exact product prescription across acute and chronic visits', () => {
    const result = buildRecentPrescriptionHistory({
      name: '盐酸二甲双胍片',
      productId: 'med-metformin',
    }, visits);

    expect(result.matchBasis).toBe('product-id');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.orderId)).toEqual(['order-latest', 'order-older']);
    expect(result.entries[0]).toMatchObject({ deptName: '全科门诊', totalQty: '2', totalUnit: '瓶' });
  });

  it('falls back to exact normalized name and does not fuzzy-match a similar medicine', () => {
    const exact = buildRecentPrescriptionHistory({ name: '盐酸二甲双胍片（0.5g）' }, visits);
    const similar = buildRecentPrescriptionHistory({ name: '二甲双胍缓释片' }, visits);

    expect(exact.matchBasis).toBe('exact-name');
    expect(exact.entries).toHaveLength(2);
    expect(similar.matchBasis).toBe('none');
    expect(similar.entries).toEqual([]);
  });

  it('marks same-name records with multiple product identifiers as ambiguous', () => {
    const result = buildRecentPrescriptionHistory({ name: '盐酸二甲双胍片' }, [
      ...visits,
      {
        visitId: 'other-product-visit',
        visitTime: new Date('2026-06-20T09:00:00+08:00').getTime(),
        medicationOrders: [{
          orderId: 'other-product-order',
          productId: 'med-metformin-other',
          name: '盐酸二甲双胍片',
          totalQty: '60',
          totalUnit: '片',
        }],
      },
    ]);

    expect(result.matchBasis).toBe('ambiguous-name');
    expect(result.entries).toHaveLength(3);
  });
});
