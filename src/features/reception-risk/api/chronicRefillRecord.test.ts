import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatientContext } from '@/utils/patientContext';
import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import { loadAvailableMedicineInventoryContext, parseLLMJson } from '@features/clinical-result';
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
    vi.mocked(medicalDataService.matchDiagnosis).mockReturnValue(null);
    vi.mocked(medicalDataService.matchMedicine).mockReturnValue(null);
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
      diagnosisGroups: ['高血压'],
      medications: ['苯磺酸氨氯地平片（5mg*28片）', '厄贝沙坦片 150mg'],
      chronicVisitCount: 1,
      chronicVisits: [{
        visitTime: Date.parse('2026-06-01T08:00:00+08:00'),
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片（5mg*28片）'],
      }],
      diagnosisEvidenceText: '近期历史就诊记录有“高血压”诊断',
      medicationEvidenceText: '历史用药记录：苯磺酸氨氯地平片、厄贝沙坦片',
      evidenceText: '高血压历史处方',
    });

    expect(result.chiefComplaint).toBe('高血压复诊配药');
    expect(result.historyOfPresentIllness).not.toContain('未提供新发不适信息');
    expect(result.historyOfPresentIllness).toContain('近期门诊曾开具苯磺酸氨氯地平片');
    expect(result.historyOfPresentIllness).toContain('今复诊配药');
    expect(result.historyOfPresentIllness).not.toMatch(/库存|可续方药品|可参考药品|推荐药品/u);
    expect(result.treatments).toHaveLength(2);
    expect(result.treatments[0].name).toBe('苯磺酸氨氯地平片');
    expect(result.treatments[0]).toMatchObject({
      selected: false,
      dosage: '',
      days: '',
    });
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

  it('uses only doctor-confirmed facts in the final chief complaint and HPI', async () => {
    vi.mocked(chat).mockResolvedValue('{}');
    vi.mocked(parseLLMJson).mockReturnValue({
      chiefComplaint: '糖尿病定期复诊续方',
      historyOfPresentIllness: '患者女性，36岁，病情控制情况、服药依从性及血糖结果待医生核实。',
      supplementRecordText: '近期无低血糖不适',
      healthEducation: '注意休息，1周内复诊，必要时上级医院进一步治疗。',
      recommendedMedicines: ['盐酸二甲双胍片'],
    });
    const patient = buildPatientContext({
      payload: { patientId: 'patient-1', visitId: 'visit-current', name: '测试患者' },
    })!;
    const candidate = {
      diagnosis: '2型糖尿病',
      diagnoses: ['2型糖尿病'],
      diagnosisGroups: ['糖尿病'],
      medications: ['盐酸二甲双胍片'],
      chronicVisitCount: 1,
      chronicVisits: [],
      diagnosisEvidenceText: '历史诊断为2型糖尿病',
      medicationEvidenceText: '历史用药为盐酸二甲双胍片',
      evidenceText: '近期慢病复诊记录',
    };

    const result = await generateChronicRefillRecord(patient, candidate, {
      supplementText: '规律服药，血糖平稳，无低血糖不适',
      answers: [
        {
          itemId: 'medication',
          question: '目前用药情况？',
          value: 'regular',
          label: '规律服用原方案',
          recordText: '规律服用盐酸二甲双胍片',
          confidence: 'high',
          evidence: 'current-explicit',
          basis: '医生本次补充',
        },
        {
          itemId: 'control',
          question: '近期血糖情况？',
          value: 'stable',
          label: '血糖平稳',
          recordText: '近期血糖监测平稳',
          confidence: 'high',
          evidence: 'current-explicit',
          basis: '医生本次补充',
        },
      ],
    });

    expect(result.chiefComplaint).toBe('2型糖尿病复诊配药');
    expect(result.historyOfPresentIllness).toBe(
      '患者既往确诊2型糖尿病，规律服用盐酸二甲双胍片，近期血糖监测平稳，近期无低血糖不适，今复诊配药。',
    );
    expect(result.historyOfPresentIllness).not.toMatch(/女性|36岁|待医生核实/u);
    expect(result.healthEducation).toBe(
      '按医嘱规律服药并记录家庭监测结果；出现症状变化或指标异常时及时复诊。',
    );
  });

  it('uses structured AI dosage, frequency and route for an inventory-matched refill medicine', async () => {
    vi.mocked(loadAvailableMedicineInventoryContext).mockResolvedValue({
      items: [{
        productId: 'med-metformin',
        productName: '盐酸二甲双胍片',
        spec: '0.25g*60片/瓶',
        unit: '瓶',
        availableQuantity: 20,
        storeIds: ['1760'],
        storeNames: ['西药房'],
      }],
      promptContext: '- 盐酸二甲双胍片｜0.25g*60片/瓶',
      pharmacyCount: 1,
      staleStoreCount: 0,
    });
    vi.mocked(chat).mockResolvedValue('{}');
    vi.mocked(parseLLMJson).mockReturnValue({
      chiefComplaint: '糖尿病定期复诊续方',
      historyOfPresentIllness: '患者既往诊断糖尿病，长期口服盐酸二甲双胍片，本次复诊续方，病情控制及依从性待医生核实。',
      recommendedMedicines: [{
        name: '盐酸二甲双胍片',
        spec: '0.25g*60片/瓶',
        dosage: 0.5,
        dosageUnit: 'g',
        frequency: '每日3次',
        frequencyKey: 'TID',
        route: '口服',
        routeKey: 'PO',
        days: 14,
        totalQty: 2,
        totalUnit: '瓶',
        reason: '结合慢病诊断和当前库存规格续方',
      }],
    });
    const patient = buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-current',
        name: '张建国',
        ageText: '60岁',
      },
    });

    const result = await generateChronicRefillRecord(patient!, {
      diagnosis: '糖尿病',
      diagnoses: ['糖尿病'],
      diagnosisGroups: ['糖尿病'],
      medications: ['盐酸二甲双胍片（0.25g*60片/瓶）'],
      medicationOrders: [{
        orderId: 'history-order-metformin',
        productId: 'med-metformin',
        name: '盐酸二甲双胍片',
        days: '30',
        totalQty: '2',
        totalUnit: '瓶',
      }],
      chronicVisitCount: 1,
      chronicVisits: [{
        visitTime: Date.parse('2026-06-01T08:00:00+08:00'),
        diagnoses: ['糖尿病'],
        medications: ['盐酸二甲双胍片（0.25g*60片/瓶）'],
      }],
      diagnosisEvidenceText: '近期历史就诊记录有“糖尿病”诊断',
      medicationEvidenceText: '历史用药记录：盐酸二甲双胍片',
      evidenceText: '糖尿病历史处方',
    });

    expect(result.treatments[0]).toMatchObject({
      name: '盐酸二甲双胍片',
      selected: false,
      targetDose: '0.5',
      targetDoseUnit: 'g',
      dosage: '',
      dosageUnit: '',
      frequency: '每日3次',
      frequencyKey: 'TID',
      route: '口服',
      routeKey: 'PO',
      days: '30',
      totalQty: '2',
      totalUnit: '瓶',
    });

    const messages = vi.mocked(chat).mock.calls[0][0];
    const prompt = messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('盐酸二甲双胍片｜0.25g*60片/瓶');
    expect(prompt).not.toContain('可用库存');
    expect(prompt).toContain('recommendedMedicines 必须返回结构化药品对象');
    expect(prompt).toContain('"targetDose":"目标临床一次剂量数值"');
    expect(prompt).toContain('days、totalQty、totalUnit必须留空');
    expect(prompt).toContain('reason只说明诊断、历史用药和适应证等临床推荐依据');
  });

  it('uses the preserved specific historical diagnosis for the initial catalog match', async () => {
    vi.mocked(medicalDataService.matchDiagnosis).mockImplementation((query) => (
      query === '2型糖尿病'
        ? {
          id: 'diag-e11',
          code: 'E11.900',
          name: '2型糖尿病',
        }
        : null
    ));
    const patient = buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-current',
        name: '测试患者',
      },
    });

    const result = await generateChronicRefillRecord(patient!, {
      diagnosis: '2型糖尿病',
      diagnoses: ['2型糖尿病'],
      diagnosisGroups: ['糖尿病'],
      medications: ['盐酸二甲双胍片 0.5g'],
      chronicVisitCount: 1,
      chronicVisits: [{
        visitTime: Date.parse('2026-06-01T08:00:00+08:00'),
        diagnoses: ['2型糖尿病'],
        medications: ['盐酸二甲双胍片 0.5g'],
      }],
      diagnosisEvidenceText: '近期历史就诊记录有“2型糖尿病”诊断',
      medicationEvidenceText: '历史用药记录：盐酸二甲双胍片',
      evidenceText: '历史诊断：2型糖尿病',
    });

    expect(result.chiefComplaint).toContain('2型糖尿病');
    expect(result.diagnoses).toEqual([expect.objectContaining({
      name: '2型糖尿病',
      code: 'E11.900',
      matchedItem: {
        id: 'diag-e11',
        code: 'E11.900',
        name: '2型糖尿病',
      },
    })]);
    expect(medicalDataService.matchDiagnosis).toHaveBeenCalledWith('2型糖尿病');
    expect(medicalDataService.matchDiagnosis).not.toHaveBeenCalledWith('糖尿病');
  });

  it('recommends an inventory medicine through AI when no historical medication is available', async () => {
    vi.mocked(loadAvailableMedicineInventoryContext).mockResolvedValue({
      items: [{
        productId: 'med-metformin',
        productName: '盐酸二甲双胍片',
        spec: '0.25g*60片/瓶',
        unit: '瓶',
        availableQuantity: 20,
        storeIds: ['1760'],
        storeNames: ['西药房'],
      }],
      promptContext: '- 盐酸二甲双胍片｜0.25g*60片/瓶',
      pharmacyCount: 1,
      staleStoreCount: 0,
    });
    vi.mocked(chat).mockResolvedValue('{}');
    vi.mocked(parseLLMJson).mockReturnValue({
      chiefComplaint: '2型糖尿病定期复诊续方',
      historyOfPresentIllness: '患者既往诊断2型糖尿病，本次复诊评估并续方。当前库存内可参考药品为盐酸二甲双胍片，建议使用该药继续治疗。',
      recommendedMedicines: [{
        name: '盐酸二甲双胍片',
        dosage: 0.5,
        dosageUnit: 'g',
        frequency: '每日3次',
        frequencyKey: 'TID',
        route: '口服',
        routeKey: 'PO',
        days: 30,
        totalQty: 3,
        totalUnit: '瓶',
        reason: '适用于2型糖尿病血糖管理，需结合肾功能和血糖情况确认',
      }],
    });
    const patient = buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-current',
        name: '测试患者',
      },
    });

    const result = await generateChronicRefillRecord(patient!, {
      diagnosis: '2型糖尿病',
      diagnoses: ['2型糖尿病'],
      diagnosisGroups: ['糖尿病'],
      medications: [],
      chronicVisitCount: 1,
      chronicVisits: [{
        visitTime: Date.parse('2026-06-01T08:00:00+08:00'),
        diagnoses: ['2型糖尿病'],
      }],
      diagnosisEvidenceText: '近期历史就诊记录有“2型糖尿病”诊断',
      medicationEvidenceText: '未获取到可确认的历史用药记录',
      evidenceText: '近期历史就诊记录有“2型糖尿病”诊断；未获取到可确认的历史用药记录',
    });

    expect(result.currentMedicationHistory).toBe('历史用药方案待医生核实');
    expect(result.historyOfPresentIllness).toBe('患者既往确诊2型糖尿病。今复诊配药。');
    expect(result.historyOfPresentIllness).not.toMatch(/库存|可参考药品|建议使用/u);
    expect(result.treatments[0]).toMatchObject({
      name: '盐酸二甲双胍片',
      sourceType: 'inferred',
      selected: false,
      targetDose: '0.5',
      targetDoseUnit: 'g',
      dosage: '',
      totalQty: '',
      totalUnit: '',
    });
    expect(result.diagnoses[0]).toMatchObject({
      sourceType: 'explicit',
      confidence: 'high',
      evidenceText: '近期历史就诊记录有“2型糖尿病”诊断',
      rationale: '',
    });
    const prompt = vi.mocked(chat).mock.calls[0][0].map((message) => message.content).join('\n');
    expect(prompt).toContain('历史慢病配药：未获取到可确认的历史用药记录');
    expect(prompt).toContain('现病史只能使用其中带有病历事实的确认项');
  });
});
