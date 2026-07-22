import { describe, expect, it, vi } from 'vitest';
import type {
  ReportInterpretationResolvedRequest,
  ReportInterpretationWindowPayload,
} from '@/types/reportInterpretation';

describe('consultationUserLog', () => {
  it('builds a report interpretation snapshot with source evidence and generated conclusions', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    const { buildReportInterpretationUserLogSnapshot } = await import('./consultationUserLog');
    const request: ReportInterpretationResolvedRequest = {
      requestId: 'report-1',
      taskId: 'inspectReport',
      reportKindLabel: '检验报告',
      query: '白细胞 12.0×10^9/L ↑',
      patient: {
        patientId: 'patient-1',
        patientName: '测试患者',
        diagnosis: '急性上呼吸道感染',
      },
    };
    const result: ReportInterpretationWindowPayload = {
      requestId: 'report-1',
      taskId: 'inspectReport',
      reportKindLabel: '检验报告',
      patientSummary: '测试患者',
      patient: request.patient,
      reportMeta: { reportTitle: '血常规', reportDate: '2026-07-06' },
      abnormalItems: [{ name: '白细胞', result: '12.0×10^9/L', direction: 'up' }],
      sourceQuery: request.query,
      summary: '白细胞升高。',
      conclusion: '考虑感染相关改变。',
      keyPoints: [{ title: '感染指标', detail: '白细胞升高。', urgency: 'medium' }],
      sections: [],
      recommendations: ['结合症状复诊'],
      cautions: ['高热时及时就医'],
      followUpAssessment: {
        actionability: 'needs_follow_up',
        summary: '建议结合症状复诊。',
        problems: [{ title: '白细胞升高', evidence: '12.0×10^9/L', urgency: 'medium' }],
        medicationIntents: [],
      },
      generatedAt: '2026-07-06T10:00:00+08:00',
    };

    const snapshot = buildReportInterpretationUserLogSnapshot(request, result);

    expect(snapshot.diagnoses[0]).toMatchObject({ name: '急性上呼吸道感染', selected: true });
    expect(snapshot.scenario).toMatchObject({
      scene: 'report_interpretation',
      reportTitle: '血常规',
      sourceText: '白细胞 12.0×10^9/L ↑',
      conclusion: '考虑感染相关改变。',
    });
    expect(snapshot.scenario?.abnormalItems).toHaveLength(1);
  });

  it('records an explicit medicine rejection as a treatment change', async () => {
    const {
      buildConsultationUserLogSnapshot,
      computeChangeSummary,
    } = await import('./consultationUserLog');
    const first = buildConsultationUserLogSnapshot({
      chiefComplaint: '',
      historyOfPresentIllness: '',
      treatments: [{ type: 'medicine', name: '对乙酰氨基酚片', reason: '', selected: false }],
    });
    const final = buildConsultationUserLogSnapshot({
      chiefComplaint: '',
      historyOfPresentIllness: '',
      treatments: [{ type: 'medicine', name: '对乙酰氨基酚片', reason: '', selected: false, rejected: true }],
    });

    expect(final.medicines[0].rejected).toBe(true);
    expect(computeChangeSummary(first, final).treatmentChanges).toBe(1);
  });

  it('keeps the complete generated record and counts each edited record field once', async () => {
    const {
      buildConsultationUserLogSnapshot,
      computeChangeSummary,
    } = await import('./consultationUserLog');
    const first = buildConsultationUserLogSnapshot({
      chiefComplaint: '咽痛、鼻塞1天',
      historyOfPresentIllness: '昨日午后起病。',
      pastMedicalHistory: '2型糖尿病',
      personalHistory: '否认吸烟、饮酒史。',
      familyHistory: '否认家族重大遗传病史。',
      physicalExam: '双肺呼吸音清。',
      precautions: '监测体温和血糖。',
    });
    const final = buildConsultationUserLogSnapshot({
      chiefComplaint: '咽痛、鼻塞1天',
      historyOfPresentIllness: '昨日午后起病。',
      pastMedicalHistory: '2型糖尿病10年',
      personalHistory: '否认吸烟史，偶尔饮酒。',
      familyHistory: '父亲有高血压病史。',
      physicalExam: '双肺呼吸音粗。',
      precautions: '监测体温和血糖，症状加重及时复诊。',
    });

    expect(first).toMatchObject({
      pastMedicalHistory: '2型糖尿病',
      personalHistory: '否认吸烟、饮酒史。',
      familyHistory: '否认家族重大遗传病史。',
      physicalExam: '双肺呼吸音清。',
      precautions: '监测体温和血糖。',
    });
    expect(computeChangeSummary(first, final, {
      pastMedicalHistoryChanged: true,
      personalHistoryChanged: true,
      familyHistoryChanged: true,
      physicalExamChanged: true,
      precautionsChanged: true,
    })).toMatchObject({
      totalChanges: 5,
      recordFieldChanges: 5,
    });
  });
});
