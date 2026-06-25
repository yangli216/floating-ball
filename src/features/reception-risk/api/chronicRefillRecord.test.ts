import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatientContext } from '@/utils/patientContext';
import { chat } from '@/services/llm';
import { loadAvailableMedicineInventoryContext } from '@features/clinical-result';
import { generateChronicRefillRecord } from './chronicRefillRecord';

vi.mock('@/services/llm', () => ({
  chat: vi.fn(),
}));

vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    matchDiagnosis: vi.fn(() => null),
    matchMedicine: vi.fn(() => null),
  },
}));

vi.mock('@features/clinical-result', async () => {
  const actual = await vi.importActual<any>('@features/clinical-result');
  return {
    ...actual,
    loadAvailableMedicineInventoryContext: vi.fn(),
    parseLLMJson: vi.fn(),
  };
});

describe('generateChronicRefillRecord', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(chat).mockRejectedValue(new Error('use fallback'));
    vi.mocked(loadAvailableMedicineInventoryContext).mockResolvedValue({
      items: [{
        productId: 'med-1',
        productName: '苯磺酸氨氯地平片',
        spec: '5mg*28片/盒',
        unit: '盒',
        availableQuantity: 12,
        storeIds: ['1760'],
        storeNames: ['西药房'],
      }],
      promptContext: '',
      pharmacyCount: 1,
      staleStoreCount: 0,
    });
  });

  it('creates a refill-specific record and suppresses generic treatment generation', async () => {
    const patient = buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-current',
        name: '张建国',
      },
    });

    const result = await generateChronicRefillRecord(patient!, {
      diagnosis: '高血压',
      diagnoses: ['高血压'],
      medications: ['苯磺酸氨氯地平片（5mg*28片）', '厄贝沙坦片 150mg'],
      chronicVisitCount: 1,
      chronicVisits: [{
        visitTime: Date.parse('2026-06-01T08:00:00+08:00'),
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片（5mg*28片）'],
      }],
      evidenceText: '高血压历史处方',
    });

    expect(result.chiefComplaint).toContain('高血压定期复诊续方');
    expect(result.historyOfPresentIllness).not.toContain('未提供新发不适信息');
    expect(result.historyOfPresentIllness).toContain('服药依从性');
    expect(result.treatments).toHaveLength(2);
    expect(result.treatments[0].name).toBe('苯磺酸氨氯地平片');
    expect(result.treatments.every((item) => item.type === 'medicine')).toBe(true);
    expect(result.treatments[1]).toMatchObject({
      name: '厄贝沙坦片',
      selected: false,
      matchStatus: 'unmatched',
    });
    expect(result.recommendationPolicy).toEqual({
      autoFetchTreatments: false,
      allowTreatmentRefresh: false,
      allowedTreatmentTypes: ['medicine'],
    });
  });
});
