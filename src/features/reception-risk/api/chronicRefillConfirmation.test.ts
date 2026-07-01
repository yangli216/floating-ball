import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatFast } from '@/services/llm';
import { buildPatientContext } from '@/utils/patientContext';
import { parseLLMJson } from '@features/clinical-result';
import { generateChronicRefillConfirmationPlan } from './chronicRefillConfirmation';

vi.mock('@/services/llm', () => ({
  chatFast: vi.fn(),
}));

vi.mock('@features/clinical-result', () => ({
  parseLLMJson: vi.fn(),
}));

describe('generateChronicRefillConfirmationPlan', () => {
  beforeEach(() => {
    vi.mocked(chatFast).mockResolvedValue('{}');
    vi.mocked(parseLLMJson).mockReturnValue({
      summary: '确认必要信息',
      items: [
        {
          id: 'medication',
          question: '目前是否仍按近期方案服药？',
          options: [
            { value: 'yes', label: '是', recordText: '仍按近期方案服药' },
            { value: 'unknown', label: '暂未确认', recordText: '' },
          ],
          recommendedValue: 'unknown',
        },
        {
          id: 'control',
          question: '近期控制情况如何？',
          options: [
            { value: 'stable', label: '平稳', recordText: '近期控制平稳' },
            { value: 'unknown', label: '暂未评估', recordText: '' },
          ],
          recommendedValue: 'unknown',
        },
      ],
    });
  });

  it('uses the fast model and does not include doctor supplement input', async () => {
    const patient = buildPatientContext({
      payload: { patientId: 'patient-1', visitId: 'visit-1', name: '测试患者' },
    })!;

    const plan = await generateChronicRefillConfirmationPlan(patient, {
      diagnosis: '糖尿病',
      diagnoses: ['糖尿病'],
      diagnosisGroups: ['糖尿病'],
      medications: ['☆阿卡波糖片(卡博平)/50mg*30片/盒'],
      chronicVisitCount: 1,
      chronicVisits: [],
      diagnosisEvidenceText: '',
      medicationEvidenceText: '',
      evidenceText: '',
    });

    expect(plan.items).toHaveLength(2);
    expect(chatFast).toHaveBeenCalledOnce();
    const messages = vi.mocked(chatFast).mock.calls[0][0];
    const prompt = messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('历史用药：阿卡波糖片');
    expect(prompt).not.toContain('本次医生补充');
  });
});
