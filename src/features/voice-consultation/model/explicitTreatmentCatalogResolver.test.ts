import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatFast } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import { resolveExplicitTreatmentCatalogHints } from './explicitTreatmentCatalogResolver';

vi.mock('@/services/llm', () => ({ chatFast: vi.fn() }));
vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    getCatalogContext: vi.fn(() => ({ orgCode: null, tenantId: null })),
    fetchAvailableExamLabItems: vi.fn(),
    assessLabTestItemMatch: vi.fn(),
    searchLabTestItems: vi.fn(),
    getAllItems: vi.fn(),
    assessMedicineMatch: vi.fn(() => ({ status: 'unmatched', candidate: null, confidence: 0 })),
    assessExamItemMatch: vi.fn(() => ({ status: 'unmatched', candidate: null, confidence: 0 })),
    assessProcedureItemMatch: vi.fn(() => ({ status: 'unmatched', candidate: null, confidence: 0 })),
  },
}));

describe('resolveExplicitTreatmentCatalogHints', () => {
  beforeEach(() => {
    vi.mocked(chatFast).mockReset();
    vi.mocked(medicalDataService.assessLabTestItemMatch).mockReturnValue({
      status: 'probable',
      candidate: { id: 'lab-1', code: 'L1', name: '超敏C反应蛋白', category: '检验' },
      confidence: 0.9,
    });
    vi.mocked(medicalDataService.searchLabTestItems).mockReturnValue([
      { id: 'lab-1', code: 'L1', name: '超敏C反应蛋白', category: '检验' },
      { id: 'lab-2', code: 'L2', name: 'C反应蛋白', category: '检验' },
    ]);
    vi.mocked(medicalDataService.getAllItems).mockReturnValue([]);
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      { id: 'lab-1', code: 'L1', name: '超敏C反应蛋白', category: '检验' },
      { id: 'lab-2', code: 'L2', name: 'C反应蛋白', category: '检验' },
    ]);
  });

  it('uses the fast model to confirm a probable standard catalog candidate', async () => {
    vi.mocked(chatFast).mockResolvedValue('[{"index":0,"catalogRef":"I0C1"}]');
    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'labTest',
      name: 'CRP',
      evidenceText: '医生明确要求查CRP',
      sourceType: 'explicit',
    }], 'consultation-1');

    expect(result[0].matchedItem?.id).toBe('lab-1');
    expect(chatFast).toHaveBeenCalledTimes(1);
  });

  it('does not expose a restricted free item to automatic confirmation for a general order', async () => {
    vi.mocked(medicalDataService.assessLabTestItemMatch).mockReturnValue({
      status: 'unmatched', candidate: null, confidence: 0,
    });
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      { id: 'free', code: 'FREE', name: '血常规（五分类）（免费）', category: '检验', restricted: true },
    ]);

    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'labTest',
      name: '血常规',
      evidenceText: '医生明确要求查血常规',
      sourceType: 'explicit',
    }], 'consultation-1');

    expect(result[0].matchedItem).toBeNull();
    expect(chatFast).not.toHaveBeenCalled();
  });
});
