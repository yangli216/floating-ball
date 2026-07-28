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

let hisAdapter: {
  fetchDiagnosisCatalog: ReturnType<typeof vi.fn>;
  loadVisCliList: ReturnType<typeof vi.fn>;
};

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
    vi.mocked(getHisAdapter).mockReset();
    hisAdapter = {
      fetchDiagnosisCatalog: vi.fn().mockResolvedValue([{
        id: 'DM2-ID',
        code: 'E11.900',
        name: '2型糖尿病',
      }]),
      loadVisCliList: vi.fn().mockResolvedValue([{
        idSrv: 'SRV-LAB',
        idCli: 'CLI-LAB',
        naSrv: '糖化血红蛋白测定',
        itemKind: '1',
        priceSale: 25,
        idDeptExec: 'DEPT-LAB',
      }]),
    };
    vi.mocked(getHisAdapter).mockReturnValue(
      hisAdapter as unknown as ReturnType<typeof getHisAdapter>,
    );
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
    const recordContext = shallowRef({
      chiefComplaint: '2型糖尿病复诊配药',
      historyOfPresentIllness: '既往确诊2型糖尿病，今复诊配药。',
      pastMedicalHistory: '2型糖尿病',
      allergyHistory: '未发现',
    });
    const state = useChronicAiRecommendations({
      summary,
      patientAnchorId,
      recordContext,
    });

    await state.load();

    expect(hisAdapter.loadVisCliList).not.toHaveBeenCalled();
    expect(state.selectedIds.value).toEqual(['lab-1']);
    expect(state.summaryText.value).toBe('1 项已选 · 1/1');
    const draft = await state.prepareDraft('REQ001');
    expect(hisAdapter.fetchDiagnosisCatalog).toHaveBeenCalledTimes(1);
    expect(hisAdapter.loadVisCliList).toHaveBeenCalledTimes(1);
    expect(draft.patientAnchorId).toBe('VIS001');
    expect(draft.standardDiagnoses).toEqual([{
      id: 'DM2-ID',
      code: 'E11.900',
      name: '2型糖尿病',
    }]);
    expect(draft.recordContext).toEqual(recordContext.value);
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

  it('starts diagnosis-catalog and loadVis requests together while preparing the draft', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([{
      id: 'lab-1',
      type: 'lab_test',
      name: '糖化血红蛋白测定',
      reason: '评估近期血糖控制',
      matchedItem: {
        id: 'lab-1',
        name: '糖化血红蛋白测定',
        idSrv: 'SRV-LAB',
      },
    }]);
    const state = useChronicAiRecommendations({
      summary: shallowRef(buildSummary()),
      patientAnchorId: shallowRef('VIS001'),
    });
    await state.load();

    let resolveDiagnosisCatalog!: (value: Array<{
      id: string;
      code: string;
      name: string;
    }>) => void;
    hisAdapter.fetchDiagnosisCatalog.mockReturnValue(new Promise((resolve) => {
      resolveDiagnosisCatalog = resolve;
    }));

    const pendingDraft = state.prepareDraft('REQ-PARALLEL');

    expect(hisAdapter.fetchDiagnosisCatalog).toHaveBeenCalledTimes(1);
    expect(hisAdapter.loadVisCliList).toHaveBeenCalledTimes(1);
    resolveDiagnosisCatalog([{
      id: 'DM2-ID',
      code: 'E11.900',
      name: '2型糖尿病',
    }]);

    await expect(pendingDraft).resolves.toEqual(expect.objectContaining({
      requestId: 'REQ-PARALLEL',
      standardDiagnoses: [expect.objectContaining({ id: 'DM2-ID' })],
    }));
  });

  it('builds standard diagnoses from clinical diseaseTags even without public-health management', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([{
      id: 'lab-1',
      type: 'lab_test',
      name: '糖化血红蛋白测定',
      reason: '评估近期血糖控制',
      matchedItem: {
        id: 'lab-1',
        name: '糖化血红蛋白测定',
        idSrv: 'SRV-LAB',
      },
    }]);
    const clinicalSummary = buildSummary();
    clinicalSummary.diseaseTags = clinicalSummary.diseaseTags.map((tag) => ({
      ...tag,
      source: 'clinical',
      sourceLabel: '临床识别',
    }));
    clinicalSummary.managedDiseaseTypes = [];
    clinicalSummary.isChronicManaged = false;
    const state = useChronicAiRecommendations({
      summary: shallowRef(clinicalSummary),
      patientAnchorId: shallowRef('VIS001'),
    });

    await state.load();
    const draft = await state.prepareDraft('REQ-CLINICAL');

    expect(draft.standardDiagnoses).toEqual([{
      id: 'DM2-ID',
      code: 'E11.900',
      name: '2型糖尿病',
    }]);
  });

  it('shows every recommendation already mapped from the current HIS catalog', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([
      {
        id: 'lab-1',
        type: 'lab_test',
        name: '糖化血红蛋白测定',
        reason: '评估近期血糖控制',
        matchedItem: {
          id: 'lab-1',
          name: '糖化血红蛋白测定',
          idSrv: 'SRV-LAB',
        },
      },
      {
        id: 'lab-static',
        type: 'lab_test',
        name: '血浆凝血因子XIII活性测定',
        reason: '模型从当前目录选中的项目',
        matchedItem: {
          id: 'lab-static',
          name: '血浆凝血因子XIII活性测定',
          idSrv: 'STATIC-28350',
        },
      },
    ]);
    const summary = shallowRef(buildSummary());
    const patientAnchorId = shallowRef('VIS001');
    const state = useChronicAiRecommendations({ summary, patientAnchorId });

    await state.load();

    expect(state.items.value.map((item) => item.name)).toEqual([
      '糖化血红蛋白测定',
      '血浆凝血因子XIII活性测定',
    ]);
    expect(state.selectedIds.value).toEqual(['lab-1', 'lab-static']);
    expect(hisAdapter.loadVisCliList).not.toHaveBeenCalled();
    expect(state.loaded.value).toBe(true);
  });

  it('keeps current catalog recommendations when optional loadVis enrichment is empty', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([
      {
        id: 'lab-static',
        type: 'lab_test',
        name: '血浆凝血因子XIII活性测定',
        reason: '模型从当前目录选中的项目',
        matchedItem: {
          id: 'lab-static',
          name: '血浆凝血因子XIII活性测定',
          idSrv: 'STATIC-28350',
        },
      },
    ]);
    hisAdapter.loadVisCliList.mockResolvedValue([]);
    const state = useChronicAiRecommendations({
      summary: shallowRef(buildSummary()),
      patientAnchorId: shallowRef('VIS001'),
    });

    await state.load();
    const draft = await state.prepareDraft('REQ-NO-MAPPING');

    expect(state.items.value).toHaveLength(1);
    expect(state.selectedIds.value).toEqual(['lab-static']);
    expect(state.loaded.value).toBe(true);
    expect(state.error.value).toBe('');
    expect(draft.items[0]?.matchedItem).toEqual(expect.objectContaining({
      id: 'lab-static',
      idSrv: 'STATIC-28350',
    }));
  });

  it('continues with the HIS catalog snapshot when optional loadVis enrichment fails', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([{
      id: 'lab-1',
      type: 'lab_test',
      name: '糖化血红蛋白测定',
      reason: '评估近期血糖控制',
      matchedItem: {
        id: 'lab-1',
        code: 'SRV-LAB',
        name: '糖化血红蛋白测定',
        idSrv: 'SRV-LAB',
      },
    }]);
    hisAdapter.loadVisCliList.mockRejectedValue(new Error('mapping endpoint unavailable'));
    const state = useChronicAiRecommendations({
      summary: shallowRef(buildSummary()),
      patientAnchorId: shallowRef('VIS001'),
    });

    await state.load();
    const draft = await state.prepareDraft('REQ-MAPPING-ERROR');

    expect(draft.items[0]?.matchedItem).toEqual(expect.objectContaining({
      idSrv: 'SRV-LAB',
    }));
    expect(state.prepareError.value).toBe('');
  });

  it('forces a fresh current HIS catalog query on retry without invoking optional mapping', async () => {
    vi.mocked(generateChronicAiRecommendations).mockResolvedValue([]);
    const state = useChronicAiRecommendations({
      summary: shallowRef(buildSummary()),
      patientAnchorId: shallowRef('VIS001'),
    });

    await state.load(true);

    expect(generateChronicAiRecommendations).toHaveBeenCalledWith(
      expect.any(Object),
      { forceCatalog: true },
    );
    expect(hisAdapter.loadVisCliList).not.toHaveBeenCalled();
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
