import { describe, expect, it } from 'vitest';
import { PatientRiskAnalysisPrompt } from '@/prompts/prompts';
import { normalizeRiskAnalysisPatientContext } from './patientProfile';

describe('normalizeRiskAnalysisPatientContext', () => {
  it('passes deduplicated visit diagnoses to the risk prompt without treating visit history as past history', () => {
    const context = normalizeRiskAnalysisPatientContext({
      patientId: 'patient-1',
      patientName: '张海洋',
      gender: 'M',
      ageText: '40岁',
      pastMedicalHistory: '既往门诊记录：2026-05-20 冠心病',
      hisHistory: {
        patientId: 'patient-1',
        visits: [
          {
            visitTime: new Date(2026, 5, 27).getTime(),
            diagnoses: ['发热'],
          },
          {
            visitTime: new Date(2026, 5, 15).getTime(),
            diagnoses: ['恶性肿瘤'],
          },
          {
            visitTime: new Date(2026, 4, 20).getTime(),
            diagnoses: ['冠状动脉粥样硬化性心脏病'],
          },
          {
            visitTime: new Date(2026, 4, 6).getTime(),
            diagnoses: ['冠状动脉粥样硬化性心脏病', '高脂血症'],
          },
        ],
      },
    } as any);

    expect(context.pastMedicalHistory).toBeUndefined();
    expect(context.historicalDiagnoses).toEqual([
      { name: '发热', visitCount: 1, latestVisitDate: '2026-06-27' },
      { name: '恶性肿瘤', visitCount: 1, latestVisitDate: '2026-06-15' },
      { name: '冠状动脉粥样硬化性心脏病', visitCount: 2, latestVisitDate: '2026-05-20' },
      { name: '高脂血症', visitCount: 1, latestVisitDate: '2026-05-06' },
    ]);

    const prompt = PatientRiskAnalysisPrompt.buildUserPrompt(context);
    expect(prompt).toContain('既往史: 无');
    expect(prompt).toContain('冠状动脉粥样硬化性心脏病，共2次记录，最近记录于2026-05-20');
    expect(prompt).toContain('恶性肿瘤，最近记录于2026-06-15');
    expect(prompt).toContain('发热，最近记录于2026-06-27');
  });
});
