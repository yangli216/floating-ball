import { nextTick, shallowRef } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChronicDiseasePatientSummary } from '../types';
import { generateChronicAiRecommendations } from '../api/chronicAiRecommendationService';
import { getHisAdapter } from '@/services/his';

vi.mock('../api/chronicAiRecommendationService', () => ({
  generateChronicAiRecommendations: vi.fn(),
}));
vi.mock('@/services/his', () => ({
  getHisAdapter: vi.fn(),
}));

import { useChronicAiRecommendations } from './useChronicAiRecommendations';

function buildSummary(idRecord = 'VIS001'): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR001',
    idRecord,
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
    lastVisitLabel: '待核实',
    bloodPressurePoints: [],
    bloodGlucosePoints: [],
    recentMedicationFacts: [],
    recentMedicationNames: [],
    sourceQuality: 'partial',
  };
}

describe('useChronicAiRecommendations', () => {
  beforeEach(() => {
    vi.mocked(generateChronicAiRecommendations).mockReset();
    vi.mocked(getHisAdapter).mockReturnValue({
      loadVisCliList: vi.fn().mockResolvedValue([{
        idSrv: 'SRV-LAB',
        idCli: 'CLI-LAB',
        naSrv: '糖化血红蛋白测定',
        itemKind: '1',
        priceSale: 25,
        idDeptExec: 'DEPT-LAB',
      }]),
    } as unknown as ReturnType<typeof getHisAdapter>);
  });

  it('loads exact HIS recommendations, tracks selection, and preserves matched items in the draft', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([
      {
        id: 'lab-1',
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        reason: '评估近期血糖控制',
        matchedItem: {
          id: 'lab-1',
          code: 'LAB001',
          name: '糖化血红蛋白测定',
          idSrv: 'SRV-LAB',
        },
      },
    ]);
    const summary = shallowRef(buildSummary());
    const patientAnchorId = shallowRef('VIS001');
    const state = useChronicAiRecommendations({ summary, patientAnchorId });

    await state.load();

    expect(state.selectedIds.value).toEqual(['lab-1']);
    expect(state.summaryText.value).toBe('1 项已选 · 1/1');
    const draft = await state.prepareDraft('REQ001');
    expect(draft.patientAnchorId).toBe('VIS001');
    expect(draft.items[0]).toEqual(expect.objectContaining({
      sourceId: 'lab-1',
      matchedItem: expect.objectContaining({
        idSrv: 'SRV-LAB',
        idCli: 'CLI-LAB',
        idDeptExec: 'DEPT-LAB',
      }),
    }));

    state.toggleSelection('lab-1');
    expect(state.selectedIds.value).toEqual([]);
  });

  it('clears recommendations when the patient visit anchor changes', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([]);
    const summary = shallowRef(buildSummary());
    const patientAnchorId = shallowRef('VIS001');
    const state = useChronicAiRecommendations({ summary, patientAnchorId });
    await state.load();
    expect(state.loaded.value).toBe(true);

    patientAnchorId.value = 'VIS002';
    await nextTick();

    expect(state.loaded.value).toBe(false);
    expect(state.items.value).toEqual([]);
  });
});
