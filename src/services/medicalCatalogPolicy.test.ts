import { describe, expect, it } from 'vitest';
import {
  adjustRestrictedMedicalItemScore,
  getMedicalCatalogRestrictionReason,
  isRestrictedMedicalCatalogItem,
} from './medicalCatalogPolicy';

describe('medicalCatalogPolicy', () => {
  const freeItem = {
    name: '血常规（五分类）（免费）',
    restricted: true,
    restrictionReason: '仅适用于特定人群',
  };

  it('deprioritizes a restricted free item for a generic clinical request', () => {
    expect(isRestrictedMedicalCatalogItem(freeItem)).toBe(true);
    expect(adjustRestrictedMedicalItemScore(0.99, freeItem, '血常规')).toBeLessThan(0.86);
    expect(getMedicalCatalogRestrictionReason(freeItem)).toBe('仅适用于特定人群');
  });

  it('keeps the original score when the doctor explicitly requests the free program item', () => {
    expect(adjustRestrictedMedicalItemScore(0.99, freeItem, '免费血常规项目')).toBe(0.99);
  });
});
