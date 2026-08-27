import { describe, expect, it, vi } from 'vitest';
import { chat, chatFast } from '@/services/llm';
import {
  loadAvailableMedicineInventoryContext,
  mapAuxiliaryCatalogRecommendations,
} from '@features/clinical-result';
import { generateVoiceTreatmentRecommendations } from './voiceTreatmentRecommendationGeneration';

vi.mock('@/services/llm', () => ({ chat: vi.fn(), chatFast: vi.fn() }));
vi.mock('@/prompts', () => ({
  PROMPTS: {
    consultation: {
      treatmentRecommendation: { system: '', buildUserPrompt: vi.fn(() => '') },
      auxiliaryCatalogRecommendation: { system: '', buildUserPrompt: vi.fn(() => '') },
      procedureRecommendation: { system: '', buildUserPrompt: vi.fn(() => '') },
    },
  },
}));
vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    fetchAvailableExamLabItems: vi.fn(async () => [{ id: 'lab-1', code: 'L1', name: '血常规', category: '检验' }]),
  },
}));
vi.mock('@/services/his', () => ({}));
vi.mock('@features/clinical-result', () => ({
  alignMedicineRecommendationsToInventory: vi.fn((items) => items),
  assessTreatmentCatalogMatch: vi.fn(() => ({ matchStatus: 'unmatched' })),
  buildClinicalResultTreatmentRecommendationsFromRaw: vi.fn(() => []),
  buildClinicalResultTreatmentRequestSpec: vi.fn(() => ({ messages: [], config: {} })),
  buildInstitutionAuxiliaryCatalogContext: vi.fn(() => ({
    entries: [{ ref: 'L001', type: 'lab_test', item: { id: 'lab-1', code: 'L1', name: '血常规', category: '检验' } }],
    promptContext: '【检验目录】\nL001|血常规|组合',
    counts: { exam: 0, labTest: 1 },
  })),
  loadAvailableMedicineInventoryContext: vi.fn(),
  mapAuxiliaryCatalogRecommendations: vi.fn(() => [{
    type: 'lab_test', name: '血常规', reason: '评估感染', selected: false,
  }]),
  parseLLMJson: vi.fn((value) => JSON.parse(value)),
}));

describe('generateVoiceTreatmentRecommendations', () => {
  it('does not load medicine inventory when the M1 plan only requests lab tests', async () => {
    vi.mocked(chatFast).mockResolvedValue('{"exams":[],"labTests":[{"catalogRef":"L001","reason":"评估感染"}]}');
    const taskResults: string[] = [];

    const results = await generateVoiceTreatmentRecommendations({
      patientName: '患者',
      gender: '男',
      age: '35岁',
      diagnosisName: '急性支气管炎',
      diagnosisCode: 'J20.900',
      chiefComplaint: '咳嗽2天',
      clinicalContext: '受凉后咳嗽',
      requestedTypes: ['lab_test'],
      explicitTreatments: [],
      pharmacies: [],
      consultationId: 'visit-1',
      normalize: (item) => item as never,
      onTaskResult: (result) => { taskResults.push(result.key); },
    });

    expect(loadAvailableMedicineInventoryContext).not.toHaveBeenCalled();
    expect((await import('@/services/medicalData')).medicalDataService.fetchAvailableExamLabItems).toHaveBeenCalledTimes(1);
    expect(chat).not.toHaveBeenCalled();
    expect(chatFast).toHaveBeenCalledTimes(1);
    expect(mapAuxiliaryCatalogRecommendations).toHaveBeenCalledTimes(1);
    expect(results[0].types).toEqual(['lab_test']);
    expect(taskResults).toEqual(['auxiliary']);
  });
});
