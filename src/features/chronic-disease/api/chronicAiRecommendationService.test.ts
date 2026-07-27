import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import type { ChronicDiseasePatientSummary } from '../types';

vi.mock('@/services/llm', () => ({
  chat: vi.fn(),
}));

vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    fetchAvailableExamLabItems: vi.fn(),
    getAllItems: vi.fn(() => []),
  },
}));

import { generateChronicAiRecommendations } from './chronicAiRecommendationService';

function buildSummary(): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR001',
    idRecord: 'VIS001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [{
      diseaseType: 'type2_diabetes',
      label: '2 型糖尿病',
      source: 'public-health',
      sourceLabel: '公卫管理',
    }],
    managedDiseaseTypes: ['type2_diabetes'],
    hasSupportedDisease: true,
    isChronicManaged: true,
    diagnosisText: '2 型糖尿病',
    lastVisitLabel: '2026-07-20',
    bloodPressurePoints: [],
    bloodGlucosePoints: [{
      measuredAt: '2026-07-20',
      value: 8.2,
      measurementType: 'fasting',
      sourceLabel: '公卫随访',
    }],
    recentMedicationFacts: [],
    recentMedicationNames: ['二甲双胍片'],
    sourceQuality: 'ready',
  };
}

describe('generateChronicAiRecommendations', () => {
  beforeEach(() => {
    vi.mocked(chat).mockReset();
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockReset();
  });

  it('only maps AI catalog references to current HIS items', async () => {
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      {
        id: 'exam-1',
        code: 'EX001',
        name: '眼底照相',
        category: '检查',
        idSrv: 'SRV-EXAM',
        raw: { idCli: 'CLI-EXAM' },
      },
      {
        id: 'lab-1',
        code: 'LAB001',
        name: '糖化血红蛋白测定',
        category: '检验',
        idSrv: 'SRV-LAB',
        raw: { idCli: 'CLI-LAB' },
      },
    ]);
    vi.mocked(chat).mockResolvedValue(JSON.stringify({
      exams: [{ catalogRef: 'E001', reason: '核实视网膜病变筛查情况' }],
      labTests: [{ catalogRef: 'L001', reason: '评估近期血糖控制' }],
      unavailableNeeds: [],
    }));

    const result = await generateChronicAiRecommendations(buildSummary());

    expect(result).toEqual([
      expect.objectContaining({
        id: 'exam-1',
        type: 'exam',
        name: '眼底照相',
        matchedItem: expect.objectContaining({ idSrv: 'SRV-EXAM' }),
      }),
      expect.objectContaining({
        id: 'lab-1',
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        matchedItem: expect.objectContaining({ idSrv: 'SRV-LAB' }),
      }),
    ]);
    const messages = vi.mocked(chat).mock.calls[0]?.[0];
    expect(messages?.[1]?.content).toContain('E001|眼底照相');
    expect(messages?.[1]?.content).toContain('L001|糖化血红蛋白测定');
  });

  it('does not call AI when the current HIS context has no available catalog items', async () => {
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([]);

    await expect(generateChronicAiRecommendations(buildSummary()))
      .rejects.toThrow('当前 HIS 上下文没有可开立的检查或检验项目');
    expect(chat).not.toHaveBeenCalled();
  });
});
