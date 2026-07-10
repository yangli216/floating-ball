import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultationUserLogSnapshot } from './consultationUserLog';

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  buildSnapshot: vi.fn(),
  buildSelection: vi.fn(),
  submit: vi.fn(async () => undefined),
}));

vi.mock('./llm', () => ({ chat: mocks.chat }));
vi.mock('./consultationUserLog', () => ({
  buildReportInterpretationUserLogSnapshot: mocks.buildSnapshot,
  buildConsultationSelectionSnapshot: mocks.buildSelection,
  submitConsultationUserLog: mocks.submit,
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: class {} }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe('report interpretation user log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    mocks.chat.mockResolvedValue(JSON.stringify({
      summary: '白细胞升高。',
      conclusion: '考虑感染相关改变。',
      keyPoints: [],
      sections: [],
      recommendations: ['结合症状复诊'],
      cautions: [],
      followUpAssessment: {
        actionability: 'needs_treatment',
        summary: '考虑感染相关改变，需要抗感染治疗。',
        problems: [{ title: '白细胞升高', evidence: '12.0×10^9/L', urgency: 'medium' }],
        medicationIntents: [{ indication: '感染治疗', preferredGenericNames: ['阿莫西林'], aliases: ['阿莫西林片'], route: '口服' }],
      },
    }));
    const snapshot: ConsultationUserLogSnapshot = {
      chiefComplaint: '',
      historyOfPresentIllness: '',
      diagnoses: [],
      medicines: [],
      examinations: [],
      labTests: [],
      procedures: [],
    };
    mocks.buildSnapshot.mockReturnValue(snapshot);
    mocks.buildSelection.mockReturnValue({});
  });

  it('submits a completed report interpretation log after payload generation', async () => {
    const { buildReportInterpretationPayload } = await import('./reportInterpretation');
    const payload = await buildReportInterpretationPayload({
      requestId: 'report-request-1',
      taskId: 'inspectReport',
      reportKindLabel: '检验报告',
      query: '白细胞 12.0×10^9/L ↑',
      patient: { patientId: 'patient-1', visitId: 'visit-1', patientName: '测试患者' },
    });

    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(payload.followUpAssessment).toMatchObject({
      actionability: 'needs_treatment',
      medicationIntents: [{ preferredGenericNames: ['阿莫西林'] }],
    });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      consultationId: 'visit-1',
      consultationType: 'report_interpretation',
      firstSnapshot: expect.any(Object),
      finalSnapshot: expect.any(Object),
      changeSummary: expect.objectContaining({ totalChanges: 0 }),
    }));
  });

  it('does not promote negated normal imaging findings into abnormal items', async () => {
    mocks.chat.mockRejectedValueOnce(new Error('offline'));
    const { buildReportInterpretationPayload } = await import('./reportInterpretation');

    const payload = await buildReportInterpretationPayload({
      requestId: 'report-request-normal-xray',
      taskId: 'checkReport',
      reportKindLabel: '检查报告',
      query: [
        '检查项目：胸椎侧位X线平片',
        '检查所见：胸椎生理曲度存在，序列线连续；各椎体骨质结构完整，未见明显骨折及骨质破坏，周围软组织未见异常。',
        '检查结论：胸椎侧位X线检查未发现结构性异常。可排除急性骨折、骨质破坏及退行性椎间隙改变。',
      ].join('\n'),
      patient: { patientId: 'patient-1', visitId: 'visit-1', patientName: '测试患者' },
    });

    expect(payload.abnormalItems).toEqual([]);
    expect(payload.keyPoints.some((item) => item.urgency === 'high')).toBe(false);
    expect(payload.recommendations.join('；')).not.toContain('转急诊');
  });
});
