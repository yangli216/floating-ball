import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatFast } from '@/services/llm';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';
import { suggestChronicRefillMedicationAttributions } from './chronicRefillMedicationAttribution';

vi.mock('@/services/llm', () => ({
  chatFast: vi.fn(),
}));

function candidate(): ChronicRefillCandidate {
  return {
    diagnosis: '原发性高血压',
    diagnoses: ['原发性高血压', '骨质疏松'],
    diagnosisGroups: ['高血压', '骨质疏松'],
    medications: ['缬沙坦片', '碳酸钙片'],
    chronicVisitCount: 1,
    chronicVisits: [],
    diagnosisEvidenceText: '近期历史就诊记录有“原发性高血压、骨质疏松”诊断',
    medicationEvidenceText: '历史用药记录：缬沙坦片、碳酸钙片',
    evidenceText: '混合慢病历史处方',
    conditions: [
      {
        id: '高血压',
        diagnosis: '原发性高血压',
        diagnosisGroup: '高血压',
        hasMedicationEvidence: true,
        medicationEvidenceScope: 'shared',
      },
      {
        id: '骨质疏松',
        diagnosis: '骨质疏松',
        diagnosisGroup: '骨质疏松',
        hasMedicationEvidence: true,
        medicationEvidenceScope: 'shared',
      },
    ],
    medicationAttributionStatus: 'loading',
    medicationAttributions: [
      {
        id: 'visit-1::valsartan::0',
        visitTime: 1,
        medication: { name: '缬沙坦片', spec: '10mg*7片/盒' },
        source: 'structured',
        candidateConditionIds: ['高血压', '骨质疏松'],
      },
    ],
  };
}

describe('suggestChronicRefillMedicationAttributions', () => {
  beforeEach(() => {
    vi.mocked(chatFast).mockReset();
  });

  it('uses the fast signed chat path and normalizes the suggestion against candidate ids', async () => {
    vi.mocked(chatFast).mockResolvedValue(JSON.stringify({
      assignments: [{
        itemId: 'visit-1::valsartan::0',
        conditionId: '高血压',
        confidence: 'high',
        reason: '血管紧张素受体拮抗剂',
      }],
    }));

    const result = await suggestChronicRefillMedicationAttributions(candidate());

    expect(result[0]).toMatchObject({
      suggestedConditionId: '高血压',
      confidence: 'high',
      reason: '血管紧张素受体拮抗剂',
    });
    expect(chatFast).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('缬沙坦片'),
        }),
      ]),
      undefined,
      undefined,
      undefined,
      expect.objectContaining({
        configProfile: 'fast',
        traceContext: expect.objectContaining({
          scene: 'reception-chronic-refill-medication-attribution',
        }),
      }),
    );
  });
});
