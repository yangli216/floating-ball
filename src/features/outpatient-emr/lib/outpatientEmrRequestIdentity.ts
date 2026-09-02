import type { OutpatientEmrAnalysisRequest } from '../types';

function stableJsonValue(value: unknown, ancestors: object[]): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.includes(value)) {
    throw new TypeError('门诊模板分析请求不能包含循环引用。');
  }

  const nextAncestors = [...ancestors, value];
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item, nextAncestors));
  }

  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [
        key,
        stableJsonValue((value as Record<string, unknown>)[key], nextAncestors),
      ]),
  );
}

function stableJsonStringify(value: unknown): string {
  const serialized = JSON.stringify(stableJsonValue(value, []));
  if (serialized === undefined) {
    throw new TypeError('门诊模板分析请求必须是可序列化 JSON。');
  }
  return serialized;
}

function getTargetFieldSelection(value: string[]): string[] {
  return [...value].sort();
}

function isStrictTargetFieldSelection(value: string[]): boolean {
  return Array.isArray(value)
    && value.length > 0
    && value.every((fieldId) => (
      typeof fieldId === 'string'
      && fieldId.length > 0
      && fieldId === fieldId.trim()
    ))
    && new Set(value).size === value.length;
}

function buildRequestSnapshot(request: OutpatientEmrAnalysisRequest): string {
  if (!isStrictTargetFieldSelection(request.targetFieldIds)) return '';
  return stableJsonStringify({
    requestId: request.requestId,
    visitId: request.visitId,
    templateId: request.templateId,
    templateName: request.templateName,
    templateHtml: request.templateHtml,
    templateDefinition: request.templateDefinition,
    targetFieldIds: getTargetFieldSelection(request.targetFieldIds),
    patient: request.patient ?? null,
    recordContext: request.recordContext,
  });
}

/**
 * A request id can restore an active task only when it still points at the exact
 * template pair and the same renderer-authoritative target selection.
 */
export function isSameOutpatientEmrAnalysisRequestSnapshot(
  current: OutpatientEmrAnalysisRequest,
  incoming: OutpatientEmrAnalysisRequest,
): boolean {
  try {
    const currentSnapshot = buildRequestSnapshot(current);
    return Boolean(currentSnapshot) && currentSnapshot === buildRequestSnapshot(incoming);
  } catch {
    return false;
  }
}
