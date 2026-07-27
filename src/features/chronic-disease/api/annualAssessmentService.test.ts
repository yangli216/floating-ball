import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chat } from '@/services/llm';
import { buildAnnualChronicAssessment } from '../lib/annualAssessment';
import type { ChronicDiseasePatientSummary } from '../types';
import { generateAnnualAssessmentDraft } from './annualAssessmentService';

vi.mock('@/services/llm', () => ({
  chat: vi.fn(),
}));

const mockedChat = vi.mocked(chat);

function summary(): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR-SENSITIVE-001',
    idRecord: 'RECORD-SENSITIVE-001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [
      {
        diseaseType: 'hypertension',
        label: '高血压管理',
        source: 'public-health',
        sourceLabel: '公卫管理',
      },
      {
        diseaseType: 'type2_diabetes',
        label: '2 型糖尿病管理',
        source: 'public-health',
        sourceLabel: '公卫管理',
      },
    ],
    managedDiseaseTypes: ['hypertension', 'type2_diabetes'],
    hasSupportedDisease: true,
    isChronicManaged: true,
    diagnosisText: '原发性高血压、2 型糖尿病',
    lastVisitAt: '2026-06-10T09:00:00+08:00',
    lastVisitLabel: '2026-06-10',
    latestDataAt: '2026-06-10T09:00:00+08:00',
    latestHeightCm: 160,
    latestWeightKg: 65,
    latestWaistCm: 88,
    latestHeartRate: 76,
    bloodPressurePoints: [
      {
        measuredAt: '2026-06-10T09:00:00+08:00',
        systolic: 142,
        diastolic: 88,
        sourceLabel: '慢病系统',
      },
    ],
    bloodGlucosePoints: [
      {
        measuredAt: '2026-06-10T09:00:00+08:00',
        value: 7.2,
        measurementType: 'fasting',
        sourceLabel: '慢病系统',
      },
    ],
    recentMedicationFacts: [
      {
        name: '二甲双胍',
        regimenText: '0.5g · 每日两次',
        observedAt: '2026-06-10T09:00:00+08:00',
        sourceLabel: '慢病随访',
      },
    ],
    recentMedicationNames: ['二甲双胍'],
    sourceQuality: 'ready',
  };
}

describe('generateAnnualAssessmentDraft', () => {
  beforeEach(() => {
    mockedChat.mockReset();
  });

  it('uses the signed LLM service and fills missing AI sections with controlled content', async () => {
    mockedChat.mockResolvedValue(JSON.stringify({
      overallSummary: '本年度有部分血压和血糖记录，仍需补齐并发症筛查资料。',
      sections: [
        {
          key: 'control-trend',
          summary: '记录数量有限，需结合个体目标。',
          findings: [
            {
              content: '最近一次血压为 142/88 mmHg。',
              evidenceRefs: ['blood-pressure-1'],
              evidenceState: 'supported',
              priority: 'attention',
            },
          ],
        },
      ],
      missingData: ['糖化血红蛋白'],
      doctorReviewPoints: ['核对个体控制目标'],
      safetyNote: '仅供医生复核。',
    }));

    const draft = await generateAnnualAssessmentDraft(
      summary(),
      buildAnnualChronicAssessment(summary(), 2026),
    );

    expect(draft.source).toBe('ai');
    expect(draft.sections).toHaveLength(6);
    expect(draft.sections[0].findings[0]).toEqual(expect.objectContaining({
      evidenceState: 'supported',
      priority: 'attention',
    }));
    expect(draft.sections.find((item) => item.key === 'complication-screening')?.findings[0].evidenceState)
      .toBe('insufficient');

    const messages = mockedChat.mock.calls[0][0];
    expect(messages[1].content).not.toContain('林女士');
    expect(messages[1].content).not.toContain('PHR-SENSITIVE-001');
    expect(messages[1].content).not.toContain('RECORD-SENSITIVE-001');
    expect(messages[1].content).toContain('"assessmentYear":2026');
  });

  it('returns a complete controlled fallback when the LLM request fails', async () => {
    mockedChat.mockRejectedValue(new Error('upstream unavailable'));

    const draft = await generateAnnualAssessmentDraft(
      summary(),
      buildAnnualChronicAssessment(summary(), 2026),
    );

    expect(draft.source).toBe('controlled-fallback');
    expect(draft.sections.map((item) => item.key)).toEqual([
      'control-trend',
      'cardiovascular-risk',
      'complication-screening',
      'medication-safety',
      'lifestyle-management',
      'follow-up-plan',
    ]);
    expect(draft.missingData).toEqual(expect.arrayContaining([
      expect.stringContaining('糖化血红蛋白'),
      expect.stringContaining('眼底'),
      expect.stringContaining('依从性'),
    ]));
    expect(draft.safetyNote).toContain('不替代诊断');
  });

  it('rejects an AI response that has no supported assessment section keys', async () => {
    mockedChat.mockResolvedValue(JSON.stringify({
      overallSummary: '模型自由发挥。',
      sections: [{
        key: 'automatic-prescription',
        summary: '直接调整用药。',
        findings: [{
          content: '停用当前药物。',
          evidenceRefs: ['unknown-evidence'],
          evidenceState: 'supported',
          priority: 'attention',
        }],
      }],
    }));

    const draft = await generateAnnualAssessmentDraft(
      summary(),
      buildAnnualChronicAssessment(summary(), 2026),
    );

    expect(draft.source).toBe('controlled-fallback');
    expect(JSON.stringify(draft)).not.toContain('停用当前药物');
  });
});
