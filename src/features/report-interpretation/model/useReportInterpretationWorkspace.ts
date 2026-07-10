import { computed, ref, type Ref } from 'vue';
import type { HisOutpatientFollowUpContext, HisVisitRecord } from '@/services/his/types';
import type { AppPatient } from '@/types/appState';
import type { ReportInterpretationWindowPayload } from '@/types/reportInterpretation';
import type { ReportHistoryEntry, ReportHistoryFilter } from '../types';

type ReportWorkspaceView = 'source' | 'interpretation';

interface ReportInterpretationWorkspaceOptions {
  patient: Ref<AppPatient | null>;
  visits: Ref<HisVisitRecord[]>;
  followUpContext: Ref<HisOutpatientFollowUpContext | null>;
  loadHistory: (
    patientId: string,
    visits: HisVisitRecord[],
    followUpContext?: HisOutpatientFollowUpContext | null,
  ) => Promise<ReportHistoryEntry[]>;
  buildInterpretation: (
    report: ReportHistoryEntry,
    patient: AppPatient | null,
  ) => Promise<ReportInterpretationWindowPayload>;
}

export function useReportInterpretationWorkspace(options: ReportInterpretationWorkspaceOptions) {
  const reports = ref<ReportHistoryEntry[]>([]);
  const selectedId = ref('');
  const filter = ref<ReportHistoryFilter>('all');
  const loadingHistory = ref(false);
  const historyError = ref('');
  const interpretation = ref<ReportInterpretationWindowPayload | null>(null);
  const interpreting = ref(false);
  const interpretationError = ref('');
  const activeView = ref<ReportWorkspaceView>('source');
  const payloadCache = new Map<string, ReportInterpretationWindowPayload>();
  let requestVersion = 0;

  const filteredReports = computed(() => reports.value.filter((report) => {
    if (filter.value === 'lab') return report.taskId === 'inspectReport';
    if (filter.value === 'exam') return report.taskId === 'checkReport';
    return true;
  }));
  const selectedReport = computed(() => (
    reports.value.find((report) => report.id === selectedId.value) || null
  ));
  const canOpenFollowUp = computed(() => Boolean(
    selectedReport.value?.isFollowUpSource
      && options.followUpContext.value?.followUpEligible,
  ));
  const canInterpret = computed(() => Boolean(
    selectedReport.value?.available && selectedReport.value?.sourceQuery,
  ));

  function selectReport(report: ReportHistoryEntry): void {
    requestVersion += 1;
    selectedId.value = report.id;
    interpretationError.value = '';
    interpretation.value = payloadCache.get(report.id) || null;
    interpreting.value = false;
    activeView.value = 'source';
  }

  async function runInterpretation(options_: { force?: boolean } = {}): Promise<void> {
    const report = selectedReport.value;
    if (!report?.available || !report.sourceQuery) {
      interpretationError.value = '报告结果正文暂未加载，请稍后重试。';
      return;
    }

    const cached = payloadCache.get(report.id);
    if (cached && !options_.force) {
      interpretation.value = cached;
      activeView.value = 'interpretation';
      return;
    }

    const currentVersion = ++requestVersion;
    interpretationError.value = '';
    interpreting.value = true;
    activeView.value = 'source';
    try {
      const payload = await options.buildInterpretation(report, options.patient.value);
      if (currentVersion !== requestVersion || selectedId.value !== report.id) return;
      payloadCache.set(report.id, payload);
      interpretation.value = payload;
      activeView.value = 'interpretation';
    } catch (error) {
      if (currentVersion !== requestVersion) return;
      interpretationError.value = error instanceof Error ? error.message : '报告解读失败，请稍后重试。';
    } finally {
      if (currentVersion === requestVersion) {
        interpreting.value = false;
      }
    }
  }

  async function load(): Promise<void> {
    const patientId = options.patient.value?.patientId || options.patient.value?.idPi || '';
    loadingHistory.value = true;
    historyError.value = '';
    interpretation.value = null;
    interpretationError.value = '';
    activeView.value = 'source';
    requestVersion += 1;
    try {
      reports.value = patientId
        ? await options.loadHistory(patientId, options.visits.value, options.followUpContext.value)
        : [];
      const first = reports.value[0];
      if (first) {
        selectReport(first);
      } else {
        selectedId.value = '';
      }
    } catch (error) {
      reports.value = [];
      historyError.value = error instanceof Error ? error.message : '近期报告加载失败。';
    } finally {
      loadingHistory.value = false;
    }
  }

  function setFilter(nextFilter: ReportHistoryFilter): void {
    filter.value = nextFilter;
    const currentVisible = filteredReports.value.some((item) => item.id === selectedId.value);
    if (!currentVisible && filteredReports.value[0]) {
      void selectReport(filteredReports.value[0]);
    }
  }

  function showSource(): void {
    activeView.value = 'source';
  }

  function showInterpretation(): void {
    if (interpretation.value) {
      activeView.value = 'interpretation';
    }
  }

  return {
    reports,
    filteredReports,
    selectedReport,
    selectedId,
    filter,
    loadingHistory,
    historyError,
    interpretation,
    interpreting,
    interpretationError,
    activeView,
    canOpenFollowUp,
    canInterpret,
    load,
    selectReport,
    runInterpretation,
    setFilter,
    showSource,
    showInterpretation,
  };
}
