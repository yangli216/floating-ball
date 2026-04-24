import type { AiTraceContext } from './aiTrace';
import type { Diagnosis, TreatmentRecommendation } from '../types/consultation';
import type { RecommendationType, TargetType } from '../types/feedback';
import type {
  VoiceFeedbackDraftState,
  VoiceFeedbackOption,
  VoicePendingFeedbackPayload,
  VoiceRecordFieldDiffSummary,
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldFeedbackPayload,
  VoiceRecordFieldKey,
  VoiceRecommendationFeedbackDraft,
  VoiceRecommendationFeedbackPayload,
  VoiceSessionFeedbackDraft,
  VoiceSessionFeedbackPayload,
} from '../types/voiceFeedback';

const DRAFT_STORAGE_PREFIX = 'VOICE_FEEDBACK_DRAFT';
const QUEUE_STORAGE_KEY = 'VOICE_FEEDBACK_PENDING_QUEUE';

export const VOICE_RECOMMENDATION_ISSUE_OPTIONS: VoiceFeedbackOption[] = [
  { key: 'irrelevant', label: '推荐不贴合当前病情' },
  { key: 'unsafe', label: '存在安全或禁忌风险' },
  { key: 'missing_context', label: '忽略了关键病史或上下文' },
  { key: 'catalog_mismatch', label: '标准库匹配不准确' },
  { key: 'writeback_unusable', label: '不便直接回写到 HIS' },
];

export const VOICE_SESSION_ISSUE_OPTIONS: VoiceFeedbackOption[] = [
  { key: 'diagnosis_quality', label: '诊断建议质量一般' },
  { key: 'treatment_quality', label: '治疗建议质量一般' },
  { key: 'missing_information', label: '结果缺失关键信息' },
  { key: 'too_much_noise', label: '输出噪音较多' },
  { key: 'workflow_friction', label: '操作流程不顺手' },
];

export const VOICE_RECORD_FIELD_ISSUE_OPTIONS: VoiceFeedbackOption[] = [
  { key: 'missing_information', label: '遗漏了关键信息' },
  { key: 'inaccurate_expression', label: '表述不够准确' },
  { key: 'timeline_conflict', label: '病程时序不清晰' },
  { key: 'history_confusion', label: '病史归类不准确' },
  { key: 'unsupported_inference', label: '存在不可靠推断' },
];

export const VOICE_RECORD_FIELD_LABELS: Record<VoiceRecordFieldKey, string> = {
  chiefComplaint: '主诉',
  historyOfPresentIllness: '现病史',
  pastMedicalHistory: '既往史',
};

export function createEmptyRecommendationDraft(): VoiceRecommendationFeedbackDraft {
  return {
    action: '',
    issueTags: [],
    comment: '',
    correctedValue: '',
  };
}

export function createEmptyRecordFieldDraft(): VoiceRecordFieldFeedbackDraft {
  return createEmptyRecommendationDraft();
}

export function createEmptySessionDraft(): VoiceSessionFeedbackDraft {
  return {
    rating: 0,
    issueTags: [],
    comment: '',
  };
}

export function createEmptyVoiceFeedbackDraftState(): VoiceFeedbackDraftState {
  return {
    recommendationDrafts: {},
    recordFieldDrafts: {},
    sessionDraft: createEmptySessionDraft(),
  };
}

