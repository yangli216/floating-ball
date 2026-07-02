import { parseLLMJson } from './clinicalResultLlmJsonParser';

export interface DiagnosisChecklistItem {
  question: string;
  recordText: string;
}

export interface DiagnosisChecklistResponse {
  isNeeded?: boolean;
  severity?: string;
  items?: DiagnosisChecklistItem[];
}

export interface DiagnosisChecklistRiskIssue {
  issue: string;
  target: string;
}

function normalizeChecklistText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseDiagnosisChecklistResponse(response: string): DiagnosisChecklistResponse {
  return parseLLMJson<DiagnosisChecklistResponse>(response);
}

export function normalizeDiagnosisChecklistItems(
  result: DiagnosisChecklistResponse,
): DiagnosisChecklistItem[] {
  if (!result?.isNeeded || !Array.isArray(result.items)) {
    return [];
  }

  return result.items
    .map((item) => ({
      question: normalizeChecklistText(item?.question),
      recordText: normalizeChecklistText(item?.recordText),
    }))
    .filter((item) => item.question);
}

export function buildDiagnosisChecklistMismatchError(
  result: DiagnosisChecklistResponse,
): string {
  if (!result?.isNeeded) {
    return '';
  }

  const items = normalizeDiagnosisChecklistItems(result);
  const combinedText = items
    .map((item) => `${item.question} ${item.recordText}`)
    .join(' ');
  const isCritical = result.severity === 'critical'
    || /不匹配|不相符|明显不符|不能解释|无法解释|复核诊断方向|诊断方向.*错误|诊断.*错误/.test(combinedText);

  if (!isCritical) {
    return '';
  }

  return items[0]?.question || '当前诊断与主诉、现病史明显不符，请先复核诊断方向。';
}

export function buildDiagnosisChecklistRiskIssues(
  result: DiagnosisChecklistResponse,
  fallbackTarget: string,
): DiagnosisChecklistRiskIssue[] {
  return normalizeDiagnosisChecklistItems(result)
    .map((item) => ({
      issue: item.question,
      target: item.recordText || fallbackTarget,
    }))
    .filter((item) => item.issue);
}
