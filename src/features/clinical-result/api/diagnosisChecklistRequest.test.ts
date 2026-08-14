import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ chatFast: vi.fn() }));

vi.mock('@/services/llm', () => ({ chatFast: mocks.chatFast }));
vi.mock('@/prompts', () => ({
  PROMPTS: {
    consultation: {
      diagnosisChecklist: {
        system: 'system-checklist',
        buildUserPrompt: (input: { diagnosisName: string }) => `diagnosis:${input.diagnosisName}`,
      },
    },
  },
}));

import { requestDiagnosisChecklist } from './diagnosisChecklistRequest';

describe('requestDiagnosisChecklist', () => {
  beforeEach(() => {
    mocks.chatFast.mockReset();
    mocks.chatFast.mockResolvedValue('{"isNeeded":false}');
  });

  it('uses the fast model gateway with the shared prompt and trace context', async () => {
    const traceContext = {
      scene: 'diagnosis-checklist',
      sourceModule: 'consultation-result',
      consultationId: 'visit-1',
    };

    await expect(requestDiagnosisChecklist({
      diagnosisName: '肺炎',
      chiefComplaint: '发热',
      historyOfPresentIllness: '咳嗽三天',
    }, traceContext)).resolves.toBe('{"isNeeded":false}');

    expect(mocks.chatFast).toHaveBeenCalledWith([
      { role: 'system', content: 'system-checklist' },
      { role: 'user', content: 'diagnosis:肺炎' },
    ], undefined, undefined, undefined, { traceContext });
  });
});
