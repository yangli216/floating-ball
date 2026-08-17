export type MutualRecognitionDecisionType = 'recognize' | 'not_recognize' | 'cancel';

export interface MutualRecognitionItem {
  idSrv: string;
  idCli?: string;
  name: string;
  sdSrv: string;
  type: 'examination' | 'lab_test';
  mutualRecognitionCode: string;
  priceSale?: number;
  raw: Record<string, unknown>;
}

export interface MutualRecognitionFeedbackLike {
  requestId: string;
  status: string;
  message?: string;
  items?: unknown;
  recognizableItems?: unknown;
}

export interface BuildMutualRecognitionDecisionPayloadInput {
  consultationId: string;
  requestId: string;
  decision: MutualRecognitionDecisionType;
  recognizedItemIds?: string[];
  timestamp?: number;
}

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function readPrice(source: Record<string, unknown>): number | undefined {
  const value = source.priceSale;
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeMutualRecognitionItem(value: unknown): MutualRecognitionItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const idSrv = readString(raw, ['idSrv', 'idCli', 'id']);
  const name = readString(raw, ['naSrv', 'naCli', 'name']);
  if (!idSrv || !name) return null;

  const sdSrv = readString(raw, ['sdSrv']);
  const explicitType = readString(raw, ['type']);
  const type = sdSrv === '31' || explicitType === 'examination' || explicitType === 'exam'
    ? 'examination'
    : 'lab_test';

  return {
    idSrv,
    idCli: readString(raw, ['idCli']) || undefined,
    name,
    sdSrv: sdSrv || (type === 'examination' ? '31' : '41'),
    type,
    mutualRecognitionCode: readString(raw, ['mutualRecognitionCode']),
    priceSale: readPrice(raw),
    raw,
  };
}

export function normalizeMutualRecognitionItems(payload: MutualRecognitionFeedbackLike): MutualRecognitionItem[] {
  const source = Array.isArray(payload.recognizableItems)
    ? payload.recognizableItems
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const unique = new Map<string, MutualRecognitionItem>();
  source.forEach((value) => {
    const item = normalizeMutualRecognitionItem(value);
    if (item && !unique.has(item.idSrv)) unique.set(item.idSrv, item);
  });
  return [...unique.values()];
}

export function buildMutualRecognitionDecisionPayload(
  input: BuildMutualRecognitionDecisionPayloadInput,
): Record<string, unknown> {
  const consultationId = input.consultationId.trim();
  const requestId = input.requestId.trim();
  if (!consultationId) throw new Error('缺少当前就诊标识，无法提交互认决策');
  if (!requestId) throw new Error('缺少原回写 requestId，无法提交互认决策');

  const recognizedItemIds = Array.from(new Set(
    (input.recognizedItemIds || []).map((value) => value.trim()).filter(Boolean),
  ));
  if (input.decision === 'recognize' && recognizedItemIds.length === 0) {
    throw new Error('请至少勾选一项需要互认的检验检查项目');
  }

  return {
    consultationId,
    timestamp: input.timestamp ?? Date.now(),
    resultType: 'reference-request',
    requestId,
    referenceType: 'batch',
    action: 'batch',
    referenceStatus: 'pending',
    referenceMessage: '等待 PHIS 根据医生互认决策完成保存并回执。',
    recognitionDecision: {
      decision: input.decision,
      ...(input.decision === 'recognize' ? { recognizedItemIds } : {}),
    },
  };
}
