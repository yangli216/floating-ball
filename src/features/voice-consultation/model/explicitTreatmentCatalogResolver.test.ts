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
    searchExamItems: vi.fn(),
    searchMedicines: vi.fn(() => []),
    searchProcedureItems: vi.fn(() => []),
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
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify([{
      index: 0,
      catalogRef: 'I0C1',
      confidence: 'high',
      goal: '评估炎症反应',
      goalGroup: '感染与炎症评估',
      goalGroupPurpose: '判断感染证据并评估炎症程度',
      necessity: 'core',
      reason: '医生明确要求查CRP，映射到院内超敏C反应蛋白项目',
    }]));
    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'labTest',
      name: 'CRP',
      evidenceText: '医生明确要求查CRP',
      sourceType: 'explicit',
    }], 'consultation-1');

    expect(result[0].matchedItem?.id).toBe('lab-1');
    expect(result[0]).toMatchObject({
      matchStatus: 'exact',
      selected: false,
      sourceType: 'explicit',
      evidenceText: '医生明确要求查CRP',
      goalGroup: '感染与炎症评估',
    });
    expect(chatFast).toHaveBeenCalledTimes(1);
  });

  it('uses the full clinical conversation to complete an ambiguous B-ultrasound order inside the live catalog', async () => {
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      { id: 'exam-abdomen', code: 'E1', name: '肝胆胰脾肾彩超', category: '检查', keywords: ['上腹部', '腹部超声'] },
      { id: 'exam-thyroid', code: 'E2', name: '甲状腺彩超', category: '检查', keywords: ['甲状腺'] },
    ]);
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify([{
      index: 0,
      catalogRef: 'I0C1',
      confidence: 'medium',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
      necessity: 'core',
      reason: '医生提出做B超；结合上腹部不适补全为肝胆胰脾肾彩超',
    }]));

    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'examination',
      name: 'B超',
      evidenceText: '医生：给你做个B超检查',
      sourceType: 'explicit',
    }], 'consultation-2', {
      transcript: '患者：昨晚喝酒后上腹部不舒服。医生：给你做个B超检查。',
      chiefComplaint: '上腹不适伴呕吐1天',
      historyOfPresentIllness: '饮酒后出现上腹部不适',
      diagnosisNames: ['急性胃炎'],
    });

    expect(result[0]).toMatchObject({
      matchedItem: { id: 'exam-abdomen', name: '肝胆胰脾肾彩超' },
      matchStatus: 'exact',
      selected: false,
      sourceType: 'explicit',
      evidenceText: '医生：给你做个B超检查',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
      necessity: 'core',
    });
    const prompt = vi.mocked(chatFast).mock.calls[0]?.[0]?.[1]?.content || '';
    expect(prompt).toContain('昨晚喝酒后上腹部不舒服');
    expect(prompt).toContain('上腹不适伴呕吐1天');
    expect(prompt).toContain('肝胆胰脾肾彩超');
    expect(prompt).toContain('甲状腺彩超');
  });

  it('rechecks a normalized specific name when the doctor only said a generic B-ultrasound phrase', async () => {
    const abdomenExam = {
      id: 'exam-abdomen', code: 'E1', name: '肝胆胰脾肾彩超', category: '检查',
    };
    vi.mocked(medicalDataService.assessExamItemMatch).mockReturnValue({
      status: 'exact', candidate: abdomenExam, confidence: 1,
    });
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      abdomenExam,
      { id: 'exam-urinary', code: 'E2', name: '泌尿系彩超', category: '检查' },
    ]);
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify([{
      index: 0,
      catalogRef: 'I0C1',
      confidence: 'medium',
      goal: '评估上腹部不适相关脏器情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '结合上腹部症状定位腹部病变线索',
      necessity: 'core',
      reason: '医生原话仅提出B超；结合上腹部不适补全为肝胆胰脾肾彩超',
    }]));

    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'examination',
      name: '肝胆胰脾肾彩超',
      evidenceText: '医生：给你做个B超检查',
      sourceType: 'explicit',
    }], 'consultation-2b', {
      historyOfPresentIllness: '饮酒后出现上腹部不适',
    });

    expect(chatFast).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      matchedItem: { id: 'exam-abdomen' },
      selected: false,
      goalGroup: '腹部影像评估',
    });
  });

  it('keeps an ambiguous auxiliary order unmatched when contextual confidence is low', async () => {
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      { id: 'exam-abdomen', code: 'E1', name: '肝胆胰脾肾彩超', category: '检查' },
    ]);
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify([{
      index: 0,
      catalogRef: null,
      confidence: 'low',
      goal: '',
      goalGroup: '',
      goalGroupPurpose: '',
      necessity: 'core',
      reason: '对话未说明检查部位，无法唯一确定项目',
    }]));

    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'examination',
      name: 'B超',
      sourceType: 'explicit',
    }], 'consultation-3', { transcript: '医生：做个B超。' });

    expect(result[0]).toMatchObject({
      matchedItem: null,
      matchStatus: 'unmatched',
      selected: false,
    });
  });

  it('rejects a model catalog reference that is not in the current task candidates', async () => {
    vi.mocked(medicalDataService.fetchAvailableExamLabItems).mockResolvedValue([
      { id: 'exam-abdomen', code: 'E1', name: '肝胆胰脾肾彩超', category: '检查' },
    ]);
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify([{
      index: 0,
      catalogRef: 'OUTSIDE-LIVE-CATALOG',
      confidence: 'high',
      goal: '评估腹部情况',
      goalGroup: '腹部影像评估',
      goalGroupPurpose: '定位腹部病变线索',
      necessity: 'core',
      reason: '结合腹部症状补全',
    }]));

    const result = await resolveExplicitTreatmentCatalogHints([{
      type: 'examination',
      name: 'B超',
      sourceType: 'explicit',
    }], 'consultation-4', { historyOfPresentIllness: '上腹部不适' });

    expect(result[0].matchedItem).toBeNull();
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