function getDraftStorageKey(consultationId: string): string {
  return `${DRAFT_STORAGE_PREFIX}:${consultationId || 'unknown'}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeRecommendationDraft(input: Partial<VoiceRecommendationFeedbackDraft> | null | undefined): VoiceRecommendationFeedbackDraft {
  return {
    action: input?.action === 'useful' || input?.action === 'dissatisfied' || input?.action === 'corrected' ? input.action : '',
    issueTags: Array.isArray(input?.issueTags) ? input!.issueTags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
    comment: typeof input?.comment === 'string' ? input.comment : '',
    correctedValue: typeof input?.correctedValue === 'string' ? input.correctedValue : '',
  };
}

function normalizeSessionDraft(input: Partial<VoiceSessionFeedbackDraft> | null | undefined): VoiceSessionFeedbackDraft {
  return {
    rating: typeof input?.rating === 'number' ? Math.max(0, Math.min(5, Math.floor(input.rating))) : 0,
    issueTags: Array.isArray(input?.issueTags) ? input!.issueTags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
    comment: typeof input?.comment === 'string' ? input.comment : '',
  };
}

export function loadVoiceFeedbackDraft(consultationId: string): VoiceFeedbackDraftState {
  if (!consultationId) {
    return createEmptyVoiceFeedbackDraftState();
  }

  const raw = safeParse<Partial<VoiceFeedbackDraftState>>(localStorage.getItem(getDraftStorageKey(consultationId)), {});
  const recommendationDrafts = Object.entries(raw.recommendationDrafts || {}).reduce<Record<string, VoiceRecommendationFeedbackDraft>>((acc, [key, value]) => {
    acc[key] = normalizeRecommendationDraft(value);
    return acc;
  }, {});

  return {
    recommendationDrafts,
    recordFieldDrafts: Object.entries(raw.recordFieldDrafts || {}).reduce<Record<string, VoiceRecordFieldFeedbackDraft>>((acc, [key, value]) => {
      acc[key] = normalizeRecommendationDraft(value);
      return acc;
    }, {}),
    sessionDraft: normalizeSessionDraft(raw.sessionDraft),
  };
}

export function saveVoiceFeedbackDraft(consultationId: string, draft: VoiceFeedbackDraftState): void {
  if (!consultationId) {
    return;
  }

  localStorage.setItem(getDraftStorageKey(consultationId), JSON.stringify({
    recommendationDrafts: Object.entries(draft.recommendationDrafts).reduce<Record<string, VoiceRecommendationFeedbackDraft>>((acc, [key, value]) => {
      acc[key] = normalizeRecommendationDraft(value);
      return acc;
    }, {}),
    recordFieldDrafts: Object.entries(draft.recordFieldDrafts).reduce<Record<string, VoiceRecordFieldFeedbackDraft>>((acc, [key, value]) => {
      acc[key] = normalizeRecommendationDraft(value);
      return acc;
    }, {}),
    sessionDraft: normalizeSessionDraft(draft.sessionDraft),
  }));
}

export function clearVoiceFeedbackDraftStorage(consultationId: string): void {
  if (!consultationId) {
    return;
  }

  localStorage.removeItem(getDraftStorageKey(consultationId));
}

export function getVoiceDiagnosisFeedbackKey(diag: Pick<Diagnosis, 'id' | 'code' | 'name'>): string {
  return [diag.id || '', diag.code || '', diag.name || ''].join('|');
}

export function getVoiceTreatmentFeedbackKey(rec: Pick<TreatmentRecommendation, 'type' | 'name' | 'originalName' | 'matchedItem'>): string {
  return [rec.type || '', rec.originalName || rec.name || ''].join('|');
}

export function getVoiceRecordFieldFeedbackKey(fieldKey: VoiceRecordFieldKey): string {
  return `record:${fieldKey}`;
}

export function getVoiceRecordFieldLabel(fieldKey: VoiceRecordFieldKey): string {
  return VOICE_RECORD_FIELD_LABELS[fieldKey];
}

export function mapTreatmentTypeToRecommendationType(type: TreatmentRecommendation['type']): RecommendationType {
  switch (type) {
    case 'medicine':
      return 'medication';
    case 'exam':
      return 'examination';
    case 'lab_test':
      return 'lab_test';
    case 'procedure':
    case 'acupuncture':
      return 'procedure';
    default:
      return 'procedure';
  }
}

export function mapTreatmentTypeToTargetType(type: TreatmentRecommendation['type']): TargetType {
  switch (type) {
    case 'medicine':
      return 'medication';
    case 'exam':
      return 'examination';
    case 'lab_test':
      return 'lab_test';
    case 'procedure':
    case 'acupuncture':
      return 'procedure';
    default:
      return 'procedure';
  }
}

function getPendingQueue(): VoicePendingFeedbackPayload[] {
  return safeParse<VoicePendingFeedbackPayload[]>(localStorage.getItem(QUEUE_STORAGE_KEY), []);
}

export function enqueueVoiceFeedbackPayload(payload: VoicePendingFeedbackPayload): void {
  const queue = getPendingQueue();
  queue.unshift(payload);
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(0, 200)));
}

export function listVoiceFeedbackPayloadQueue(): VoicePendingFeedbackPayload[] {
  return getPendingQueue();
}

export function buildVoiceRecommendationFeedbackPayload(input: {
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  targetType: TargetType;
  targetId: string;
  recommendationType: RecommendationType;
  recommendationKey: string;
  recommendationTitle: string;
  action: VoiceRecommendationFeedbackDraft['action'];
  issueTags: string[];
  comment: string;
  correctedValue?: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  recommendationSnapshot: Record<string, unknown>;
  aiTrace: AiTraceContext | null;
}): VoiceRecommendationFeedbackPayload {
  const createdAt = Date.now();

  return {
    kind: 'recommendation',
    localId: crypto.randomUUID(),
    consultationId: input.consultationId,
    sessionId: input.sessionId,
    patientId: input.patientId,
    patientName: input.patientName,
    targetType: input.targetType,
    targetId: input.targetId,
    recommendationType: input.recommendationType,
    recommendationKey: input.recommendationKey,
    recommendationTitle: input.recommendationTitle,
    action: input.action || 'dissatisfied',
    issueTags: input.issueTags,
    comment: input.comment,
    correctedValue: input.correctedValue,
    encounterSummary: {
      chiefComplaint: input.chiefComplaint,
      historyOfPresentIllness: input.historyOfPresentIllness,
    },
    aiTrace: input.aiTrace ? { ...input.aiTrace } : null,
    recommendationSnapshot: input.recommendationSnapshot,
    createdAt,
  };
}

function normalizeRecordText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncatePreview(value: string, maxLength = 80): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

export function buildVoiceRecordFieldDiffSummary(originalValue: string, currentValue: string): VoiceRecordFieldDiffSummary {
  const original = normalizeRecordText(originalValue);
  const current = normalizeRecordText(currentValue);

  if (!original && !current) {
    return {
      changed: false,
      summaryText: '当前内容与 AI 原文一致',
      originalExcerpt: '',
      currentExcerpt: '',
      removedText: '',
      addedText: '',
    };
  }

  if (original === current) {
    return {
      changed: false,
      summaryText: '当前内容与 AI 原文一致',
      originalExcerpt: truncatePreview(original),
      currentExcerpt: truncatePreview(current),
      removedText: '',
      addedText: '',
    };
  }

  let prefixLength = 0;
  const maxPrefix = Math.min(original.length, current.length);
  while (prefixLength < maxPrefix && original[prefixLength] === current[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffix = Math.min(original.length - prefixLength, current.length - prefixLength);
  while (
    suffixLength < maxSuffix
    && original[original.length - 1 - suffixLength] === current[current.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const removedText = original.slice(prefixLength, original.length - suffixLength).trim();
  const addedText = current.slice(prefixLength, current.length - suffixLength).trim();
  const removedPreview = truncatePreview(removedText || original);
  const addedPreview = truncatePreview(addedText || current);

  return {
    changed: true,
    summaryText: `医生已调整内容：由“${removedPreview || '空'}”改为“${addedPreview || '空'}”`,
    originalExcerpt: truncatePreview(original),
    currentExcerpt: truncatePreview(current),
    removedText,
    addedText,
  };
}

export function buildVoiceRecordFieldFeedbackPayload(input: {
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  fieldKey: VoiceRecordFieldKey;
  action: VoiceRecordFieldFeedbackDraft['action'];
  issueTags: string[];
  comment: string;
  correctedValue?: string;
  originalValue: string;
  currentValue: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  aiTrace: AiTraceContext | null;
}): VoiceRecordFieldFeedbackPayload {
  const createdAt = Date.now();
  const diffSummary = buildVoiceRecordFieldDiffSummary(input.originalValue, input.currentValue);

  return {
    kind: 'record_field',
    localId: crypto.randomUUID(),
    consultationId: input.consultationId,
    sessionId: input.sessionId,
    patientId: input.patientId,
    patientName: input.patientName,
    fieldKey: input.fieldKey,
    fieldLabel: getVoiceRecordFieldLabel(input.fieldKey),
    action: input.action || 'dissatisfied',
    issueTags: input.issueTags,
    comment: input.comment,
    correctedValue: input.correctedValue,
    originalValue: input.originalValue,
    currentValue: input.currentValue,
    modifiedByDoctor: diffSummary.changed,
    diffSummary,
    encounterSummary: {
      chiefComplaint: input.chiefComplaint,
      historyOfPresentIllness: input.historyOfPresentIllness,
      pastMedicalHistory: input.pastMedicalHistory,
    },
    aiTrace: input.aiTrace ? { ...input.aiTrace } : null,
    createdAt,
  };
}

export function buildVoiceSessionFeedbackPayload(input: {
  consultationId: string;
  sessionId: string | null;
  patientId: string;
  patientName: string;
  rating: number;
  issueTags: string[];
  comment: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  diagnosisNames: string[];
  selectedTreatmentNames: string[];
  aiTrace: AiTraceContext | null;
}): VoiceSessionFeedbackPayload {
  const createdAt = Date.now();

  return {
    kind: 'session',
    localId: crypto.randomUUID(),
    consultationId: input.consultationId,
    sessionId: input.sessionId,
    patientId: input.patientId,
    patientName: input.patientName,
    rating: input.rating,
    issueTags: input.issueTags,
    comment: input.comment,
    encounterSummary: {
      chiefComplaint: input.chiefComplaint,
      historyOfPresentIllness: input.historyOfPresentIllness,
      diagnosisNames: input.diagnosisNames,
      selectedTreatmentNames: input.selectedTreatmentNames,
    },
    aiTrace: input.aiTrace ? { ...input.aiTrace } : null,
    createdAt,
  };
}

export function buildVoiceFeedbackReason(issueTags: string[], comment: string): string {
  const trimmedComment = comment.trim();
  const tagText = issueTags.length > 0 ? `问题标签：${issueTags.join('、')}` : '';
  if (tagText && trimmedComment) {
    return `${tagText}；补充说明：${trimmedComment}`;
  }
  return tagText || trimmedComment;
}

export function getVoiceFeedbackActionLabel(action: VoiceRecommendationFeedbackDraft['action']): string {
  switch (action) {
    case 'useful':
      return '已标记为有用';
    case 'dissatisfied':
      return '已提交不满意反馈';
    case 'corrected':
      return '已记录修正采用';
    default:
      return '已提交反馈';
  }
}
