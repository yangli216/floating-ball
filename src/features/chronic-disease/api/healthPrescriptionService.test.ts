import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chat } from '@/services/llm';
import type { ChronicDiseasePatientSummary } from '../types';
import { generateHealthPrescriptionDraft } from './healthPrescriptionService';

vi.mock('@/services/llm', () => ({
  chat: vi.fn(),
}));

const mockedChat = vi.mocked(chat);

function summary(): ChronicDiseasePatientSummary {
  return {
    patientId: 'P001',
    visitId: 'V001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    organizationId: 'HIS001',
    organizationName: '某某社区卫生服务中心',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: [
      {
        diseaseType: 'hypertension',
        label: '高血压管理',
        source: 'public-health',
        sourceLabel: '公卫管理',
        evidenceText: '高血压规范管理',
      },
    ],
    managedDiseaseTypes: ['hypertension'],
    hasSupportedDisease: true,
    isChronicManaged: true,
    diagnosisText: '原发性高血压',
    lastVisitLabel: '2026-07-23',
    latestDataAt: '2026-07-23T08:55:00+08:00',
    bloodPressurePoints: [
      {
        measuredAt: '2026-07-23T08:55:00+08:00',
        systolic: 146,
        diastolic: 90,
        sourceLabel: '门诊测量',
      },
    ],
    bloodGlucosePoints: [],
    recentMedicationFacts: [
      {
        name: '氨氯地平片',
        observedAt: '2026-07-23T08:55:00+08:00',
        sourceLabel: '患者记忆',
      },
    ],
    recentMedicationNames: ['氨氯地平片'],
    sourceQuality: 'ready',
  };
}

describe('generateHealthPrescriptionDraft', () => {
  beforeEach(() => {
    mockedChat.mockReset();
  });

  it('keeps every AI suggestion unaccepted until the doctor confirms it', async () => {
    mockedChat.mockResolvedValue(JSON.stringify({
      summary: '基于当前可追溯证据形成复核草稿。',
      suggestions: [
        {
          category: 'medicine-review',
          title: '核对当前用药',
          detail: '核对氨氯地平实际用法、不良反应和依从性。',
          reason: '患者记忆中存在该用药事实。',
        },
      ],
      safetyNote: '不得自动调药。',
    }));

    const draft = await generateHealthPrescriptionDraft(summary());

    expect(draft.source).toBe('ai');
    expect(draft.suggestions).toEqual([
      expect.objectContaining({
        category: 'medicine-review',
        accepted: false,
      }),
    ]);
  });

  it('falls back to controlled review items when the AI request fails', async () => {
    mockedChat.mockRejectedValue(new Error('upstream unavailable'));

    const draft = await generateHealthPrescriptionDraft(summary());

    expect(draft.source).toBe('controlled-fallback');
    expect(draft.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'medicine-review',
        accepted: false,
        detail: expect.stringContaining('氨氯地平片'),
      }),
    ]));
    expect(draft.safetyNote).toContain('不能替代正式药品处方');
  });
});
