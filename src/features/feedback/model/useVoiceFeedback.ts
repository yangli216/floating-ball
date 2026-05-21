import { computed, ref, watch, type Ref } from 'vue';
import { getLatestAiTrace } from '@/services/aiTrace';
import { feedbackService } from '@/services/feedback';
import {
  buildVoiceFeedbackReason,
  buildVoiceRecordFieldDiffSummary,
  buildVoiceRecordFieldFeedbackPayload,
  buildVoiceRecommendationFeedbackPayload,
  buildVoiceSessionFeedbackPayload,
  clearVoiceFeedbackDraftStorage,
  createEmptyRecordFieldDraft,
  createEmptyRecommendationDraft,
  createEmptySessionDraft,
  enqueueVoiceFeedbackPayload,
  getVoiceFeedbackActionLabel,
  getVoiceRecordFieldFeedbackKey,
  getVoiceRecordFieldLabel,
  loadVoiceFeedbackDraft,
  saveVoiceFeedbackDraft,
  submitVoicePendingPayloadToBackend,
} from '@/services/voiceFeedback';
import {
  getDiagnosisRecommendationFeedbackKey,
  getTreatmentRecommendationFeedbackKey,
  mapTreatmentTypeToRecommendationType,
  mapTreatmentTypeToTargetType,
} from '@features/clinical-result';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { FeedbackType, RecommendationType, TargetType } from '@/types/feedback';
import type {
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
  VoiceRecommendationFeedbackDraft,
  VoiceSessionFeedbackDraft,
  VoiceFeedbackSubmissionSummary,
} from '@/types/voiceFeedback';

interface UseVoiceFeedbackInput {
  consultationId: Ref<string>;
  patientId: Ref<string>;
  patientName: Ref<string>;
  chiefComplaint: Ref<string>;
  historyOfPresentIllness: Ref<string>;
  pastMedicalHistory: Ref<string>;
  familyHistory: Ref<string>;
}

interface RegisteredRecommendationTarget {
  targetId: string;
  targetType: TargetType;
  recommendationType: RecommendationType;
}

function createRecommendationContent(recType: RecommendationType, snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    sourceModule: 'voice_consultation_result',
    recType,
    snapshot,
  };
}

function mapActionToFeedbackType(action: VoiceRecommendationFeedbackDraft['action']): FeedbackType {
  switch (action) {
    case 'useful':
      return 'positive';
    case 'corrected':
      return 'modified';
    case 'dissatisfied':
    default:
      return 'negative';
  }
}

