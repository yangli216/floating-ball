import type { AiTraceContext } from './aiTrace';
import type { Diagnosis, TreatmentRecommendation } from '../types/consultation';
import type { RecommendationType, TargetType } from '../types/feedback';
import type {
  VoiceFeedbackDraftState,
  VoiceFeedbackOption,
  VoicePendingFeedbackPayload,
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

export function createEmptyRecommendationDraft(): VoiceRecommendationFeedbackDraft {
  return {
    action: '',
    issueTags: [],
    comment: '',
    correctedValue: '',
  };
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