import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ReportInterpretationWindowPayload } from '@/types/reportInterpretation';
import type { ReportHistoryEntry } from '../types';
import { useReportInterpretationWorkspace } from './useReportInterpretationWorkspace';

const report: ReportHistoryEntry = {
  id: 'report-1',
  visitId: 'visit-1',
  visitTime: Date.parse('2026-07-02 09:43:33'),
  diagnosisNames: [],
  taskId: 'inspectReport',
  title: '尿常规',
  reportTime: '2026-07-02 09:43:33',
  sourceQuery: '尿糖：阳性（参考范围：阴性）',
  available: true,
  isFollowUpSource: false,
};

const payload: ReportInterpretationWindowPayload = {
  requestId: 'report-1',
  taskId: 'inspectReport',
  reportKindLabel: '检验报告',
  patientSummary: '测试患者',
  reportMeta: { reportTitle: '尿常规' },
  abnormalItems: [],
  sourceQuery: report.sourceQuery,
  summary: '存在阳性结果。',
  conclusion: '请结合临床判断。',
  keyPoints: [],
  sections: [],
  recommendations: [],
  cautions: [],
  followUpAssessment: {
    actionability: 'observe',
    summary: '建议结合临床观察随访。',
    problems: [],
    medicationIntents: [],
  },
  generatedAt: '2026-07-02 10:00:00',
};

describe('useReportInterpretationWorkspace', () => {
  it('selects the latest report without automatically starting AI interpretation', async () => {
    const buildInterpretation = vi.fn(async () => payload);
    const controller = useReportInterpretationWorkspace({
      patient: ref(null),
      visits: ref([]),
      followUpContext: ref(null),
      loadHistory: vi.fn(async () => [report]),
      buildInterpretation,
    });

    controller.reports.value = [report];
    controller.selectReport(report);

    expect(controller.selectedId.value).toBe(report.id);
    expect(controller.activeView.value).toBe('source');
    expect(controller.interpreting.value).toBe(false);
    expect(buildInterpretation).not.toHaveBeenCalled();
  });

  it('runs AI only after an explicit action and then allows returning to source', async () => {
    const buildInterpretation = vi.fn(async () => payload);
    const controller = useReportInterpretationWorkspace({
      patient: ref(null),
      visits: ref([]),
      followUpContext: ref(null),
      loadHistory: vi.fn(async () => [report]),
      buildInterpretation,
    });

    controller.reports.value = [report];
    controller.selectReport(report);
    await controller.runInterpretation();

    expect(buildInterpretation).toHaveBeenCalledOnce();
    expect(controller.interpretation.value).toEqual(payload);
    expect(controller.activeView.value).toBe('interpretation');

    controller.showSource();
    expect(controller.activeView.value).toBe('source');
    controller.showInterpretation();
    expect(controller.activeView.value).toBe('interpretation');
  });
});
