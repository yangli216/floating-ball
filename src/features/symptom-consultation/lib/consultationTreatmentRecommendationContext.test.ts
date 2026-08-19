import { describe, expect, it } from 'vitest';
import { buildConsultationTreatmentRecommendationContext } from './consultationTreatmentRecommendationContext';

describe('buildConsultationTreatmentRecommendationContext', () => {
  it('includes the editable record instead of relying on the chief complaint alone', () => {
    const context = buildConsultationTreatmentRecommendationContext({
      patient: { patientName: '测试患者', gender: '女', age: '37岁' },
      diagnosis: { name: '急性上呼吸道感染', code: 'J06.900' },
      record: {
        chiefComplaint: '发热、咽痛1天',
        historyOfPresentIllness: '体温38.2℃，伴咳嗽，无呼吸困难。',
        familyHistory: '否认家族遗传病史。',
      },
    });

    expect(context).toMatchObject({
      diagnosisName: '急性上呼吸道感染',
      diagnosisCode: 'J06.900',
      chiefComplaint: '发热、咽痛1天',
    });
    expect(context.clinicalContext).toContain('现病史：体温38.2℃，伴咳嗽，无呼吸困难。');
    expect(context.clinicalContext).toContain('家族史：否认家族遗传病史。');
  });
});
