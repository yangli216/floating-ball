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
    await buildReportInterpretationPayload({
      requestId: 'report-request-1',
      taskId: 'inspectReport',
      reportKindLabel: '检验报告',
      query: '白细胞 12.0×10^9/L ↑',
      patient: { patientId: 'patient-1', visitId: 'visit-1', patientName: '测试患者' },
    });

    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      consultationId: 'visit-1',
      consultationType: 'report_interpretation',
      firstSnapshot: expect.any(Object),
      finalSnapshot: expect.any(Object),
      changeSummary: expect.objectContaining({ totalChanges: 0 }),
    }));
  });
});
