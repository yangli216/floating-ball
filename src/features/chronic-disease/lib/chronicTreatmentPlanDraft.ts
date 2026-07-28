import type {
  TreatmentPlanInitialDraft,
  TreatmentPlanInitialDraftRecordContext,
  TreatmentPlanInitialDraftStandardDiagnosis,
} from '@features/treatment-plan';
import type {
  VisCliLoadedItem,
  VisMidQryCliVO,
} from '@/services/his';
import type {
  ChronicAiRecommendation,
} from '../types';

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function readMatchedText(
  item: ChronicAiRecommendation,
  keys: string[],
): string {
  const matched = item.matchedItem as Record<string, unknown>;
  const raw = matched.raw && typeof matched.raw === 'object'
    ? matched.raw as Record<string, unknown>
    : undefined;
  for (const key of keys) {
    const value = text(matched[key]) || text(raw?.[key]);
    if (value) return value;
  }
  return '';
}

export function buildChronicVisCliQueryItems(
  suggestions: ChronicAiRecommendation[],
): VisMidQryCliVO[] {
  return suggestions.map((item) => {
    const idSrv = readMatchedText(item, ['idSrv', 'idCli', 'id', 'code']);
    if (!idSrv) {
      throw new Error(`${item.name} 缺少诊疗项目 ID，无法加载医嘱调入映射`);
    }
    const idPart = readMatchedText(item, ['idPart']);
    return {
      idSrv,
      naSrv: item.matchedItem.name || item.name,
      itemKind: item.type === 'lab_test' ? '1' : '2',
      ...(idPart ? { idPart } : {}),
    };
  });
}

function findLoadedItem(
  request: VisMidQryCliVO,
  loadedItems: VisCliLoadedItem[],
): VisCliLoadedItem | undefined {
  return loadedItems.find((item) => {
    const loadedId = text(item.idSrv) || text(item.idCli);
    return Boolean(loadedId && loadedId === request.idSrv);
  }) || loadedItems.find((item) => {
    const loadedName = text(item.naSrv) || text(item.naApply);
    return loadedName === request.naSrv
      && (!item.itemKind || text(item.itemKind) === text(request.itemKind));
  });
}

function mergeLoadedItem(
  item: ChronicAiRecommendation,
  request: VisMidQryCliVO,
  loaded: VisCliLoadedItem,
): ChronicAiRecommendation {
  const matched = item.matchedItem as Record<string, unknown>;
  const raw = matched.raw && typeof matched.raw === 'object'
    ? matched.raw as Record<string, unknown>
    : {};
  const idSrv = text(loaded.idSrv) || request.idSrv;
  const idCli = text(loaded.idCli);
  const name = text(loaded.naSrv) || text(loaded.naApply) || item.matchedItem.name || item.name;
  return {
    ...item,
    name,
    matchedItem: {
      ...item.matchedItem,
      id: idCli || item.matchedItem.id,
      idSrv,
      name,
      naSrv: name,
      ...(idCli ? { idCli } : {}),
      ...(text(loaded.idPart) ? { idPart: text(loaded.idPart) } : {}),
      ...(text(loaded.idDeptExec) ? { idDeptExec: text(loaded.idDeptExec) } : {}),
      ...(typeof loaded.priceSale === 'number' ? { priceSale: loaded.priceSale } : {}),
      raw: {
        ...raw,
        ...loaded,
        idSrv,
        naSrv: name,
        ...(idCli ? { idCli } : {}),
      },
    },
  };
}

export function mergeChronicVisCliLoadedItems(
  suggestions: ChronicAiRecommendation[],
  loadedItems: VisCliLoadedItem[],
): ChronicAiRecommendation[] {
  const requests = buildChronicVisCliQueryItems(suggestions);
  return suggestions.map((item, index) => {
    const loaded = findLoadedItem(requests[index], loadedItems);
    return loaded ? mergeLoadedItem(item, requests[index], loaded) : item;
  });
}

export function buildChronicTreatmentPlanInitialDraft(input: {
  patientAnchorId: string;
  suggestions: ChronicAiRecommendation[];
  selectedIds: string[];
  requestId: string;
  standardDiagnoses: TreatmentPlanInitialDraftStandardDiagnosis[];
  recordContext?: TreatmentPlanInitialDraftRecordContext;
}): TreatmentPlanInitialDraft {
  const selected = new Set(input.selectedIds);
  return {
    requestId: input.requestId,
    patientAnchorId: input.patientAnchorId,
    sourceModule: 'chronic_disease',
    title: '两慢病 AI 推荐',
    standardDiagnoses: input.standardDiagnoses,
    ...(input.recordContext ? { recordContext: input.recordContext } : {}),
    items: input.suggestions
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        sourceId: item.id,
        type: item.type,
        name: item.name,
        reason: item.reason,
        matchedItem: item.matchedItem,
        matchStatus: 'exact',
      })),
  };
}
