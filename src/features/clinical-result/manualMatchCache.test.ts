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
  });

  it('restores a confirmed mapping only inside the current institution scope', () => {
    rememberManualCatalogMatch('lab_test', 'CRP', {
      id: 'lab-1', name: '超敏C反应蛋白',
    });
    expect(resolveRememberedCatalogTarget('lab_test', 'crp')?.id).toBe('lab-1');

    vi.mocked(medicalDataService.getCatalogContext).mockReturnValue({ orgCode: 'org-2', tenantId: 'tenant-1' });
    expect(resolveRememberedCatalogTarget('lab_test', 'CRP')).toBeUndefined();
  });
});
