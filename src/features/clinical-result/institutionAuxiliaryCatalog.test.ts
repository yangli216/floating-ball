import { describe, expect, it, vi } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';

vi.mock('@/services/medicalData', () => ({
  medicalDataService: { getAllItems: vi.fn(() => []) },
}));

import {
  buildInstitutionAuxiliaryCatalogContext,
  mapAuxiliaryCatalogRecommendations,
} from './institutionAuxiliaryCatalog';

const normalize = (item: Partial<TreatmentRecommendation>) => item as TreatmentRecommendation;

describe('institutionAuxiliaryCatalog', () => {
  const context = buildInstitutionAuxiliaryCatalogContext([
    { id: 'exam-1', code: 'EX1', name: '胸部正位片', category: '检查' },
    { id: 'lab-1', code: 'LAB1', name: '血常规', category: '检验', jsonField: '{"fgCombination":true}' },
  ]);

  it('builds compact separated catalog references', () => {
    expect(context.promptContext).toContain('E001|胸部正位片|单项|通用');
    expect(context.promptContext).toContain('L001|血常规|组合|通用');
  });

  it('accepts only valid references in the requested category', () => {
    const result = mapAuxiliaryCatalogRecommendations({
      exams: [{ catalogRef: 'E001', reason: '排查肺部感染' }],
      labTests: [{ catalogRef: 'E001' }, { catalogRef: 'L001', reason: '评估感染' }],
    }, context, ['exam', 'lab_test'], normalize);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.matchedItem?.id)).toEqual(['exam-1', 'lab-1']);
    expect(result.every((item) => item.selected === false)).toBe(true);
  });

  it('places restricted free-program items behind general items and labels their eligibility constraint', () => {
    const restrictedContext = buildInstitutionAuxiliaryCatalogContext([
      { id: 'free', code: 'FREE', name: '血常规（五分类）（免费）', category: '检验', restricted: true, restrictionReason: '仅适用于特定人群' },
      { id: 'general', code: 'GENERAL', name: '血常规（五分类）', category: '检验' },
    ], ['lab_test'], { includeRestricted: true });

    expect(restrictedContext.entries.map((entry) => entry.item.id)).toEqual(['general', 'free']);
    expect(restrictedContext.promptContext).toContain('L002|血常规（五分类）（免费）|单项|受限：仅适用于特定人群');
  });

  it('excludes restricted items from automatic recommendation unless eligibility is explicit', () => {
    const restrictedContext = buildInstitutionAuxiliaryCatalogContext([
      { id: 'free', code: 'FREE', name: '血常规（五分类）（免费）', category: '检验', restricted: true },
      { id: 'general', code: 'GENERAL', name: '血常规（五分类）', category: '检验' },
    ], ['lab_test']);

    expect(restrictedContext.entries.map((entry) => entry.item.id)).toEqual(['general']);
  });
});
