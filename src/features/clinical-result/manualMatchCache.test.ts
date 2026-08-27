import { beforeEach, describe, expect, it, vi } from 'vitest';
import { medicalDataService } from '@/services/medicalData';
import { rememberManualCatalogMatch, resolveRememberedCatalogTarget } from './manualMatchCache';

vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    getCatalogContext: vi.fn(),
    getAllItems: vi.fn(),
    getMatchableMedicines: vi.fn(() => []),
  },
}));

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  get length() { return this.data.size; }
}

describe('manualMatchCache', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
    vi.spyOn(medicalDataService, 'getCatalogContext').mockReturnValue({ orgCode: 'org-1', tenantId: 'tenant-1' });
    vi.spyOn(medicalDataService, 'getAllItems').mockReturnValue([
      { id: 'lab-1', code: 'LAB1', name: '超敏C反应蛋白', category: '检验' },
    ]);
    vi.spyOn(medicalDataService, 'getMatchableMedicines').mockReturnValue([
      { id: 'med-1', code: 'MED1', name: '苯磺酸氨氯地平片', spec: '5mg*28片/盒' } as never,
    ]);
  });

  it('restores a persistent medicine mapping only inside the current institution scope', () => {
    rememberManualCatalogMatch('medicine', '氨氯地平', {
      id: 'med-1', name: '苯磺酸氨氯地平片',
    });
    expect(resolveRememberedCatalogTarget('medicine', '氨氯地平')?.id).toBe('med-1');

    vi.mocked(medicalDataService.getCatalogContext).mockReturnValue({ orgCode: 'org-2', tenantId: 'tenant-1' });
    expect(resolveRememberedCatalogTarget('medicine', '氨氯地平')).toBeUndefined();
  });

  it('does not persist or restore exam and lab mappings across receptions', () => {
    rememberManualCatalogMatch('lab_test', 'CRP', {
      id: 'lab-1', name: '超敏C反应蛋白',
    });

    expect(resolveRememberedCatalogTarget('lab_test', 'CRP')).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('CLINICAL_RESULT_MANUAL_MATCH_CACHE_V1') || '[]')).toEqual([]);
  });

  it('removes legacy exam and lab entries while preserving other mappings', () => {
    localStorage.setItem('CLINICAL_RESULT_MANUAL_MATCH_CACHE_V1', JSON.stringify([
      {
        orgCode: 'org-1',
        tenantId: 'tenant-1',
        type: 'lab_test',
        sourceKey: 'crp',
        targetId: 'lab-1',
        targetName: '超敏C反应蛋白',
        confirmCount: 1,
        lastConfirmedAt: 1,
      },
      {
        orgCode: 'org-1',
        tenantId: 'tenant-1',
        type: 'medicine',
        sourceKey: '氨氯地平',
        targetId: 'med-1',
        targetName: '苯磺酸氨氯地平片',
        confirmCount: 1,
        lastConfirmedAt: 2,
      },
    ]));

    expect(resolveRememberedCatalogTarget('lab_test', 'CRP')).toBeUndefined();
    expect(resolveRememberedCatalogTarget('medicine', '氨氯地平')?.id).toBe('med-1');
    expect(JSON.parse(localStorage.getItem('CLINICAL_RESULT_MANUAL_MATCH_CACHE_V1') || '[]'))
      .toEqual([expect.objectContaining({ type: 'medicine', targetId: 'med-1' })]);
  });
});
