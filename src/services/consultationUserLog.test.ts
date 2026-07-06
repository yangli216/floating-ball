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
});
