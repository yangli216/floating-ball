import type {
  HisOutpatientFollowUpContext,
  HisOutpatientFollowUpExam,
  HisOutpatientFollowUpReportResults,
} from './types';

const EMPTY_REPORT_TEXT_PATTERN = /^(?:null|undefined|\[null\])$/iu;
const HTTP_REPORT_URL_PATTERN = /^https?:\/\/\S+$/iu;

/**
 * HIS/PACS integrations may expose database nulls as literal text. Keep that
 * transport detail out of clinical evidence and AI prompts.
 */
export function normalizeHisReportText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || EMPTY_REPORT_TEXT_PATTERN.test(text)) return '';
  return text;
}

export function normalizeHisReportUrl(value: unknown): string {
  const text = normalizeHisReportText(value);
  if (!text || !HTTP_REPORT_URL_PATTERN.test(text)) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function normalizeHisOutpatientExam(
  report: HisOutpatientFollowUpExam,
): HisOutpatientFollowUpExam {
  const rawFinding = normalizeHisReportText(report.finding);
  const rawConclusion = normalizeHisReportText(report.conclusion);
  const reportUrl = normalizeHisReportUrl(report.reportUrl)
    || normalizeHisReportUrl(rawFinding)
    || normalizeHisReportUrl(rawConclusion);
  const finding = normalizeHisReportUrl(rawFinding) ? '' : rawFinding;
  const conclusion = normalizeHisReportUrl(rawConclusion) ? '' : rawConclusion;
  return {
    ...report,
    finding: finding || undefined,
    conclusion: conclusion || undefined,
    reportUrl: reportUrl || undefined,
  };
}

function normalizeExamReports(
  reports: HisOutpatientFollowUpExam[] | undefined,
): HisOutpatientFollowUpExam[] | undefined {
  return reports
    ?.map(normalizeHisOutpatientExam)
    .filter((report) => Boolean(report.finding || report.conclusion || report.reportUrl));
}

export function normalizeHisOutpatientFollowUpContext(
  context: HisOutpatientFollowUpContext | null,
): HisOutpatientFollowUpContext | null {
  if (!context) return null;
  return {
    ...context,
    examReports: normalizeExamReports(context.examReports),
  };
}

export function normalizeHisOutpatientFollowUpReportResults(
  results: HisOutpatientFollowUpReportResults | null,
): HisOutpatientFollowUpReportResults | null {
  if (!results) return null;
  return {
    ...results,
    examReports: normalizeExamReports(results.examReports),
  };
}
