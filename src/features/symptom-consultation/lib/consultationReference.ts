export type ReferenceAction = 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure' | 'batch';
export type ReferenceItemType = Exclude<ReferenceAction, 'batch'>;
export type ReferenceLifecycleStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface ReferenceItemPayload {
  name: string;
  code?: string;
  type: ReferenceItemType;
  isTCM?: boolean;
  idCli?: string;
}

export interface ReferenceFeedbackPayload {
  consultationId?: string;
  requestId: string;
  referenceType?: ReferenceAction;
  action: ReferenceAction;
  status: ReferenceLifecycleStatus;
  message?: string;
  items?: ReferenceItemPayload[];
  recognizableItems?: unknown[];
  timestamp?: number;
}

export interface ReferenceStatusEntry {
  status: ReferenceLifecycleStatus;
  requestId: string;
  message?: string;
  updatedAt: number;
}

export type ReferenceStatusMap = Record<string, ReferenceStatusEntry>;

export function buildReferenceKey(
  action: ReferenceAction,
  item: { name: string; code?: string },
): string {
  return `${action}:${item.code || item.name}`;
}

export function resolveReferenceItemAction(
  action: ReferenceAction,
  item: ReferenceItemPayload,
): ReferenceAction {
  return action === 'batch' ? item.type : action;
}

export function setReferenceStatusesInMap(
  currentMap: ReferenceStatusMap,
  action: ReferenceAction,
  items: ReferenceItemPayload[],
  entry: ReferenceStatusEntry,
): ReferenceStatusMap {
  const nextMap = { ...currentMap };
  items.forEach((item) => {
    nextMap[buildReferenceKey(resolveReferenceItemAction(action, item), item)] = entry;
  });
  return nextMap;
}

export function areAllReferenceItemsSuccessful(
  statusMap: ReferenceStatusMap,
  action: ReferenceAction,
  items: ReferenceItemPayload[],
): boolean {
  return items.every((item) =>
    statusMap[buildReferenceKey(resolveReferenceItemAction(action, item), item)]?.status === 'success'
  );
}

export function isPendingReferenceItem(
  activeRequest: ReferenceFeedbackPayload | null,
  action: ReferenceAction,
  item: { name: string; code?: string },
): boolean {
  if (activeRequest?.status !== 'pending' || activeRequest.action !== action) {
    return false;
  }

  return (activeRequest.items || []).some((pendingItem) =>
    buildReferenceKey(action, pendingItem) === buildReferenceKey(action, item)
  );
}

export function normalizeReferenceFeedbackPayload(
  payload: ReferenceFeedbackPayload,
  timestamp = Date.now(),
): ReferenceFeedbackPayload {
  const resolvedAction = payload.referenceType || payload.action;
  return {
    ...payload,
    action: resolvedAction,
    referenceType: resolvedAction,
    timestamp: payload.timestamp || timestamp,
  };
}

export function buildReferenceStatusEntryFromFeedback(
  payload: ReferenceFeedbackPayload,
): ReferenceStatusEntry {
  return {
    status: payload.status,
    requestId: payload.requestId,
    message: payload.message,
    updatedAt: payload.timestamp || Date.now(),
  };
}

export function buildPendingReferenceStatusEntry(
  requestId: string,
  message = '等待 PHIS 保存引用结果',
  timestamp = Date.now(),
): ReferenceStatusEntry {
  return {
    status: 'pending',
    requestId,
    message,
    updatedAt: timestamp,
  };
}

export function resolveReferenceFeedbackItems(
  payload: ReferenceFeedbackPayload,
  activeRequest: ReferenceFeedbackPayload | null,
): ReferenceItemPayload[] {
  return (
    payload.items && payload.items.length > 0
      ? payload.items
      : activeRequest?.items
  ) || [];
}

export function buildReferenceRequestPayload(input: {
  consultationId: string;
  requestId: string;
  action: ReferenceAction;
  items: ReferenceItemPayload[];
  message?: string;
  timestamp?: number;
}): ReferenceFeedbackPayload {
  return {
    consultationId: input.consultationId,
    requestId: input.requestId,
    action: input.action,
    referenceType: input.action,
    status: 'pending',
    message: input.message || '等待 PHIS 保存引用结果',
    items: input.items,
    timestamp: input.timestamp || Date.now(),
  };
}

export function getReferenceStatusLabel(status: ReferenceLifecycleStatus): string {
  switch (status) {
    case 'success':
      return '已引用';
    case 'failed':
      return '引用失败';
    case 'cancelled':
      return '已取消';
    default:
      return '等待回执';
  }
}

export function getDiagnosisReferenceButtonLabel(input: {
  status?: ReferenceLifecycleStatus;
  pending?: boolean;
}): string {
  if (input.status === 'success') {
    return '已引用';
  }
  if (input.pending) {
    return '等待回执...';
  }
  if (input.status === 'failed') {
    return '重试引用';
  }
  return '引用诊断';
}

export function isDiagnosisReferenceDisabled(input: {
  status?: ReferenceLifecycleStatus;
  hasPendingReferenceRequest: boolean;
}): boolean {
  return input.status === 'success' || input.hasPendingReferenceRequest;
}

export function mapTreatmentTypeToReferenceAction(
  type: string,
): Exclude<ReferenceAction, 'diagnosis'> | null {
  if (type === 'medicine') {
    return 'medication';
  }
  if (type === 'exam') {
    return 'examination';
  }
  if (type === 'lab_test') {
    return 'lab_test';
  }
  if (type === 'procedure') {
    return 'procedure';
  }
  return null;
}

export function getReferenceStatusFromMap(
  statusMap: ReferenceStatusMap,
  action: ReferenceAction,
  item: { name: string; code?: string },
): ReferenceStatusEntry | null {
  return statusMap[buildReferenceKey(action, item)] || null;
}