export function useVoiceFeedback(input: UseVoiceFeedbackInput) {
  const recommendationTargets = ref<Record<string, RegisteredRecommendationTarget>>({});
  const recommendationDrafts = ref<Record<string, VoiceRecommendationFeedbackDraft>>({});
  const recordFieldDrafts = ref<Record<string, VoiceRecordFieldFeedbackDraft>>({});
  const sessionDraft = ref<VoiceSessionFeedbackDraft>(createEmptySessionDraft());
  const recommendationSubmittingKey = ref<string | null>(null);
  const recordFieldSubmittingKey = ref<string | null>(null);
  const sessionSubmitting = ref(false);
  const recommendationSubmittedMap = ref<Record<string, VoiceFeedbackSubmissionSummary>>({});
  const recordFieldSubmittedMap = ref<Record<string, VoiceFeedbackSubmissionSummary>>({});
  const sessionSubmittedAt = ref<number | null>(null);

  const draftState = computed(() => ({
    recommendationDrafts: recommendationDrafts.value,
    recordFieldDrafts: recordFieldDrafts.value,
    sessionDraft: sessionDraft.value,
  }));

  function rebuildSubmissionState(): void {
    recommendationSubmittedMap.value = Object.entries(recommendationDrafts.value).reduce<Record<string, VoiceFeedbackSubmissionSummary>>((acc, [key, draft]) => {
      if (draft.action && draft.submittedAt) {
        acc[key] = {
          actionLabel: getVoiceFeedbackActionLabel(draft.action),
          submittedAt: draft.submittedAt,
        };
      }
      return acc;
    }, {});

    recordFieldSubmittedMap.value = Object.entries(recordFieldDrafts.value).reduce<Record<string, VoiceFeedbackSubmissionSummary>>((acc, [key, draft]) => {
      if (draft.action && draft.submittedAt) {
        acc[key] = {
          actionLabel: getVoiceFeedbackActionLabel(draft.action),
          submittedAt: draft.submittedAt,
        };
      }
      return acc;
    }, {});

    sessionSubmittedAt.value = sessionDraft.value.submittedAt || null;
  }

  function restoreVoiceFeedbackDraft(): void {
    const restored = loadVoiceFeedbackDraft(input.consultationId.value);
    recommendationDrafts.value = restored.recommendationDrafts;
    recordFieldDrafts.value = restored.recordFieldDrafts;
    sessionDraft.value = restored.sessionDraft;
    rebuildSubmissionState();
  }

  function persistDraft(): void {
    saveVoiceFeedbackDraft(input.consultationId.value, draftState.value);
  }

  function clearVoiceFeedbackDraft(): void {
    recommendationDrafts.value = {};
    recordFieldDrafts.value = {};
    sessionDraft.value = createEmptySessionDraft();
    recommendationSubmittedMap.value = {};
    recordFieldSubmittedMap.value = {};
    sessionSubmittedAt.value = null;
    clearVoiceFeedbackDraftStorage(input.consultationId.value);
  }

  function ensureRecommendationDraft(recommendationKey: string): VoiceRecommendationFeedbackDraft {
    return recommendationDrafts.value[recommendationKey] || createEmptyRecommendationDraft();
  }

  function updateRecommendationDraft(recommendationKey: string, draft: VoiceRecommendationFeedbackDraft): void {
    recommendationDrafts.value = {
      ...recommendationDrafts.value,
      [recommendationKey]: {
        ...createEmptyRecommendationDraft(),
        ...draft,
      },
    };
    persistDraft();
  }

  function ensureRecordFieldDraft(fieldKey: VoiceRecordFieldKey): VoiceRecordFieldFeedbackDraft {
    return recordFieldDrafts.value[getVoiceRecordFieldFeedbackKey(fieldKey)] || createEmptyRecordFieldDraft();
  }

  function updateRecordFieldDraft(fieldKey: VoiceRecordFieldKey, draft: VoiceRecordFieldFeedbackDraft): void {
    const recordFieldKey = getVoiceRecordFieldFeedbackKey(fieldKey);
    recordFieldDrafts.value = {
      ...recordFieldDrafts.value,
      [recordFieldKey]: {
        ...createEmptyRecordFieldDraft(),
        ...draft,
      },
    };
    persistDraft();
  }

  function updateSessionDraft(draft: VoiceSessionFeedbackDraft): void {
    sessionDraft.value = {
      ...createEmptySessionDraft(),
      ...draft,
    };
    persistDraft();
  }

  async function registerRecommendations(payload: {
    diagnoses: Diagnosis[];
    treatments: TreatmentRecommendation[];
    selectedDiagnosis: Diagnosis | null;
  }): Promise<void> {
    const sessionId = feedbackService.getCurrentSessionId();
    if (!sessionId) {
      return;
    }

    const nextTargets = { ...recommendationTargets.value };

    for (const diag of payload.diagnoses) {
      const recommendationKey = getDiagnosisRecommendationFeedbackKey(diag);
      if (nextTargets[recommendationKey]?.targetId) {
        continue;
      }

      const recommendationId = await feedbackService.saveRecommendation({
        sessionId,
        recType: 'diagnosis',
        content: createRecommendationContent('diagnosis', {
          id: diag.id || '',
          code: diag.code || '',
          name: diag.name || '',
          rationale: diag.rationale || '',
          selected: payload.selectedDiagnosis?.name === diag.name && payload.selectedDiagnosis?.code === diag.code,
        }),
        matched: Boolean(diag.id || diag.code),
      });

      nextTargets[recommendationKey] = {
        targetId: recommendationId,
        targetType: 'diagnosis',
        recommendationType: 'diagnosis',
      };
    }

    for (const treatment of payload.treatments) {
      const recommendationKey = getTreatmentRecommendationFeedbackKey(treatment);
      if (nextTargets[recommendationKey]?.targetId) {
        continue;
      }

      const recommendationType = mapTreatmentTypeToRecommendationType(treatment.type);
      const targetType = mapTreatmentTypeToTargetType(treatment.type);
      const recommendationId = await feedbackService.saveRecommendation({
        sessionId,
        recType: recommendationType,
        content: createRecommendationContent(recommendationType, {
          type: treatment.type,
          name: treatment.name,
          originalName: treatment.originalName || '',
          reason: treatment.reason || '',
          matchedItem: treatment.matchedItem || null,
          matchStatus: treatment.matchStatus || 'unmatched',
        }),
        matched: Boolean(treatment.matchedItem),
      });

      nextTargets[recommendationKey] = {
        targetId: recommendationId,
        targetType,
        recommendationType,
      };
    }

    recommendationTargets.value = nextTargets;
  }

  function registerExternalRecommendationTarget(payload: {
    recommendationKey: string;
    targetId: string;
    targetType: TargetType;
    recommendationType: RecommendationType;
  }): void {
    recommendationTargets.value = {
      ...recommendationTargets.value,
      [payload.recommendationKey]: {
        targetId: payload.targetId,
        targetType: payload.targetType,
        recommendationType: payload.recommendationType,
      },
    };
  }

  async function submitRecommendationFeedback(payload: {
    recommendationKey: string;
    recommendationTitle: string;
    draft: VoiceRecommendationFeedbackDraft;
    snapshot: Record<string, unknown>;
    fallbackTargetType: TargetType;
    fallbackRecommendationType: RecommendationType;
  }): Promise<void> {
    const sessionId = feedbackService.getCurrentSessionId();
    if (!sessionId) {
      throw new Error('当前没有可用的反馈会话');
    }

    const registered = recommendationTargets.value[payload.recommendationKey];
    if (!registered?.targetId) {
      throw new Error('推荐快照尚未登记，请稍后重试');
    }

    recommendationSubmittingKey.value = payload.recommendationKey;
    try {
      const reason = buildVoiceFeedbackReason(payload.draft.issueTags, payload.draft.comment);
      await feedbackService.saveFeedback({
        sessionId,
        targetType: registered.targetType || payload.fallbackTargetType,
        targetId: registered.targetId,
        feedbackType: mapActionToFeedbackType(payload.draft.action),
        reason: reason || undefined,
        originalValue: JSON.stringify(payload.snapshot),
        modifiedValue: payload.draft.action === 'corrected' && payload.draft.correctedValue.trim()
          ? JSON.stringify({ correctedValue: payload.draft.correctedValue.trim(), currentSnapshot: payload.snapshot })
          : undefined,
      });

      const pendingPayload = buildVoiceRecommendationFeedbackPayload({
        consultationId: input.consultationId.value,
        sessionId,
        patientId: input.patientId.value,
        patientName: input.patientName.value,
        targetType: registered.targetType || payload.fallbackTargetType,
        targetId: registered.targetId,
        recommendationType: registered.recommendationType || payload.fallbackRecommendationType,
        recommendationKey: payload.recommendationKey,
        recommendationTitle: payload.recommendationTitle,
        action: payload.draft.action,
        issueTags: payload.draft.issueTags,
        comment: payload.draft.comment.trim(),
        correctedValue: payload.draft.correctedValue.trim() || undefined,
        chiefComplaint: input.chiefComplaint.value,
        historyOfPresentIllness: input.historyOfPresentIllness.value,
        recommendationSnapshot: payload.snapshot,
        aiTrace: getLatestAiTrace(),
      });

      enqueueVoiceFeedbackPayload(pendingPayload);
      void submitVoicePendingPayloadToBackend(pendingPayload);
      const submittedAt = Date.now();
      const nextRevision = (payload.draft.revision || 0) + 1;
      updateRecommendationDraft(payload.recommendationKey, {
        ...payload.draft,
        submittedAt,
        revision: nextRevision,
      });
      recommendationSubmittedMap.value = {
        ...recommendationSubmittedMap.value,
        [payload.recommendationKey]: {
          actionLabel: getVoiceFeedbackActionLabel(payload.draft.action),
          submittedAt,
        },
      };
    } finally {
      recommendationSubmittingKey.value = null;
    }
  }

  async function submitRecordFieldFeedback(payload: {
    fieldKey: VoiceRecordFieldKey;
    draft: VoiceRecordFieldFeedbackDraft;
    originalValue: string;
    currentValue: string;
  }): Promise<void> {
    const sessionId = feedbackService.getCurrentSessionId();
    if (!sessionId) {
      throw new Error('当前没有可用的反馈会话');
    }

    const recordFieldKey = getVoiceRecordFieldFeedbackKey(payload.fieldKey);
    const diffSummary = buildVoiceRecordFieldDiffSummary(payload.originalValue, payload.currentValue);
    const correctedValue = payload.draft.action === 'corrected'
      ? (payload.draft.correctedValue.trim() || payload.currentValue.trim())
      : undefined;
    const modifiedValue = diffSummary.changed || correctedValue
      ? JSON.stringify({
          currentValue: payload.currentValue,
          correctedValue: correctedValue || null,
          modifiedByDoctor: diffSummary.changed,
          diffSummary,
        })
      : undefined;

    recordFieldSubmittingKey.value = recordFieldKey;
    try {
      const reason = buildVoiceFeedbackReason(payload.draft.issueTags, payload.draft.comment);
      await feedbackService.saveFeedback({
        sessionId,
        targetType: 'record',
        targetId: `${input.consultationId.value}:${payload.fieldKey}`,
        feedbackType: mapActionToFeedbackType(payload.draft.action),
        reason: reason || undefined,
        originalValue: JSON.stringify({
          fieldKey: payload.fieldKey,
          fieldLabel: getVoiceRecordFieldLabel(payload.fieldKey),
          value: payload.originalValue,
        }),
        modifiedValue,
      });

      const pendingPayload = buildVoiceRecordFieldFeedbackPayload({
        consultationId: input.consultationId.value,
        sessionId,
        patientId: input.patientId.value,
        patientName: input.patientName.value,
        fieldKey: payload.fieldKey,
        action: payload.draft.action,
        issueTags: payload.draft.issueTags,
        comment: payload.draft.comment.trim(),
        correctedValue,
        originalValue: payload.originalValue,
        currentValue: payload.currentValue,
        chiefComplaint: input.chiefComplaint.value,
        historyOfPresentIllness: input.historyOfPresentIllness.value,
        pastMedicalHistory: input.pastMedicalHistory.value,
        familyHistory: input.familyHistory.value,
        aiTrace: getLatestAiTrace(),
      });

      enqueueVoiceFeedbackPayload(pendingPayload);
      void submitVoicePendingPayloadToBackend(pendingPayload);
      const submittedAt = Date.now();
      const nextRevision = (payload.draft.revision || 0) + 1;
      updateRecordFieldDraft(payload.fieldKey, {
        ...payload.draft,
        submittedAt,
        revision: nextRevision,
      });
      recordFieldSubmittedMap.value = {
        ...recordFieldSubmittedMap.value,
        [recordFieldKey]: {
          actionLabel: getVoiceFeedbackActionLabel(payload.draft.action),
          submittedAt,
        },
      };
    } finally {
      recordFieldSubmittingKey.value = null;
    }
  }

  async function submitSessionFeedback(payload: {
    diagnoses: Diagnosis[];
    selectedTreatments: TreatmentRecommendation[];
  }): Promise<void> {
    const sessionId = feedbackService.getCurrentSessionId();
    if (!sessionId) {
      throw new Error('当前没有可用的反馈会话');
    }

    sessionSubmitting.value = true;
    try {
      const reason = buildVoiceFeedbackReason(sessionDraft.value.issueTags, sessionDraft.value.comment);
      await feedbackService.saveFeedback({
        sessionId,
        targetType: 'record',
        targetId: input.consultationId.value,
        feedbackType: sessionDraft.value.rating >= 4 ? 'positive' : 'negative',
        rating: sessionDraft.value.rating,
        reason: reason || undefined,
      });

      const pendingPayload = buildVoiceSessionFeedbackPayload({
        consultationId: input.consultationId.value,
        sessionId,
        patientId: input.patientId.value,
        patientName: input.patientName.value,
        rating: sessionDraft.value.rating,
        issueTags: sessionDraft.value.issueTags,
        comment: sessionDraft.value.comment.trim(),
        chiefComplaint: input.chiefComplaint.value,
        historyOfPresentIllness: input.historyOfPresentIllness.value,
        diagnosisNames: payload.diagnoses.map((item) => item.name).filter(Boolean),
        selectedTreatmentNames: payload.selectedTreatments.map((item) => item.name).filter(Boolean),
        aiTrace: getLatestAiTrace(),
      });

      enqueueVoiceFeedbackPayload(pendingPayload);
      void submitVoicePendingPayloadToBackend(pendingPayload);
      sessionDraft.value = {
        ...sessionDraft.value,
        submittedAt: Date.now(),
        revision: (sessionDraft.value.revision || 0) + 1,
      };
      persistDraft();
      sessionSubmittedAt.value = sessionDraft.value.submittedAt || null;
    } finally {
      sessionSubmitting.value = false;
    }
  }

  watch(() => input.consultationId.value, () => {
    restoreVoiceFeedbackDraft();
  }, { immediate: true });

  return {
    recommendationDrafts,
    recordFieldDrafts,
    sessionDraft,
    recommendationSubmittingKey,
    recordFieldSubmittingKey,
    sessionSubmitting,
    recommendationSubmittedMap,
    recordFieldSubmittedMap,
    sessionSubmittedAt,
    ensureRecommendationDraft,
    ensureRecordFieldDraft,
    updateRecommendationDraft,
    updateRecordFieldDraft,
    updateSessionDraft,
    registerRecommendations,
    registerExternalRecommendationTarget,
    submitRecommendationFeedback,
    submitRecordFieldFeedback,
    submitSessionFeedback,
    restoreVoiceFeedbackDraft,
    clearVoiceFeedbackDraft,
  };
}
