<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { PatientHeader } from '@entities/patient';
import Icon from '@shared/ui/Icon.vue';
import { chat } from '../services/llm';
import { PROMPTS } from '../prompts';
import { getHisAdapter } from '../services/his';
import { medicalDataService, type DiagnosisItem } from '../services/medicalData';
import { useVoiceFeedback } from '@features/feedback';
import {
  checkDiagnosis,
  checkMedicine,
  checkExamination,
  isReviewerEnabled,
} from '../services/factChecker';
import { getVoiceRecordFieldLabel } from '../services/voiceFeedback';
import {
  buildConsultationUserLogSnapshot,
  submitConsultationUserLog,
} from '../services/consultationUserLog';
import {
  applyRecommendationPreferenceRanking,
  buildDiagnosisPreferenceCandidate,
  buildTreatmentPreferenceCandidate,
  trackFinalRecommendationPreferences,
  trackTreatmentMatchPreference,
} from '../services/recommendationPreferenceTracker';
import type { TreatmentRecommendation, Diagnosis } from '../types/consultation';
import type { AppPatient } from '../types/appState';
import type { VoiceIntentResult, MatchedTreatment, MatchedDiagnosis } from '@features/voice-consultation';
import {
  alignMedicineRecommendationsToInventory,
  applyManualMatchCandidate,
  assessTreatmentCatalogMatch,
  buildClinicalResultDiagnosisRequestSpec,
  buildDiagnosisRationale as buildSharedDiagnosisRationale,
  buildClinicalResultTreatmentRequestSpecs,
  buildInventoryBlockedSubmitMessage,
  buildRecordConfirmedPayload,
  buildSelectedTreatments,
  buildTreatmentPlanSummary,
  buildTreatmentReason as buildSharedTreatmentReason,
  findManualMatchCandidates,
  findUsageOptionByValue,
  getDiagnosisRecommendationFeedbackKey,
  getMatchedItemRaw,
  getMedicineCollapsedSummary as getSharedMedicineCollapsedSummary,
  getMedicineFieldDisplay as getSharedMedicineFieldDisplay,
  getReasonTooltipKey,
  getStandardDiagnosisId,
  getStandardDiagnosisKey,
  getSuggestedMatchName,
  getTreatmentEditorFieldKey,
  getTreatmentEditorKey,
  getTreatmentMatchLabel as getSharedTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentRecommendationFeedbackKey,
  getTreatmentSpec,
  hasProbableMatch,
  initClinicalDiagnoses,
  loadAvailableMedicineInventoryContext,
  initClinicalTreatments,
  mapClinicalResultAiDiagnoses,
  mergeClinicalResultAiTreatmentResponses,
  parseLLMJson,
  shouldAutoSelectTreatment,
  syncTreatmentExecDeptSelections as syncSharedTreatmentExecDeptSelections,
  toManualMatchCandidateView,
  type ClinicalResultInput,
  type ClinicalResultChannel,
  type ClinicalResultRecordSummaryInput,
  type MedicinePrimaryField,
  type ManualMatchRawCandidate,
} from '@features/clinical-result';
import {
  type UsageOption,
} from '../utils/medicalDictionaryHelpers';
import {
  inferFrequencyFromText as inferFrequencyFromTextPure,
  inferRouteFromText as inferRouteFromTextPure,
} from '../utils/treatmentInference';
import { useOutsideInteraction } from '@shared/composables/useOutsideInteraction';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import {
  VoiceRecordFieldEditor,
  VoiceSessionFeedbackBar,
  getVoiceConsultationEditorSnapshot,
  updateVoiceConsultationCache,
  useVoiceEditorSnapshotPersistence,
  useVoiceFeedbackActions,
  useVoiceRecordFieldFeedbackState,
  useVoiceResultFactCheckState,
  type VoiceEditorSnapshot,
} from '@features/voice-consultation';
import {
  DiagnosisRecommendationCard,
  TreatmentRecommendationSection,
  useBodySiteOptions,
  useClinicalResultCancelController,
  useClinicalResultChannelStrategy,
  useClinicalResultDiagnosisChecklist,
  useClinicalResultIntentReset,
  useClinicalResultPatientContext,
  useClinicalResultWritebackPayload,
  useClinicalResultWritebackPreflight,
  useConsultationReferenceFeedbackListener,
  useClinicalResultUserLogController,
  useDiagnosisSelection,
  useManualMatchState,
  useMedicalDictionaries,
  useMedicineFieldEditing,
  useMedicineUsageSearch,
  useReasonTooltipState,
  useRecommendationFeedbackPopover,
  useRelatedDiagnosisDropdown,
  useSecondarySelector,
  useTreatmentAttributeSearch,
  useTreatmentGates,
  useTreatmentEditorState,
  useTreatmentHydration,
  useTreatmentNormalization,
  useTreatmentPharmacyResolution,
  useTreatmentQuickSelector,
  useTreatmentSelectionReadiness,
  useTreatmentSections,
  useWritebackFeedbackController,
  useWritebackStatus,
  type ManualMatchCandidate,
  type SecondarySelectorField,
  type WritebackFeedbackPayload,
} from '@features/consultation-result';
import type {
  VoiceRecommendationFeedbackDraft,
  VoiceSessionFeedbackDraft,
} from '../types/voiceFeedback';

type ReferenceFeedbackPayload = WritebackFeedbackPayload;
type TreatmentAttributeOption = Pick<UsageOption, 'key' | 'text'> & Partial<Pick<UsageOption, 'mcode'>>;

const props = withDefaults(defineProps<{
  initialPatientData?: AppPatient;
  intentResult: ClinicalResultInput | VoiceIntentResult | null;
  channel?: ClinicalResultChannel;
  showPatientHeader?: boolean;
  /**
   * intentResult 的来源。
   * - 'llm'：本次 LLM 刚刚解析出的全新结果，不叠加 editorSnapshot
   * - 'cache'：从同就诊缓存恢复，需叠加 editorSnapshot 还原现场
   * - null/undefined：未明确，默认不叠加
   */
  intentSource?: 'llm' | 'cache' | null;
  /**
   * 当前语音问诊轮次 ID。
   * 由 useVoiceConsultation 在 handleVoiceStop 时生成，
   * 贯穿该轮所有用户日志提交（speech → firstSnapshot → finalSnapshot/abandoned）。
   */
  consultationRoundId?: string | null;
  secondaryFooterActionText?: string;
  secondaryFooterActionDisabled?: boolean;
}>(), {
  channel: 'voice',
  showPatientHeader: true,
  intentSource: null,
  consultationRoundId: null,
  secondaryFooterActionText: '',
  secondaryFooterActionDisabled: false,
});

const emit = defineEmits(['close', 'cancel', 'secondary-footer-action']);

const showToast = inject<(msg: string, type?: string) => void>('showToast');
const recommendationPolicy = computed(() => props.intentResult?.recommendationPolicy);
const allowTreatmentRefresh = computed(() => recommendationPolicy.value?.allowTreatmentRefresh !== false);
const autoFetchTreatments = computed(() => recommendationPolicy.value?.autoFetchTreatments !== false);

const chiefComplaint = ref('');
const historyOfPresentIllness = ref('');
const pastMedicalHistory = ref('');
const personalHistory = ref('');
const familyHistory = ref('');
const physicalExam = ref('');
const precautions = ref('');

const aiDiagnoses = ref<Diagnosis[]>([]);
const diagnosisSelection = useDiagnosisSelection({ diagnoses: aiDiagnoses });
const {
  selectedDiagnosis,
  selectedDiagnoses,
  getDiagnosisIdentity,
  isDiagnosisSelected,
  isPrimaryDiagnosis,
  replaceDiagnosisSelection,
  resetDiagnosisSelection,
  toggleDiagnosis: toggleDiagnosisSelection,
  setPrimaryDiagnosis: setPrimaryDiagnosisSelection,
  removeDiagnosis: removeDiagnosisSelection,
  replaceDiagnosisInSelection,
} = diagnosisSelection;
const diagnosisLoading = ref(false);
const diagnosisRequestSeq = ref(0);

const treatments = ref<TreatmentRecommendation[]>([]);
const treatmentLoading = ref(false);
const treatmentRequestSeq = ref(0);
const autoTreatmentFetchAttemptKey = ref('');

const lastAppliedIntentKey = ref('');

const submitting = ref(false);
const writebackStatus = useWritebackStatus({
  isSubmitting: () => submitting.value,
});
const {
  waitingWritebackFeedback,
  isWritebackBusy,
  submitButtonText,
  writebackBannerTone,
  writebackBannerText,
  clearLastFeedback,
  resetWritebackState,
  markWritebackPending,
  applyWritebackFeedback: applyWritebackFeedbackStatus,
} = writebackStatus;
const channelStrategy = useClinicalResultChannelStrategy({
  channel: () => props.channel,
  showPatientHeader: () => props.showPatientHeader,
});
const {
  channel: resultChannel,
  userLogType: consultationUserLogType,
  shouldUseVoiceCache,
  shouldShowPatientHeader,
  cancelDialogTitle,
  cancelDialogText,
  diagnosisChecklistTraceContext,
  buildPreferenceContext: buildChannelPreferenceContext,
} = channelStrategy;

const diagnosisChecklist = useClinicalResultDiagnosisChecklist({
  getChiefComplaint: () => chiefComplaint.value,
  getHistoryOfPresentIllness: () => historyOfPresentIllness.value,
  request: async ({ diagnosisName, chiefComplaint: complaint, historyOfPresentIllness: history }) => {
    const userPrompt = PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
      diagnosisName,
      chiefComplaint: complaint,
      historyOfPresentIllness: history,
    });
    return chat([
      { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
      { role: 'user', content: userPrompt },
    ], undefined, undefined, undefined, {
      traceContext: {
        ...diagnosisChecklistTraceContext.value,
        consultationId: resolveConsultationId(),
      },
    });
  },
  formatError: (error) => formatUserFacingError(error, {
    context: '诊断鉴别生成失败',
    fallback: '请稍后重试。',
  }),
  notify: showToast,
});
const {
  activeChecklistDiagnosis,
  checklistGenerationError,
  checklistItems,
  isChecklistLoading,
  showChecklistModal,
  closeChecklistModal,
  openDiagnosisChecklist,
} = diagnosisChecklist;

const patientContext = useClinicalResultPatientContext({
  patient: computed(() => props.initialPatientData),
});
const {
  consultationId,
  patientAge,
  patientAnchorId,
  patientGender,
  patientName,
  patientTetId,
} = patientContext;

const lastTreatmentDiagnosisKey = ref('');
const suppressDiagnosisTreatmentRefetch = ref(false);
const canRefreshDiagnosis = computed(() => (
  chiefComplaint.value.trim().length > 0
  || historyOfPresentIllness.value.trim().length > 0
));
const selectedTreatments = computed(() => buildSelectedTreatments({ items: treatments.value }));
const treatmentRefreshNeeded = computed(() => {
  const currentIdentity = getDiagnosisIdentity(selectedDiagnosis.value);
  if (!currentIdentity || suppressDiagnosisTreatmentRefetch.value) {
    return false;
  }
  // 没有已加载的治疗方案时不显示"保留上一版"提示
  if (treatments.value.length === 0) {
    return false;
  }
  return currentIdentity !== lastTreatmentDiagnosisKey.value;
});
const treatmentSectionState = useTreatmentSections({
  treatments,
  selectedDiagnosis,
  isRefreshNeeded: treatmentRefreshNeeded,
  getLastTreatmentDiagnosisKey: () => lastTreatmentDiagnosisKey.value,
});
const {
  hasTreatments,
  treatmentEmptyText,
  treatmentSections,
} = treatmentSectionState;
const displayedTreatmentEmptyText = computed(() => (
  allowTreatmentRefresh.value
    ? treatmentEmptyText.value
    : (props.intentResult?.treatmentPlan || '当前有效库存中没有可直接续方的历史药品，请医生核实后手工调整。')
));

// 库存校验状态 / 药品详情 hydrate / 库存检查均迁移到共享 `useTreatmentHydration`，
// 实例化在 `treatmentNormalization` 之后（依赖 pharmacyOptions / treatmentGates / 字典查找函数）。
// 这里仅保留对外暴露的解构变量名（hydration.* -> 同名函数），call site 不变。

const getPatientAnchorId = (): string => patientAnchorId.value;
const resolveConsultationId = (): string => consultationId.value;

function buildPreferenceContext(sceneSuffix: string) {
  return buildChannelPreferenceContext(resolveConsultationId(), sceneSuffix);
}

// ---- 编辑器快照（用于跨会话恢复全部病历，避免重新调 fetchAITreatment） ----

const editorSnapshotPersistence = useVoiceEditorSnapshotPersistence({
  getPatient: () => props.initialPatientData,
  shouldPersist: () => shouldUseVoiceCache.value && !suppressDiagnosisTreatmentRefetch.value,
  getSnapshot: () => ({
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
    pastMedicalHistory: pastMedicalHistory.value,
    personalHistory: personalHistory.value,
    familyHistory: familyHistory.value,
    physicalExam: physicalExam.value,
    precautions: precautions.value,
    treatments: treatments.value as unknown[],
    diagnoses: aiDiagnoses.value as unknown[],
    selectedDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
    treatmentDiagnosisKey: lastTreatmentDiagnosisKey.value,
  }),
  persist: updateVoiceConsultationCache,
});
const {
  clearPendingSnapshotPersist,
  persistEditorSnapshotImmediate,
  schedulePersistEditorSnapshot,
} = editorSnapshotPersistence;

/**
 * 从缓存快照恢复编辑器状态。覆盖 LLM intentResult 已写入的初值。
 *
 * 注意：调用方必须在 `suppressDiagnosisTreatmentRefetch.value === true` 时段调用，
 * 否则诊断/治疗的副作用 watcher 会把 treatments 清空再重拉。
 */
async function applyEditorSnapshot(snapshot: VoiceEditorSnapshot): Promise<void> {
  if (typeof snapshot.chiefComplaint === 'string') {
    chiefComplaint.value = snapshot.chiefComplaint;
  }
  if (typeof snapshot.historyOfPresentIllness === 'string') {
    historyOfPresentIllness.value = snapshot.historyOfPresentIllness;
  }
  if (typeof snapshot.pastMedicalHistory === 'string') {
    pastMedicalHistory.value = snapshot.pastMedicalHistory;
  }
  if (typeof snapshot.personalHistory === 'string') {
    personalHistory.value = snapshot.personalHistory;
  }
  if (typeof snapshot.familyHistory === 'string') {
    familyHistory.value = snapshot.familyHistory;
  }
  if (typeof snapshot.physicalExam === 'string') {
    physicalExam.value = snapshot.physicalExam;
  }
  if (typeof snapshot.precautions === 'string') {
    precautions.value = snapshot.precautions;
  }
  if (Array.isArray(snapshot.diagnoses) && snapshot.diagnoses.length > 0) {
    aiDiagnoses.value = snapshot.diagnoses as Diagnosis[];
    const matchedKey = snapshot.selectedDiagnosisIdentity;
    const target = matchedKey
      ? aiDiagnoses.value.find((diag) => getDiagnosisIdentity(diag) === matchedKey)
      : null;
    const fallback = aiDiagnoses.value.find((diag) => diag.id || diag.code) || aiDiagnoses.value[0] || null;
    const chosen = target || fallback;
    replaceDiagnosisSelection(chosen ? [chosen] : aiDiagnoses.value.slice(0, 1), chosen);
  }
  if (Array.isArray(snapshot.treatments) && snapshot.treatments.length > 0) {
    await fetchPharmacyOptions();
    treatments.value = snapshot.treatments as TreatmentRecommendation[];
    normalizeMedicinePharmacyValues(treatments.value);
    lastTreatmentDiagnosisKey.value =
      snapshot.treatmentDiagnosisKey || getDiagnosisIdentity(selectedDiagnosis.value);
    await reconcileAutoSelectedMedicineInventory(treatments.value);
    void registerCurrentRecommendations();
    console.info('[VoiceConsultationNew] Applied editor snapshot from cache', {
      treatmentCount: treatments.value.length,
      diagnosisIdentity: lastTreatmentDiagnosisKey.value,
    });
  }
}

const canSubmit = computed(() => chiefComplaint.value.trim().length > 0 && selectedDiagnosis.value !== null && selectedDiagnoses.value.length > 0 && !isWritebackBusy.value);

async function handleCancelConfirmed(): Promise<void> {
  clearVoiceFeedbackDraft();
  await submitVoiceAbandonedUserLog();
  emit('cancel');
}
const cancelController = useClinicalResultCancelController({
  isSubmitting: () => submitting.value,
  isWaitingWritebackFeedback: () => waitingWritebackFeedback.value,
  notify: showToast,
  onConfirm: handleCancelConfirmed,
});
const {
  showCancelConfirm,
  handleCancelClick,
  closeCancelConfirm,
  confirmCancel,
} = cancelController;

const reasonTooltipState = useReasonTooltipState();
const {
  activeReasonTooltipKey,
  closeReasonTooltip,
  closeReasonTooltipIfOpen,
  toggleReasonTooltip,
} = reasonTooltipState;
const manualMatchState = useManualMatchState();
const {
  getManualMatchKeyword,
  setManualMatchKeyword,
  isManualMatchOpen,
  openManualMatch,
  closeManualMatch,
  toggleManualMatch: toggleManualMatchState,
} = manualMatchState;
const treatmentEditorState = useTreatmentEditorState({
  getEditorKey: (rec) => getTreatmentEditorKey(rec),
  getFieldKey: (rec, field) => getEditableFieldKey(rec, field as MedicinePrimaryField),
  resetDependents: () => {
    medicineUsageSearch.resetAll();
    secondarySelector.resetAll();
  },
});
const {
  resetTreatmentEditorState,
  isTreatmentEditorExpanded,
  toggleTreatmentEditor,
  expandTreatmentEditor,
  collapseTreatmentEditor,
  shouldShowTreatmentEditor,
  registerEditableFieldElement,
  isEditableFieldActive,
  setActiveEditableField,
  clearActiveEditableField,
  focusActiveEditableField,
} = treatmentEditorState;
const treatmentQuickSelector = useTreatmentQuickSelector({
  expandTreatmentEditor,
  openSecondarySelector: (rec, field) => secondarySelector.open(rec, field),
  getEditorKey: getTreatmentEditorKey,
});
const {
  openQuickSelector,
} = treatmentQuickSelector;
const showSessionFeedbackDialog = ref(false);
const {
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
  submitRecommendationFeedback,
  submitRecordFieldFeedback,
  submitSessionFeedback,
  clearVoiceFeedbackDraft,
} = useVoiceFeedback({
  consultationId,
  patientId: computed(() => getPatientAnchorId()),
  patientName,
  chiefComplaint,
  historyOfPresentIllness,
  pastMedicalHistory,
  personalHistory,
  familyHistory,
  physicalExam,
  precautions,
});
const recordFieldFeedbackState = useVoiceRecordFieldFeedbackState({
  fields: {
    chiefComplaint,
    historyOfPresentIllness,
    pastMedicalHistory,
    personalHistory,
    familyHistory,
    physicalExam,
    precautions,
  },
  ensureDraft: ensureRecordFieldDraft,
  submittedMap: recordFieldSubmittedMap,
});
const {
  initialRecordSnapshot,
  getRecordFieldDraft,
  getRecordFieldFeedbackKey,
  getRecordFieldOriginalValue,
  getRecordFieldSubmittedLabel,
  getRecordFieldValue,
  isRecordFieldModified,
  setInitialRecordSnapshot,
} = recordFieldFeedbackState;
const recommendationFeedbackPopover = useRecommendationFeedbackPopover({
  ensureDraft: ensureRecommendationDraft,
  submittedMap: recommendationSubmittedMap,
});

async function registerCurrentRecommendations(): Promise<void> {
  try {
    await registerRecommendations({
      diagnoses: aiDiagnoses.value,
      treatments: treatments.value,
      selectedDiagnosis: selectedDiagnosis.value,
    });
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to register voice recommendations for feedback', error);
  }
}

function getDiagnosisFeedbackKey(diag: Diagnosis): string {
  return getDiagnosisRecommendationFeedbackKey(diag);
}

function getTreatmentFeedbackKey(rec: TreatmentRecommendation): string {
  return getTreatmentRecommendationFeedbackKey(rec);
}

function getTreatmentReasonKey(rec: TreatmentRecommendation): string {
  return getReasonTooltipKey('treatment', rec.type, rec.name);
}

function getTreatmentFeedbackDraft(rec: TreatmentRecommendation): VoiceRecommendationFeedbackDraft {
  return getRecommendationDraft(getTreatmentFeedbackKey(rec));
}

function isTreatmentFeedbackOpen(rec: TreatmentRecommendation): boolean {
  return isRecommendationFeedbackOpen(getTreatmentFeedbackKey(rec));
}

function isTreatmentFeedbackSubmitting(rec: TreatmentRecommendation): boolean {
  return recommendationSubmittingKey.value === getTreatmentFeedbackKey(rec);
}

function getTreatmentFeedbackSubmittedLabel(rec: TreatmentRecommendation): string {
  return getRecommendationSubmittedLabel(getTreatmentFeedbackKey(rec));
}

function getTreatmentIssue(rec: TreatmentRecommendation) {
  return getIssueForTreatment(rec.name);
}

function shouldShowTreatmentEditorToggle(rec: TreatmentRecommendation): boolean {
  return !!rec.selected;
}

function getRecommendationDraft(recommendationKey: string): VoiceRecommendationFeedbackDraft {
  return recommendationFeedbackPopover.getDraft(recommendationKey);
}

function getSessionFeedbackDraft(): VoiceSessionFeedbackDraft {
  return sessionDraft.value;
}

function getRecommendationSubmittedLabel(recommendationKey: string): string {
  return recommendationFeedbackPopover.getSubmittedLabel(recommendationKey);
}

function isRecommendationFeedbackOpen(recommendationKey: string): boolean {
  return recommendationFeedbackPopover.isOpen(recommendationKey);
}

function toggleRecommendationFeedback(recommendationKey: string, event?: Event): void {
  recommendationFeedbackPopover.toggle(recommendationKey, event);
}

function buildVoiceUserLogSnapshot() {
  return buildConsultationUserLogSnapshot({
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
    diagnoses: aiDiagnoses.value,
    selectedDiagnosis: selectedDiagnosis.value,
    treatments: treatments.value,
  });
}

const userLogController = useClinicalResultUserLogController({
  consultationId,
  consultationRoundId: () => props.consultationRoundId,
  consultationType: consultationUserLogType,
  patient: () => props.initialPatientData || null,
  buildSnapshot: buildVoiceUserLogSnapshot,
  submit: submitConsultationUserLog,
  getChangeFlags: () => ({
    pastMedicalHistoryChanged: isRecordFieldModified('pastMedicalHistory'),
    personalHistoryChanged: isRecordFieldModified('personalHistory'),
    familyHistoryChanged: isRecordFieldModified('familyHistory'),
    physicalExamChanged: isRecordFieldModified('physicalExam'),
    precautionsChanged: isRecordFieldModified('precautions'),
  }),
});
const {
  resetFirstSnapshot: resetFirstUserLogSnapshot,
  submitGeneratedUserLog: submitVoiceGeneratedUserLog,
  submitFinalUserLog: submitVoiceFinalUserLog,
  submitAbandonedUserLog: submitVoiceAbandonedUserLog,
} = userLogController;

const {
  completeVoiceConsultationFlow,
  handleDiagnosisFeedbackSubmit,
  handleRecordFieldFeedbackSubmit,
  handleSessionFeedbackSubmit,
  handleTreatmentFeedbackSubmit,
} = useVoiceFeedbackActions({
  isDiagnosisSelected,
  isPrimaryDiagnosis,
  submitRecommendationFeedback,
  submitRecordFieldFeedback,
  submitSessionFeedback,
  getRecordFieldOriginalValue,
  getRecordFieldValue,
  getRecordFieldLabel: getVoiceRecordFieldLabel,
  getSelectedDiagnoses: () => selectedDiagnoses.value,
  getSelectedTreatments: () => selectedTreatments.value,
  closeRecommendationFeedback: () => {
    recommendationFeedbackPopover.close();
  },
  closeSessionFeedback: () => {
    showSessionFeedbackDialog.value = false;
  },
  clearVoiceFeedbackDraft,
  clearWritebackFeedback: clearLastFeedback,
  closeResult: () => {
    emit('close');
  },
  notify: showToast,
});

const writebackFeedbackController = useWritebackFeedbackController({
  applyFeedback: applyWritebackFeedbackStatus,
  notify: showToast,
  onSuccess: (payload) => {
    showSessionFeedbackDialog.value = true;
    console.info('[VoiceConsultationNew] Show session feedback dialog after writeback success', {
      requestId: payload.requestId,
      consultationId: payload.consultationId,
    });
    persistEditorSnapshotImmediate();
    submitVoiceFinalUserLog();
  },
});
const {
  applyWritebackFeedback,
} = writebackFeedbackController;

function getCurrentRecordSummaryInput(): ClinicalResultRecordSummaryInput {
  return {
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
  };
}

function buildDiagnosisRationale(matchedDiagnosis: MatchedDiagnosis, displayName: string): string {
  return buildSharedDiagnosisRationale(matchedDiagnosis, displayName, getCurrentRecordSummaryInput());
}

function buildTreatmentReason(item: MatchedTreatment, name: string): string {
  return buildSharedTreatmentReason(item, name, getCurrentRecordSummaryInput());
}

function getEditableFieldKey(rec: TreatmentRecommendation, field: MedicinePrimaryField): string {
  return getTreatmentEditorFieldKey(rec, field);
}

// 频次/给药途径推断需要使用 reactive 字典选项，封装为本地包装函数
function inferFrequencyFromText(text: string): string {
  return inferFrequencyFromTextPure(text, frequencyOptions.value);
}

function inferRouteFromText(text: string): string {
  return inferRouteFromTextPure(text, routeOptions.value);
}

// 治疗项归一化：薄包装委托给 useTreatmentNormalization composable，
// composable 实例（treatmentNormalization）在 useMedicalDictionaries 之后初始化。
// 函数声明会被 hoist，调用时机均晚于 composable 实例化，所以引用安全。
function normalizeTreatmentRecommendation(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return treatmentNormalization.normalize(rec);
}

function initDiagnosesFromIntent(matched: MatchedDiagnosis[]): Diagnosis[] {
  return initClinicalDiagnoses(matched, {
    buildRationale: buildDiagnosisRationale,
  });
}

function initTreatmentsFromIntent(matched: MatchedTreatment[]): TreatmentRecommendation[] {
  return initClinicalTreatments(matched, {
    assessCatalogMatch: assessTreatmentCatalogMatch,
    inferFrequency: inferFrequencyFromText,
    inferRoute: inferRouteFromText,
    normalize: normalizeTreatmentRecommendation,
    buildReason: buildTreatmentReason,
    shouldAutoSelect: shouldAutoSelectTreatment,
  });
}

function normalizeIntentKeyPart(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function invalidateTreatmentRequests(): void {
  treatmentRequestSeq.value += 1;
  treatmentLoading.value = false;
}

function buildTreatmentAutoFetchKey(diagnosisIdentity: string): string {
  return `${patientAnchorId.value || 'unknown'}|${diagnosisIdentity}`;
}

function buildIntentDiagnosisKey(item: ClinicalResultInput['diagnoses'][number]): string {
  const inherited = item as Partial<Diagnosis>;
  const matched = item.matchedItem;
  return [
    matched?.id,
    matched?.code,
    matched?.name,
    inherited.id,
    item.code,
    item.name,
    inherited.rate,
    item.confidence,
  ].map(normalizeIntentKeyPart).join('~');
}

function buildIntentTreatmentKey(item: ClinicalResultInput['treatments'][number]): string {
  const inherited = item as Partial<TreatmentRecommendation>;
  const matched = inherited.matchedItem || item.matchedItem;
  const suggested = inherited.suggestedMatchItem;
  return [
    item.type,
    item.name,
    inherited.originalName,
    matched?.id,
    matched?.name,
    matched?.spec,
    suggested?.id,
    suggested?.name,
    inherited.matchStatus,
    inherited.selected,
    inherited.manualMatched,
    item.spec,
    item.frequency,
    item.frequencyKey,
    item.usage,
    item.usageKey,
    item.dosage,
    item.dosageUnit,
    item.totalQty,
    item.totalUnit,
    item.days,
    inherited.pharmacy,
    inherited.pharmacyCleared,
    inherited.execDept,
    inherited.execDeptCleared,
    inherited.insuranceType,
    inherited.insuranceCleared,
    inherited.bodySite,
    inherited.bodySiteId,
  ].map(normalizeIntentKeyPart).join('~');
}

function buildIntentResultKey(result: ClinicalResultInput | VoiceIntentResult): string {
  return JSON.stringify({
    channel: resultChannel.value,
    source: props.intentSource || '',
    patient: patientAnchorId.value,
    record: {
      chiefComplaint: normalizeIntentKeyPart(result.chiefComplaint),
      historyOfPresentIllness: normalizeIntentKeyPart(result.historyOfPresentIllness),
      pastMedicalHistory: normalizeIntentKeyPart(result.pastMedicalHistory),
      personalHistory: normalizeIntentKeyPart(result.outpatientRecord?.personalHistory),
      familyHistory: normalizeIntentKeyPart(result.outpatientRecord?.familyHistory || result.familyHistory),
      physicalExam: normalizeIntentKeyPart(result.outpatientRecord?.physicalExam),
      precautions: normalizeIntentKeyPart(result.outpatientRecord?.precautions),
    },
    diagnoses: result.diagnoses.map(buildIntentDiagnosisKey),
    treatments: result.treatments.map(buildIntentTreatmentKey),
    recommendationPolicy: result.recommendationPolicy,
  });
}

function getAllowedIntentTreatments(result: ClinicalResultInput): ClinicalResultInput['treatments'] {
  const allowed = result.recommendationPolicy?.allowedTreatmentTypes;
  if (!allowed?.length) return result.treatments;
  return result.treatments.filter((item) => allowed.includes(item.type));
}

function getManualMatchPickerCandidates(rec: TreatmentRecommendation): ManualMatchCandidate[] {
  return getManualMatchCandidates(rec).map(toManualMatchCandidateView);
}

function handleManualMatchPickerSelect(rec: TreatmentRecommendation, candidate: ManualMatchCandidate): void {
  const raw = getManualMatchCandidates(rec).find((item) => item.id === candidate.id);
  if (!raw) {
    return;
  }
  void applyManualMatch(rec, raw);
}

function requiresManualMatchBeforeSelect(rec: TreatmentRecommendation): boolean {
  return !rec.matchedItem;
}

function toggleManualMatch(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  closeReasonTooltipIfOpen();
  toggleManualMatchState(rec);
}

function getManualMatchCandidates(rec: TreatmentRecommendation): ManualMatchRawCandidate[] {
  return findManualMatchCandidates(rec, getManualMatchKeyword(rec));
}

// 部位选项落地：来自 HIS `fetchMedicalItemPartOptions(idCli)`，统一在 useBodySiteOptions 内处理。
const { applyMedicalItemPartOption, applyMedicalItemPartOptions } = useBodySiteOptions();

// 药品 / 非药品明细 hydrate 已抽到 useTreatmentHydration；
// 语音侧通过 applyMedicalItemPartOptions / afterMedicalItemHydrated 注入检查部位与执行科室同步副作用。

async function confirmSuggestedMatch(rec: TreatmentRecommendation, event?: Event): Promise<void> {
  event?.stopPropagation();
  if (!rec.suggestedMatchItem) {
    return;
  }

  rec.originalName = rec.originalName || rec.name;
  rec.matchedItem = { ...rec.suggestedMatchItem };
  rec.name = rec.suggestedMatchItem.name || rec.name;
  rec.matchStatus = 'confirmed';
  rec.manualMatched = false;
  rec.selected = false;
  rec.pharmacyCleared = false;
  rec.execDeptCleared = false;
  rec.insuranceCleared = false;
  rec.suggestedMatchItem = undefined;

  if (!(await ensureTreatmentSelectable(rec, {
    medicineUnavailableMessage: `${rec.name} 已确认匹配，但当前药房无药品详情，暂不能选中`,
  }))) {
    return;
  }

  rec.selected = true;
  trackTreatmentMatchPreference(rec, 'confirm_match', buildPreferenceContext('treatment'));

  showToast?.(`${rec.name} 已确认匹配`, 'success');
}

async function applyManualMatch(rec: TreatmentRecommendation, candidate: ManualMatchRawCandidate, event?: Event): Promise<void> {
  event?.stopPropagation();

  if (!applyManualMatchCandidate(rec, candidate)) {
    return;
  }
  rec.pharmacyCleared = false;
  rec.execDeptCleared = false;
  rec.insuranceCleared = false;

  if (!(await ensureTreatmentSelectable(rec, {
    labelName: candidate.name,
    medicineUnavailableMessage: `${candidate.name} 已完成标准库匹配，但当前药房无药品详情，暂不能选中`,
  }))) {
    return;
  }

  rec.selected = true;
  trackTreatmentMatchPreference(rec, 'manual_match', buildPreferenceContext('treatment'));
  closeManualMatch();
  showToast?.(`${candidate.name} 已完成标准库匹配`, 'success');
}

async function toggleTreatment(item: TreatmentRecommendation): Promise<void> {
  closeReasonTooltipIfOpen();
  if (!item.selected && requiresManualMatchBeforeSelect(item)) {
    if (hasProbableMatch(item)) {
      showToast?.('该推荐存在候选标准项，请先确认匹配或改为手动匹配', 'warning');
      return;
    }
    openManualMatch(item);
    showToast?.('该推荐尚未匹配标准库，请先手动匹配', 'warning');
    return;
  }
  const nextSelected = !item.selected;

  if (nextSelected && !(await ensureTreatmentSelectable(item, {
    showMedicineUnavailableWarning: true,
    pharmacyMissingMessage: '当前发药药房不可用，请选择实际拥有该药品的药房后再选中',
    execDeptMissingMessage: '请先设置执行科室后再选中该项目',
    bodySiteMissingMessage: '请先设置检查部位后再选中该项目',
    hydrateNonMedicine: item.type !== 'medicine',
  }))) {
    return;
  }

  item.selected = nextSelected;

  if (!item.selected) {
    collapseTreatmentEditor(item);
  }
}

function toggleDiagnosis(diag: Diagnosis): void {
  closeReasonTooltipIfOpen();
  toggleDiagnosisSelection(diag);
}

async function handleDiagnosisDifferential(diag: Diagnosis, event?: Event): Promise<void> {
  event?.stopPropagation();
  closeReasonTooltipIfOpen();
  await openDiagnosisChecklist(diag);
}

function setPrimaryDiagnosis(diag: Diagnosis, event?: Event): void {
  event?.stopPropagation();
  setPrimaryDiagnosisSelection(diag);
}

function removeDiagnosis(diag: Diagnosis, event?: Event): void {
  event?.stopPropagation();
  removeDiagnosisSelection(diag);
}

useOutsideInteraction({
  eventName: 'pointerdown',
  targets: [
    {
      isActive: activeReasonTooltipKey,
      selectors: ['.reason-tooltip-trigger'],
      onOutside: closeReasonTooltip,
    },
    {
      isActive: () => Boolean(recommendationFeedbackPopover.activeKey.value),
      selectors: ['.voice-feedback-anchor'],
      onOutside: recommendationFeedbackPopover.close,
    },
  ],
});

useConsultationReferenceFeedbackListener<ReferenceFeedbackPayload>({
  resolveConsultationId,
  logContext: 'VoiceConsultationNew',
  onFeedback: (payload) => {
    console.info('[VoiceConsultationNew] Received writeback feedback', {
      requestId: payload.requestId,
      consultationId: payload.consultationId,
      status: payload.status,
      action: payload.action,
      referenceType: payload.referenceType,
    });
    applyWritebackFeedback(payload);
  },
});

async function fetchAIDiagnosis(): Promise<void> {
  if (diagnosisLoading.value) return;
  if (!canRefreshDiagnosis.value) {
    showToast?.('请先填写主诉或现病史', 'warning');
    return;
  }

  const requestSeq = diagnosisRequestSeq.value + 1;
  diagnosisRequestSeq.value = requestSeq;
  const requestRecordKey = [
    patientAnchorId.value,
    chiefComplaint.value,
    historyOfPresentIllness.value,
  ].join('|');
  diagnosisLoading.value = true;
  try {
    const requestSpec = buildClinicalResultDiagnosisRequestSpec({
      patientName: patientName.value,
      gender: patientGender.value,
      age: patientAge.value,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
    }, PROMPTS.consultation.diagnosisRecommendation, {
      consultationId: resolveConsultationId(),
    });

    const response = await chat(requestSpec.messages, undefined, undefined, undefined, requestSpec.config);
    const parsed = parseLLMJson<Diagnosis[]>(response);
    const currentRecordKey = [
      patientAnchorId.value,
      chiefComplaint.value,
      historyOfPresentIllness.value,
    ].join('|');
    if (requestSeq !== diagnosisRequestSeq.value || requestRecordKey !== currentRecordKey) {
      console.info('[VoiceConsultationNew] Ignore stale diagnosis response', {
        requestSeq,
        latest: diagnosisRequestSeq.value,
        requestRecordKey,
        currentRecordKey,
      });
      return;
    }

    aiDiagnoses.value = await applyRecommendationPreferenceRanking(
      mapClinicalResultAiDiagnoses({
        rawDiagnoses: parsed,
        matchDiagnosis: (query, context) => medicalDataService.matchDiagnosis(query, context),
      }),
      buildDiagnosisPreferenceCandidate,
      buildPreferenceContext('diagnosis'),
    );

    if (aiDiagnoses.value.length > 0) {
      replaceDiagnosisSelection([aiDiagnoses.value[0]], aiDiagnoses.value[0]);
    } else {
      resetDiagnosisSelection();
    }

    void registerCurrentRecommendations();

    void performDiagnosisFactCheck(aiDiagnoses.value);
  } catch (error: unknown) {
    showToast?.(formatUserFacingError(error, {
      context: '诊断推荐失败',
      fallback: '请稍后重试。',
    }), 'error');
  } finally {
    if (requestSeq === diagnosisRequestSeq.value) {
      diagnosisLoading.value = false;
    }
  }
}

async function handleDiagnosisRefresh(event?: Event): Promise<void> {
  event?.stopPropagation();
  closeReasonTooltipIfOpen();
  closeRelatedDropdown();
  recommendationFeedbackPopover.close();
  await fetchAIDiagnosis();
}

async function fetchAITreatment(): Promise<void> {
  if (treatmentLoading.value || !selectedDiagnosis.value || !allowTreatmentRefresh.value) return;

  const requestSeq = treatmentRequestSeq.value + 1;
  treatmentRequestSeq.value = requestSeq;
  const requestPatientAnchorId = patientAnchorId.value;
  const requestDiagnosis = selectedDiagnosis.value;
  const diagnosisIdentity = getDiagnosisIdentity(requestDiagnosis);
  if (!diagnosisIdentity) {
    return;
  }
  const isCurrentTreatmentRequest = () => (
    requestSeq === treatmentRequestSeq.value
    && requestPatientAnchorId === patientAnchorId.value
    && diagnosisIdentity === getDiagnosisIdentity(selectedDiagnosis.value)
  );

  treatmentLoading.value = true;

  console.info('[VoiceConsultationNew] Fetching treatment recommendations', {
    requestSeq,
    patientAnchorId: requestPatientAnchorId,
    diagnosisIdentity,
    diagnosisName: requestDiagnosis.name,
    existingTreatmentCount: treatments.value.length,
  });

  const baseParams = {
    patientName: patientName.value,
    gender: patientGender.value,
    age: patientAge.value,
    diagnosisName: requestDiagnosis.name,
    diagnosisCode: requestDiagnosis.code,
    chiefComplaint: chiefComplaint.value,
  };

  try {
    await fetchPharmacyOptions();
    if (!isCurrentTreatmentRequest()) {
      console.info('[VoiceConsultationNew] Stop stale treatment request before AI calls', {
        requestSeq,
        latest: treatmentRequestSeq.value,
        requestPatientAnchorId,
        currentPatientAnchorId: patientAnchorId.value,
        diagnosisIdentity,
        currentDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
      });
      return;
    }
    const inventoryContext = await loadAvailableMedicineInventoryContext({
      pharmacies: pharmacyOptions.value,
    });

    const treatmentRequestSpecs = buildClinicalResultTreatmentRequestSpecs({
      ...baseParams,
      availableMedicineInventory: inventoryContext.promptContext,
    }, {
      medication: PROMPTS.consultation.treatmentRecommendation,
      exam: PROMPTS.consultation.examinationRecommendation,
      lab_test: PROMPTS.consultation.labTestRecommendation,
      procedure: PROMPTS.consultation.procedureRecommendation,
    }, {
      consultationId: resolveConsultationId(),
    });
    const [medResponse, examResponse, labResponse, procResponse] = await Promise.allSettled(
      treatmentRequestSpecs.map((spec) => chat(spec.messages, undefined, undefined, undefined, spec.config)),
    );

    if (!isCurrentTreatmentRequest()) {
      console.info('[VoiceConsultationNew] Ignore stale treatment response before parsing', {
        requestSeq,
        latest: treatmentRequestSeq.value,
        requestPatientAnchorId,
        currentPatientAnchorId: patientAnchorId.value,
        diagnosisIdentity,
        currentDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
      });
      return;
    }

    const nextTreatments = mergeClinicalResultAiTreatmentResponses({
      responses: [medResponse, examResponse, labResponse, procResponse],
      parse: (value) => alignMedicineRecommendationsToInventory(
        parseLLMJson<TreatmentRecommendation[]>(value),
        inventoryContext.items,
      ),
      assessCatalogMatch: assessTreatmentCatalogMatch,
      normalize: normalizeTreatmentRecommendation,
      onParseFailure: ({ error, responsePreview }) => {
        console.warn('[VoiceConsultationNew] Failed to parse treatment recommendation response', {
          error: error instanceof Error ? error.message : String(error),
          responsePreview,
        });
      },
    });

    console.info('[VoiceConsultationNew] Treatment recommendations loaded', {
      requestSeq,
      diagnosisIdentity,
      totalCount: nextTreatments.length,
      medicineCount: nextTreatments.filter((item) => item.type === 'medicine').length,
      medicineWithDosageCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.dosage).length,
      medicineWithDaysCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.days).length,
      medicineWithTotalQtyCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.totalQty).length,
    });

    if (!isCurrentTreatmentRequest()) {
      console.info('[VoiceConsultationNew] Ignore stale treatment response after parsing', {
        requestSeq,
        latest: treatmentRequestSeq.value,
        requestPatientAnchorId,
        currentPatientAnchorId: patientAnchorId.value,
        diagnosisIdentity,
        currentDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
      });
      return;
    }

    treatments.value = await applyRecommendationPreferenceRanking(
      nextTreatments,
      buildTreatmentPreferenceCandidate,
      buildPreferenceContext('treatment'),
    );
    lastTreatmentDiagnosisKey.value = diagnosisIdentity;
    autoTreatmentFetchAttemptKey.value = buildTreatmentAutoFetchKey(diagnosisIdentity);
    await reconcileAutoSelectedMedicineInventory(treatments.value);
    void registerCurrentRecommendations();
    void performTreatmentFactCheck(treatments.value);
    submitVoiceGeneratedUserLog();
    // 把 LLM 推荐的诊疗方案写回缓存，下次同就诊恢复时直接复用、跳过 fetchAITreatment
    persistEditorSnapshotImmediate();
  } catch (error: unknown) {
    if (!isCurrentTreatmentRequest()) {
      console.info('[VoiceConsultationNew] Ignore stale treatment error', {
        requestSeq,
        latest: treatmentRequestSeq.value,
        requestPatientAnchorId,
        currentPatientAnchorId: patientAnchorId.value,
        diagnosisIdentity,
        currentDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
      });
      return;
    }
    showToast?.(formatUserFacingError(error, {
      context: '方案推荐失败',
      fallback: '请稍后重试。',
    }), 'error');
  } finally {
    if (requestSeq === treatmentRequestSeq.value) {
      treatmentLoading.value = false;
    }
  }
}

function maybeAutoFetchMissingTreatment(reason: string): void {
  if (suppressDiagnosisTreatmentRefetch.value || treatmentLoading.value) return;
  if (treatments.value.length > 0 || lastTreatmentDiagnosisKey.value) return;

  const diagnosisIdentity = getDiagnosisIdentity(selectedDiagnosis.value);
  if (!diagnosisIdentity || !selectedDiagnosis.value) return;

  const attemptKey = buildTreatmentAutoFetchKey(diagnosisIdentity);
  if (autoTreatmentFetchAttemptKey.value === attemptKey) return;
  autoTreatmentFetchAttemptKey.value = attemptKey;

  console.info('[VoiceConsultationNew] Auto fetching missing treatment recommendations', {
    reason,
    attemptKey,
    diagnosisIdentity,
    diagnosisName: selectedDiagnosis.value.name,
  });
  void fetchAITreatment();
}

async function handleTreatmentRefresh(event?: Event): Promise<void> {
  event?.stopPropagation();
  closeReasonTooltipIfOpen();
  resetTreatmentEditorState();
  await fetchAITreatment();
}

const relatedDiagnosisDropdown = useRelatedDiagnosisDropdown<DiagnosisItem>({
  getDiagnosisKey: (diag) => diag.id || diag.code,
  getCandidates: (diag) => medicalDataService
    .getRelatedDiagnoses(diag.code)
    .filter((item) => item.code !== diag.code),
});
const {
  closeRelatedDropdown,
  completeRelatedSwap,
  getRelatedDropdownCandidates,
  isRelatedDropdownOpen,
  toggleRelatedDropdown,
} = relatedDiagnosisDropdown;
const { resetForIntent } = useClinicalResultIntentReset({
  suppressDiagnosisTreatmentRefetch,
  lastTreatmentDiagnosisKey,
  chiefComplaint,
  historyOfPresentIllness,
  pastMedicalHistory,
  personalHistory,
  familyHistory,
  physicalExam,
  precautions,
  diagnoses: aiDiagnoses,
  treatments,
  resetTreatmentEditorState,
  closeRelatedDropdown,
  closeManualMatch,
  closeRecommendationFeedback: () => {
    recommendationFeedbackPopover.close();
  },
  closeSessionFeedback: () => {
    showSessionFeedbackDialog.value = false;
  },
  resetWritebackState,
  resetDiagnosisSelection,
  resetFirstUserLogSnapshot,
  setInitialRecordSnapshot,
});

function swapDiagnosis(originalDiag: Diagnosis, newItem: { id?: string; code: string; name: string }): void {
  const originalIdentity = getStandardDiagnosisKey(originalDiag);
  const index = aiDiagnoses.value.findIndex((item) => getStandardDiagnosisKey(item) === originalIdentity);
  if (index === -1) return;

  const updatedDiag: Diagnosis = {
    ...aiDiagnoses.value[index],
    id: newItem.id,
    code: newItem.code,
    name: newItem.name,
  };

  aiDiagnoses.value[index] = updatedDiag;

  replaceDiagnosisInSelection(originalDiag, updatedDiag);

  completeRelatedSwap();
  void registerCurrentRecommendations();
}

watch(
  () => getDiagnosisIdentity(selectedDiagnosis.value),
  (currentIdentity, previousIdentity) => {
    closeRelatedDropdown();

    if (!currentIdentity || !selectedDiagnosis.value) {
      invalidateTreatmentRequests();
      treatments.value = [];
      lastTreatmentDiagnosisKey.value = '';
      resetTreatmentEditorState();
      return;
    }

    if (currentIdentity !== previousIdentity) {
      invalidateTreatmentRequests();
      resetTreatmentEditorState();
    }

    if (suppressDiagnosisTreatmentRefetch.value) {
      console.info('[VoiceConsultationNew] Skip treatment refetch while applying voice intent result', {
        currentIdentity,
        previousIdentity,
        treatmentCount: treatments.value.length,
      });
      return;
    }

    const shouldAutoFetchInitialTreatment = !previousIdentity
      && !lastTreatmentDiagnosisKey.value
      && treatments.value.length === 0;

    if (shouldAutoFetchInitialTreatment && autoFetchTreatments.value) {
      console.info('[VoiceConsultationNew] Auto fetching initial treatment recommendations', {
        currentIdentity,
      });
      void fetchAITreatment();
      return;
    }

    if (currentIdentity !== lastTreatmentDiagnosisKey.value) {
      console.info('[VoiceConsultationNew] Diagnosis changed, waiting for manual treatment refresh', {
        currentIdentity,
        previousIdentity,
        lastTreatmentDiagnosisKey: lastTreatmentDiagnosisKey.value,
        treatmentCount: treatments.value.length,
      });
    }
  },
);

watch(
  () => [
    patientAnchorId.value,
    getDiagnosisIdentity(selectedDiagnosis.value),
    treatments.value.length,
    lastTreatmentDiagnosisKey.value,
    treatmentLoading.value,
    suppressDiagnosisTreatmentRefetch.value,
  ],
  () => {
    maybeAutoFetchMissingTreatment('stable-empty-treatment-state');
  },
  { flush: 'post' },
);

const resultFactCheckState = useVoiceResultFactCheckState({
  isEnabled: isReviewerEnabled,
  getRecordText: () => ({
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
  }),
  getDiagnosisName: () => selectedDiagnosis.value?.name || '',
  checkDiagnosis,
  checkMedicine,
  checkExamination,
  logContext: 'VoiceConsultationNew',
});
const {
  getIssueForDiagnosis,
  getIssueForTreatment,
  performDiagnosisFactCheck,
  performTreatmentFactCheck,
} = resultFactCheckState;

const {
  frequencyOptions,
  routeOptions,
  pharmacyOptions,
  execDeptOptions,
  loadFrequencyOptions: loadFrequencyDict,
  loadRouteOptions: loadRouteDict,
  loadPharmacyOptions: loadPharmacyDict,
  loadExecDeptOptions: loadExecDeptDict,
} = useMedicalDictionaries();

// 门禁逻辑合并到共享 composable，与症状问诊取同一份判定 / 候选过滤口径。
const treatmentGates = useTreatmentGates({ pharmacyOptions, execDeptOptions });
const treatmentPharmacyResolution = useTreatmentPharmacyResolution({
  pharmacyOptions: () => pharmacyOptions.value,
  treatmentGates,
  warn: (message, payload) => {
    console.warn(`[VoiceConsultationNew] ${message}`, payload);
  },
});
const {
  getCandidatePharmaciesForMedicine,
  getDefaultPharmacyOption,
  ensureMedicineDefaultPharmacy,
  findMatchedPharmacyOption,
  getNormalizedPharmacyValue,
  normalizeMedicinePharmacyValues,
} = treatmentPharmacyResolution;

// 治疗项归一化 composable：注入语音侧的执行科室门禁 & 默认发药药房副作用，
// 与症状问诊共享同一份归一化口径（症状侧调用时传入对应回调或默认值）。
const treatmentNormalization = useTreatmentNormalization({
  frequencyOptions,
  routeOptions,
  ensurePharmacy: ensureMedicineDefaultPharmacy,
  isExecDeptSatisfied: (rec) => !isExecDeptRequired(rec) || !!getExecDeptDisplay(rec),
});

const medicineUsageSearch = useMedicineUsageSearch({
  getEditorKey: (rec) => getTreatmentEditorKey(rec),
  getCurrentValue: (rec, field) => {
    const normalized = normalizeTreatmentRecommendation(rec);
    return field === 'frequency' ? normalized.frequency || '' : normalized.route || '';
  },
  getCurrentKey: (rec, field) => {
    const normalized = normalizeTreatmentRecommendation(rec);
    return field === 'frequency' ? normalized.frequencyKey || '' : normalized.routeKey || '';
  },
  getOptions: (field) => field === 'frequency' ? frequencyOptions.value : routeOptions.value,
});
const medicineFieldEditing = useMedicineFieldEditing({
  normalize: normalizeTreatmentRecommendation,
  syncUsageKeyword: (rec, field) => medicineUsageSearch.syncKeyword(rec, field),
  resolveUsageValue: (rec, field) => medicineUsageSearch.resolveValue(rec, field),
  resolveUsageKey: (rec, field) => medicineUsageSearch.resolveKey(rec, field),
  setActiveField: setActiveEditableField,
  isFieldActive: isEditableFieldActive,
  clearActiveField: clearActiveEditableField,
  focusActiveField: focusActiveEditableField,
  clearInventoryWarning: (rec) => clearMedicineInventoryWarning(rec),
  checkInventoryEnough: (rec, showWarning) => checkMedicineInventoryEnough(rec, showWarning),
});

function activateEditableField(rec: TreatmentRecommendation, field: MedicinePrimaryField, event?: Event): void {
  medicineFieldEditing.activateField(rec, field, event);
}

function handleEditableFieldBlur(rec: TreatmentRecommendation, field: MedicinePrimaryField, event: FocusEvent): void {
  medicineFieldEditing.handleFieldBlur(rec, field, event);
}

function handleTotalQtyInput(rec: TreatmentRecommendation, event: Event): void {
  medicineFieldEditing.handleTotalQtyInput(rec, event);
}

function handleFrequencyOpenChange(rec: TreatmentRecommendation, open: boolean): void {
  medicineFieldEditing.handleUsageOpenChange(rec, 'frequency', open);
}

function handleRouteOpenChange(rec: TreatmentRecommendation, open: boolean): void {
  medicineFieldEditing.handleUsageOpenChange(rec, 'route', open);
}

function handleUsageFieldChange(
  rec: TreatmentRecommendation,
  field: Extract<MedicinePrimaryField, 'frequency' | 'route'>,
  value: string,
  key: string,
): void {
  medicineFieldEditing.handleUsageFieldChange(rec, field, value, key);
}

// 二级搜索下拉（药房 / 执行科室 / 部位 / 医保）的统一状态：activeKey + 每条 rec×field 的 keyword 缓存。
const secondarySelector = useSecondarySelector({
  getEditorKey: (rec) => getTreatmentEditorKey(rec),
  fields: {
    pharmacy: { getCurrentValue: (rec) => getNormalizedPharmacyValue(rec) },
    execDept: {
      getCurrentValue: (rec) => {
        const currentValue = (rec.execDept || '').trim();
        if (!currentValue) return '';
        const matched = execDeptOptions.value.find((option) => option.key === currentValue || option.text === currentValue);
        return matched?.text || currentValue;
      },
    },
    bodySite: { getCurrentValue: (rec) => rec.bodySite || '' },
    insurance: { getCurrentValue: (rec) => rec.insuranceType || '' },
  },
});
const treatmentAttributeSearch = useTreatmentAttributeSearch({
  secondarySelector,
  pharmacyOptions: () => pharmacyOptions.value,
  execDeptOptions: () => execDeptOptions.value,
  getCandidatePharmaciesForMedicine,
  getNormalizedPharmacyValue,
});

// 药品详情 hydrate / 库存校验：与症状问诊共享同一份口径（useTreatmentHydration）。
// 注入：候选药房收窄、字典查找；toast 通过 notify 回调走 voice 侧的 'warning' 级别。
const {
  hydrateMatchedMedicalItemDetail,
  finalizeMedicineRecommendations,
  ensureMedicineSelectable,
  checkMedicineInventoryEnough,
  getMedicineInventoryWarning,
  clearMedicineInventoryWarning,
  isMedicineInventoryChecking,
} = useTreatmentHydration({
  pharmacyOptions,
  normalizeTreatment: normalizeTreatmentRecommendation,
  getCandidatePharmaciesForMedicine,
  findFrequencyOptionByValue,
  findRouteOptionByValue,
  getInventoryKey: (rec) => getTreatmentEditorKey(rec),
  applyMedicalItemPartOptions,
  afterMedicalItemHydrated: syncTreatmentExecDeptSelections,
  logContext: 'VoiceConsultationNew',
  notify: (message) => {
    showToast?.(message, 'warning');
  },
});
const treatmentSelectionReadiness = useTreatmentSelectionReadiness({
  ensureMedicineSelectable,
  hydrateMedicalItemDetail: hydrateMatchedMedicalItemDetail,
  checkMedicineInventoryEnough,
  normalize: normalizeTreatmentRecommendation,
  hasRequiredPharmacy,
  hasRequiredExecDept,
  hasRequiredBodySite,
  openPharmacySelector: openPharmacyQuickSelector,
  openExecDeptSelector: (rec) => {
    expandTreatmentEditor(rec);
    openSecondarySelector(rec, 'execDept');
  },
  openBodySiteSelector: openBodySiteQuickSelector,
  expandTreatmentEditor,
  notify: showToast,
});
const {
  ensureTreatmentSelectable,
} = treatmentSelectionReadiness;

async function fetchFrequencyOptions(): Promise<void> {
  await loadFrequencyDict();
}

async function fetchRouteOptions(): Promise<void> {
  await loadRouteDict();
}

async function fetchPharmacyOptions(): Promise<void> {
  await loadPharmacyDict();
  // 语音侧专属副作用：拿到药房列表后预热药品目录与匹配项详情
  const his = getHisAdapter();
  if (!his) {
    medicalDataService.setActivePharmacyStoreIds(null);
    return;
  }
  const activeStoreIds = pharmacyOptions.value
    .map((option) => (option.idSto || '').trim())
    .filter((value): value is string => Boolean(value));
  if (activeStoreIds.length === 0) {
    medicalDataService.setActivePharmacyStoreIds(null);
    return;
  }
  try {
    await medicalDataService.ensureMedicineCatalogForStoreIds(activeStoreIds, his);
    await finalizeMedicineRecommendations(treatments.value, {
      checkInventory: treatments.value.some((item) => item.type === 'medicine' && item.selected),
    });
  } catch (error) {
    console.error('[VoiceConsultationNew] ensureMedicineCatalogForStoreIds failed', error);
  }
}

function syncTreatmentExecDeptSelections(): void {
  syncSharedTreatmentExecDeptSelections(treatments.value, execDeptOptions.value);
}

async function fetchExecDeptOptions(): Promise<void> {
  await loadExecDeptDict();
  syncTreatmentExecDeptSelections();
}

function isExecDeptRequired(rec: TreatmentRecommendation): boolean {
  return treatmentGates.isExecDeptRequired(rec);
}

function getExecDeptDisplay(rec: TreatmentRecommendation): string {
  return treatmentGates.getExecDeptDisplay(rec);
}

function hasRequiredExecDept(rec: TreatmentRecommendation): boolean {
  return treatmentGates.hasRequiredExecDept(rec);
}

function isBodySiteRequired(rec: TreatmentRecommendation): boolean {
  return treatmentGates.isBodySiteRequired(rec);
}

function hasRequiredBodySite(rec: TreatmentRecommendation): boolean {
  return treatmentGates.hasRequiredBodySite(rec);
}

function openExecDeptQuickSelector(rec: TreatmentRecommendation, event?: Event): void {
  openQuickSelector(rec, 'execDept', event);
}

function openBodySiteQuickSelector(rec: TreatmentRecommendation, event?: Event): void {
  openQuickSelector(rec, 'bodySite', event);
}

// === 药品发药药房必填机制（复用检查/检验“医技科室”同样的门禁与 Chip 呈现方案） ===
function isPharmacyRequired(rec: TreatmentRecommendation): boolean {
  return treatmentGates.isPharmacyRequired(rec);
}

function getPharmacyDisplay(rec: TreatmentRecommendation): string {
  return treatmentGates.getPharmacyDisplay(rec);
}

function hasRequiredPharmacy(rec: TreatmentRecommendation): boolean {
  return treatmentGates.hasRequiredPharmacy(rec);
}

function openPharmacyQuickSelector(rec: TreatmentRecommendation, event?: Event): void {
  openQuickSelector(rec, 'pharmacy', event);
}

function openInsuranceQuickSelector(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(rec);
  openSecondarySelector(rec, 'insurance');
}

onMounted(() => {
  void Promise.all([fetchFrequencyOptions(), fetchRouteOptions(), fetchPharmacyOptions(), fetchExecDeptOptions()]);
});

onUnmounted(() => {
  clearPendingSnapshotPersist();
});

const {
  buildDiagList,
  buildOrderList,
  orderItemResolvers,
} = useClinicalResultWritebackPayload({
  selectedDiagnoses,
  primaryDiagnosis: selectedDiagnosis,
  patientTetId,
  execDeptOptions,
  normalizeTreatment: normalizeTreatmentRecommendation,
  findFrequencyOptionByValue,
  findRouteOptionByValue,
  getDefaultPharmacyOption,
  findMatchedPharmacyOption,
  getDefaultExecDeptId: () => getHisAdapter()?.getDefaultExecDeptId() || '',
});
const {
  run: runWritebackPreflight,
} = useClinicalResultWritebackPreflight({
  selectedDiagnoses,
  treatments,
  ensureMedicineSelectable,
  checkMedicineInventoryEnough,
  hydrateMedicalItemDetail: hydrateMatchedMedicalItemDetail,
  hasRequiredPharmacy,
  hasRequiredExecDept,
  hasRequiredBodySite,
  openPharmacySelector: openPharmacyQuickSelector,
  openExecDeptSelector: (rec) => {
    expandTreatmentEditor(rec);
    openSecondarySelector(rec, 'execDept');
  },
  openBodySiteSelector: openBodySiteQuickSelector,
  requiredFieldOptions: {
    resolvers: orderItemResolvers,
    normalize: normalizeTreatmentRecommendation,
  },
  notify: showToast,
});

function getTreatmentMatchLabel(rec: TreatmentRecommendation): string {
  return getSharedTreatmentMatchLabel(rec, 'detailed');
}

function findFrequencyOptionByValue(value?: string): UsageOption | undefined {
  return findUsageOptionByValue(frequencyOptions.value, value);
}

function findRouteOptionByValue(value?: string): UsageOption | undefined {
  return findUsageOptionByValue(routeOptions.value, value);
}

function getMedicineFieldDisplay(rec: TreatmentRecommendation, field: MedicinePrimaryField): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  return getSharedMedicineFieldDisplay(normalized, field, frequencyOptions.value);
}

function getMedicineCollapsedSummary(rec: TreatmentRecommendation): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  return getSharedMedicineCollapsedSummary(normalized, frequencyOptions.value);
}

// 二级选择器统一接口（详见 `useSecondarySelector`）：保留旧函数名作为薄包装，模板/调用方无需感知重构。

function isSecondarySelectorOpen(rec: TreatmentRecommendation, field: SecondarySelectorField): boolean {
  return secondarySelector.isOpen(rec, field);
}

function openSecondarySelector(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
  secondarySelector.open(rec, field);
}

function closeSecondarySelector(rec: TreatmentRecommendation, field: SecondarySelectorField, event: FocusEvent): void {
  secondarySelector.close(rec, field, event);
}

// === 发药药房 ===
function getPharmacySearchKeyword(rec: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(rec, 'pharmacy');
}

function setPharmacySearchKeyword(rec: TreatmentRecommendation, value: string): void {
  treatmentAttributeSearch.setSearchKeyword(rec, 'pharmacy', value);
}

function handlePharmacySearchInput(rec: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(rec, 'pharmacy', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  rec.pharmacy = '';
  rec.pharmacyCleared = true;
  clearMedicineInventoryWarning(rec);
  if (isPharmacyRequired(rec)) {
    rec.selected = false;
  }
}

function getFilteredPharmacyOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getPharmacyOptionsForRecord(rec);
}

function selectPharmacyOption(rec: TreatmentRecommendation, option: TreatmentAttributeOption): void {
  rec.pharmacy = option.text;
  rec.pharmacyCleared = false;
  setPharmacySearchKeyword(rec, option.text);
  clearMedicineInventoryWarning(rec);
  if (rec.type === 'medicine' && (rec.totalQty || '').trim()) {
    void checkMedicineInventoryEnough(rec, true);
  }
  secondarySelector.closeAll();
}

function clearPharmacySelection(rec: TreatmentRecommendation): void {
  rec.pharmacy = '';
  rec.pharmacyCleared = true;
  setPharmacySearchKeyword(rec, '');
  clearMedicineInventoryWarning(rec);
  if (isPharmacyRequired(rec) && rec.selected) {
    rec.selected = false;
    showToast?.('发药药房已清空，请重新设置后再选中该药品', 'warning');
  }
}

// === 执行科室 ===
function getExecDeptSearchKeyword(rec: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(rec, 'execDept');
}

function setExecDeptSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  treatmentAttributeSearch.setSearchKeyword(rec, 'execDept', value);
}

function handleExecDeptSearchInput(rec: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(rec, 'execDept', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  rec.execDept = '';
  rec.execDeptCleared = true;
  if (isExecDeptRequired(rec)) {
    rec.selected = false;
  }
}

function getFilteredExecDeptOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getExecDeptOptionsForRecord(rec);
}

function selectExecDeptOption(rec: TreatmentRecommendation, option: TreatmentAttributeOption): void {
  rec.execDept = option.key || option.text;
  rec.execDeptCleared = false;
  setExecDeptSearchKeyword(rec, option.text);
  secondarySelector.closeAll();
}

function clearExecDeptSelection(rec: TreatmentRecommendation): void {
  rec.execDept = '';
  rec.execDeptCleared = true;
  setExecDeptSearchKeyword(rec, '');
  if (isExecDeptRequired(rec)) {
    rec.selected = false;
    showToast?.('执行科室已清空，请重新设置后再选中该项目', 'warning');
  }
}


// === 部位 ===
function getBodySiteSearchKeyword(rec: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(rec, 'bodySite');
}

function setBodySiteSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  treatmentAttributeSearch.setSearchKeyword(rec, 'bodySite', value);
}

function handleBodySiteSearchInput(rec: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(rec, 'bodySite', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  rec.bodySite = '';
  rec.bodySiteId = '';
  if (isBodySiteRequired(rec)) {
    rec.selected = false;
  }
}

function getFilteredBodySiteOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getBodySiteOptionsForRecord(rec);
}

function selectBodySiteOption(rec: TreatmentRecommendation, option: TreatmentAttributeOption): void {
  const matched = (rec.bodySiteOptions || []).find((candidate) => candidate.partId === option.key || candidate.name === option.text);
  if (matched) {
    applyMedicalItemPartOption(rec, matched);
  } else {
    rec.bodySiteId = option.key;
    rec.bodySite = option.text;
  }
  setBodySiteSearchKeyword(rec, option.text);
  secondarySelector.closeAll();
}

function clearBodySiteSelection(rec: TreatmentRecommendation): void {
  rec.bodySite = '';
  rec.bodySiteId = '';
  setBodySiteSearchKeyword(rec, '');
  if (rec.matchedItem) {
    rec.matchedItem = {
      ...rec.matchedItem,
      idPart: '',
      raw: {
        ...(getMatchedItemRaw(rec) || {}),
        idPart: '',
      },
    };
  }

  if (isBodySiteRequired(rec) && rec.selected) {
    rec.selected = false;
    showToast?.('检查部位已清空，请重新设置后再选中该项目', 'warning');
  }
}

// === 医保 ===
function getInsuranceSearchKeyword(rec: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(rec, 'insurance');
}

function setInsuranceSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  treatmentAttributeSearch.setSearchKeyword(rec, 'insurance', value);
}

function handleInsuranceSearchInput(rec: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(rec, 'insurance', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  rec.insuranceType = '';
  rec.insuranceCleared = true;
  rec.selected = false;
}

function getFilteredInsuranceOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getInsuranceOptionsForRecord(rec);
}

function selectInsuranceOption(rec: TreatmentRecommendation, option: TreatmentAttributeOption): void {
  rec.insuranceType = option.text;
  rec.insuranceCleared = false;
  setInsuranceSearchKeyword(rec, option.text);
  secondarySelector.closeAll();
}

function clearInsuranceSelection(rec: TreatmentRecommendation): void {
  rec.insuranceType = '';
  rec.insuranceCleared = true;
  setInsuranceSearchKeyword(rec, '');
  if (rec.selected) {
    rec.selected = false;
    showToast?.('医保限用已清空，请重新设置后再选中该项目', 'warning');
  }
}

async function reconcileAutoSelectedMedicineInventory(items: TreatmentRecommendation[]): Promise<void> {
  const autoSelectedMedicines = items.filter((item) => item.type === 'medicine' && item.selected);
  const results = await finalizeMedicineRecommendations(items, {
    checkInventory: autoSelectedMedicines.length > 0,
  });
  const blockedSet = new Set(
    results
      .filter((result) => !result.ready)
      .map((result) => result.item),
  );
  const blockedItems = autoSelectedMedicines.filter((item) => blockedSet.has(item));
  if (blockedItems.length === 0) {
    return;
  }

  blockedItems.forEach((item) => {
    item.selected = false;
  });
  expandTreatmentEditor(blockedItems[0]);
  showToast?.(buildInventoryBlockedSubmitMessage(blockedItems), 'warning');
}

async function handleBatchWriteBack(): Promise<void> {
  if (!canSubmit.value) return;
  persistEditorSnapshotImmediate();
  submitting.value = true;
  clearLastFeedback();

  try {
    const preflight = await runWritebackPreflight();
    if (!preflight.ready) {
      return;
    }
    const { selected } = preflight;

    const diagList = buildDiagList();
    const orderList = buildOrderList(selected);

    const treatmentPlan = buildTreatmentPlanSummary(selected);

    const requestId = `record-confirmed-${Date.now()}`;
    const result = buildRecordConfirmedPayload({
      consultationId: resolveConsultationId(),
      requestId,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
      pastMedicalHistory: pastMedicalHistory.value,
      familyHistory: familyHistory.value,
      outpatientRecord: {
        chiefComplaint: chiefComplaint.value,
        historyOfPresentIllness: historyOfPresentIllness.value,
        pastMedicalHistory: pastMedicalHistory.value,
        personalHistory: personalHistory.value,
        familyHistory: familyHistory.value,
        physicalExam: physicalExam.value,
        precautions: precautions.value,
      },
      diagList,
      orderList,
      treatmentPlan,
      extra: {
        referenceType: 'batch',
        action: 'batch',
        referenceStatus: 'pending',
        referenceMessage: '等待 HIS 完成最终回写并回执。',
      },
    });

    trackFinalRecommendationPreferences({
      diagnoses: selectedDiagnoses.value,
      primaryDiagnosis: selectedDiagnosis.value,
      treatments: selected,
      context: buildPreferenceContext('writeback'),
    });
    markWritebackPending(requestId, '病历已发送至 HIS，等待处理结果回执。');
    await invoke('complete_consultation', { result });
    if (waitingWritebackFeedback.value) {
      showToast?.('病历已发送至 HIS，等待处理结果回执。', 'info');
    }
  } catch (error: unknown) {
    if (waitingWritebackFeedback.value) {
      resetWritebackState();
    }
    showToast?.(formatUserFacingError(error, {
      context: '提交失败',
      fallback: '请稍后重试。',
    }), 'error');
  } finally {
    submitting.value = false;
  }
}

watch(
  patientAnchorId,
  async (currentAnchorId, previousAnchorId) => {
    if (!previousAnchorId || currentAnchorId === previousAnchorId) {
      return;
    }

    console.info('[VoiceConsultationNew] Patient context changed, reset clinical result state', {
      channel: resultChannel.value,
      previousAnchorId,
      currentAnchorId,
    });
    clearPendingSnapshotPersist();
    lastAppliedIntentKey.value = '';
    invalidateTreatmentRequests();
    autoTreatmentFetchAttemptKey.value = '';
    resetForIntent({});
    await nextTick();
    suppressDiagnosisTreatmentRefetch.value = false;
    maybeAutoFetchMissingTreatment('patient-context-reset');
  },
);

watch(
  () => props.intentResult,
  async (result) => {
    if (!result) {
      lastAppliedIntentKey.value = '';
      return;
    }

    const intentKey = buildIntentResultKey(result);
    if (intentKey === lastAppliedIntentKey.value) {
      console.info('[VoiceConsultationNew] Skip duplicate intent result reset', {
        diagnosisCount: result.diagnoses.length,
        treatmentCount: result.treatments.length,
      });
      return;
    }
    lastAppliedIntentKey.value = intentKey;

    invalidateTreatmentRequests();
    autoTreatmentFetchAttemptKey.value = '';
    resetForIntent(result);

    if (result.diagnoses?.length) {
      aiDiagnoses.value = initDiagnosesFromIntent(result.diagnoses);
      const firstStandard = aiDiagnoses.value.find((diag) => getStandardDiagnosisId(diag));
      const firstSelectable = firstStandard || aiDiagnoses.value[0] || null;
      replaceDiagnosisSelection(firstSelectable ? [firstSelectable] : [], firstSelectable);
      void registerCurrentRecommendations();
    }

    const allowedIntentTreatments = getAllowedIntentTreatments(result);
    if (allowedIntentTreatments.length > 0) {
      await fetchPharmacyOptions();
      treatments.value = initTreatmentsFromIntent(allowedIntentTreatments);
      normalizeMedicinePharmacyValues(treatments.value);
      lastTreatmentDiagnosisKey.value = getDiagnosisIdentity(selectedDiagnosis.value);
      await reconcileAutoSelectedMedicineInventory(treatments.value);
      void registerCurrentRecommendations();
      console.info('[VoiceConsultationNew] Applied voice intent treatments', {
        diagnosisIdentity: lastTreatmentDiagnosisKey.value,
        treatmentCount: treatments.value.length,
        medicineCount: treatments.value.filter((item) => item.type === 'medicine').length,
        medicineWithDosageCount: treatments.value.filter((item) => item.type === 'medicine' && !!item.dosage).length,
        medicineWithTotalQtyCount: treatments.value.filter((item) => item.type === 'medicine' && !!item.totalQty).length,
      });
    }

    // 仅在“同就诊缓存恢复”路径上叠加编辑快照，避免上一会话的治疗方案/诊断
    // 污染全新 LLM 语音问诊的默认推荐。
    if (shouldUseVoiceCache.value && props.intentSource === 'cache') {
      const editorSnapshot = getVoiceConsultationEditorSnapshot(props.initialPatientData);
      if (editorSnapshot) {
        await applyEditorSnapshot(editorSnapshot);
      }
    }

    if (aiDiagnoses.value.length > 0) {
      void performDiagnosisFactCheck(aiDiagnoses.value);
    } else if (canRefreshDiagnosis.value) {
      void fetchAIDiagnosis();
    }

    if (treatments.value.length > 0) {
      void performTreatmentFactCheck(treatments.value);
    }

    await nextTick();
    suppressDiagnosisTreatmentRefetch.value = false;
    submitVoiceGeneratedUserLog();
    maybeAutoFetchMissingTreatment('intent-result-applied');

    const primaryDiagnosis = selectedDiagnosis.value;
    const primaryDiagnosisName = primaryDiagnosis && typeof primaryDiagnosis.name === 'string'
      ? primaryDiagnosis.name
      : '';
    if (treatments.value.length === 0 && primaryDiagnosis && autoFetchTreatments.value) {
      console.info('[VoiceConsultationNew] No voice intent treatments found, fetching default recommendations for selected diagnosis', {
        diagnosisIdentity: getDiagnosisIdentity(primaryDiagnosis),
        diagnosisName: primaryDiagnosisName,
      });
      void fetchAITreatment();
    }
  },
  { immediate: true },
);

// 编辑器关键状态发生变化时，节流写回缓存的 editorSnapshot。
// 下一次恢复同就诊时整张语音病历都从缓存里直接还原。
watch(
  () => [
    chiefComplaint.value,
    historyOfPresentIllness.value,
    pastMedicalHistory.value,
    personalHistory.value,
    familyHistory.value,
    physicalExam.value,
    precautions.value,
    treatments.value,
    aiDiagnoses.value,
    selectedDiagnosis.value,
    lastTreatmentDiagnosisKey.value,
  ],
  () => {
    schedulePersistEditorSnapshot();
  },
  { deep: true },
);
</script>

<template>
  <div class="voice-consultation-new">
    <PatientHeader v-if="shouldShowPatientHeader" :patient="props.initialPatientData" />

    <div class="voice-content">
      <div v-if="!intentResult" class="loading-state pane-card">
      <div class="ai-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-core"></div>
      </div>
      <p class="loading-title">AI 正在识别语音意图...</p>
    </div>

    <div v-else class="medical-record-page">
      <div v-if="writebackBannerText" :class="['writeback-status-banner', `writeback-status-banner-${writebackBannerTone}`]">
        {{ writebackBannerText }}
      </div>
      <div class="record-content">
        <section class="vcn-panel pane-card vcn-left-panel">
          <div class="section-heading">
            <div>

              <h3 class="section-title">病历详情</h3>
            </div>
          </div>

          <div class="record-fields">
            <VoiceRecordFieldEditor
              v-model="chiefComplaint"
              field-key="chiefComplaint"
              title="主诉"
              presentation="document"
              :original-value="initialRecordSnapshot.chiefComplaint"
              :draft="getRecordFieldDraft('chiefComplaint')"
              :feedback-key="getRecordFieldFeedbackKey('chiefComplaint')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('chiefComplaint'))"
              :modified="isRecordFieldModified('chiefComplaint')"
              :rows="2"
              placeholder="请输入主诉..."
              :submitted-label="getRecordFieldSubmittedLabel('chiefComplaint')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('chiefComplaint')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="historyOfPresentIllness"
              field-key="historyOfPresentIllness"
              title="现病史"
              presentation="document"
              :original-value="initialRecordSnapshot.historyOfPresentIllness"
              :draft="getRecordFieldDraft('historyOfPresentIllness')"
              :feedback-key="getRecordFieldFeedbackKey('historyOfPresentIllness')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('historyOfPresentIllness'))"
              :modified="isRecordFieldModified('historyOfPresentIllness')"
              :rows="6"
              placeholder="请输入现病史..."
              :submitted-label="getRecordFieldSubmittedLabel('historyOfPresentIllness')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('historyOfPresentIllness')"
              grow
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="pastMedicalHistory"
              field-key="pastMedicalHistory"
              title="既往史"
              presentation="document"
              :original-value="initialRecordSnapshot.pastMedicalHistory"
              :draft="getRecordFieldDraft('pastMedicalHistory')"
              :feedback-key="getRecordFieldFeedbackKey('pastMedicalHistory')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('pastMedicalHistory'))"
              :modified="isRecordFieldModified('pastMedicalHistory')"
              :rows="4"
              placeholder="请输入既往史..."
              :submitted-label="getRecordFieldSubmittedLabel('pastMedicalHistory')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('pastMedicalHistory')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="personalHistory"
              field-key="personalHistory"
              title="个人史"
              presentation="document"
              :original-value="initialRecordSnapshot.personalHistory"
              :draft="getRecordFieldDraft('personalHistory')"
              :feedback-key="getRecordFieldFeedbackKey('personalHistory')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('personalHistory'))"
              :modified="isRecordFieldModified('personalHistory')"
              :rows="3"
              placeholder="请输入个人史..."
              :submitted-label="getRecordFieldSubmittedLabel('personalHistory')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('personalHistory')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="familyHistory"
              field-key="familyHistory"
              title="家族史"
              presentation="document"
              :original-value="initialRecordSnapshot.familyHistory"
              :draft="getRecordFieldDraft('familyHistory')"
              :feedback-key="getRecordFieldFeedbackKey('familyHistory')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('familyHistory'))"
              :modified="isRecordFieldModified('familyHistory')"
              :rows="3"
              placeholder="请输入家族史..."
              :submitted-label="getRecordFieldSubmittedLabel('familyHistory')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('familyHistory')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="physicalExam"
              field-key="physicalExam"
              title="体格检查"
              presentation="document"
              :original-value="initialRecordSnapshot.physicalExam"
              :draft="getRecordFieldDraft('physicalExam')"
              :feedback-key="getRecordFieldFeedbackKey('physicalExam')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('physicalExam'))"
              :modified="isRecordFieldModified('physicalExam')"
              :rows="4"
              placeholder="请输入体格检查..."
              :submitted-label="getRecordFieldSubmittedLabel('physicalExam')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('physicalExam')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
            <VoiceRecordFieldEditor
              v-model="precautions"
              field-key="precautions"
              title="注意事项"
              presentation="document"
              :original-value="initialRecordSnapshot.precautions"
              :draft="getRecordFieldDraft('precautions')"
              :feedback-key="getRecordFieldFeedbackKey('precautions')"
              :feedback-open="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('precautions'))"
              :modified="isRecordFieldModified('precautions')"
              :rows="3"
              placeholder="请输入注意事项..."
              :submitted-label="getRecordFieldSubmittedLabel('precautions')"
              :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('precautions')"
              @toggle-feedback="toggleRecommendationFeedback"
              @update:draft="updateRecordFieldDraft"
              @submit-feedback="handleRecordFieldFeedbackSubmit"
            />
          </div>
        </section>

        <section class="vcn-right-panel">
          <div class="decision-card pane-card">
            <div class="section-heading">
              <div class="section-heading-main">
                <h3 class="section-title">诊断建议</h3>
              </div>
              <div class="diagnosis-heading-actions">
                <div v-if="selectedDiagnoses.length > 0" class="section-meta">
                  已纳入 {{ selectedDiagnoses.length }} 项
                  <span v-if="selectedDiagnosis" class="section-meta-strong">主：{{ selectedDiagnosis.name }}</span>
                </div>
                <button
                  class="refresh-recommendation-btn"
                  type="button"
                  title="基于当前病历重新生成诊断建议"
                  :disabled="diagnosisLoading || !canRefreshDiagnosis"
                  @click="handleDiagnosisRefresh"
                >
                  <Icon
                    :icon="diagnosisLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                    :class="{ spin: diagnosisLoading }"
                    size="14"
                    aria-hidden="true"
                  />
                  <span>{{ diagnosisLoading ? '刷新中...' : '刷新诊断' }}</span>
                </button>
              </div>
            </div>

            <div v-if="diagnosisLoading" class="loading-inline">
              <div class="ai-spinner small">
                <div class="spinner-ring"></div>
                <div class="spinner-core"></div>
              </div>
              <span>AI 正在分析...</span>
            </div>

            <ul v-else-if="aiDiagnoses.length > 0" class="vcn-diagnosis-list">
              <DiagnosisRecommendationCard
                v-for="diag in aiDiagnoses"
                :key="diag.code + diag.name"
                :diag="diag"
                :selected="isDiagnosisSelected(diag)"
                :is-primary="isPrimaryDiagnosis(diag)"
                :can-remove="selectedDiagnoses.length > 1"
                :reason-open="activeReasonTooltipKey === getReasonTooltipKey('diagnosis', diag.code, diag.name)"
                :related-open="isRelatedDropdownOpen(diag)"
                :related-diagnoses="getRelatedDropdownCandidates(diag)"
                :issue="getIssueForDiagnosis(diag.code)"
                :show-differential="true"
                :feedback-visible="isRecommendationFeedbackOpen(getDiagnosisFeedbackKey(diag))"
                :feedback-draft="getRecommendationDraft(getDiagnosisFeedbackKey(diag))"
                :feedback-submitting="recommendationSubmittingKey === getDiagnosisFeedbackKey(diag)"
                :submitted-label="getRecommendationSubmittedLabel(getDiagnosisFeedbackKey(diag))"
                @toggle="toggleDiagnosis(diag)"
                @toggle-reason="toggleReasonTooltip(getReasonTooltipKey('diagnosis', diag.code, diag.name), $event)"
                @set-primary="setPrimaryDiagnosis(diag, $event)"
                @remove="removeDiagnosis(diag, $event)"
                @toggle-related="toggleRelatedDropdown(diag, $event)"
                @swap-related="swapDiagnosis(diag, $event)"
                @diagnosis-differential="handleDiagnosisDifferential(diag, $event)"
                @toggle-feedback="toggleRecommendationFeedback(getDiagnosisFeedbackKey(diag), $event)"
                @update:feedback-draft="updateRecommendationDraft(getDiagnosisFeedbackKey(diag), $event)"
                @submit-feedback="handleDiagnosisFeedbackSubmit(diag, $event)"
              >
                <template #actions>
                  <slot name="diagnosis-actions" :diag="diag" />
                </template>
              </DiagnosisRecommendationCard>
            </ul>

            <div v-else class="empty-text">暂无诊断建议</div>
          </div>

          <div class="decision-card pane-card">
            <div class="section-heading treatment-heading">
              <div class="section-heading-main">
                <h3 class="section-title">治疗方案</h3>
              </div>
              <div v-if="allowTreatmentRefresh" class="treatment-heading-actions">
                <button
                  class="refresh-recommendation-btn"
                  type="button"
                  title="基于当前主诊断重新生成治疗方案"
                  :disabled="!selectedDiagnosis || treatmentLoading"
                  @click="handleTreatmentRefresh"
                >
                  <Icon
                    :icon="treatmentLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                    :class="{ spin: treatmentLoading }"
                    size="14"
                    aria-hidden="true"
                  />
                  <span>{{ treatmentLoading ? '刷新中...' : '刷新方案' }}</span>
                </button>
              </div>
            </div>

            <div v-if="allowTreatmentRefresh && treatmentRefreshNeeded && !treatmentLoading" class="refresh-needed-note">
              已切换主诊断，当前方案仍保留上一版；点击“刷新方案”获取当前诊断方案。
            </div>

            <div v-if="treatmentLoading" class="loading-inline">
              <div class="ai-spinner small">
                <div class="spinner-ring"></div>
                <div class="spinner-core"></div>
              </div>
              <span>正在匹配方案...</span>
            </div>

            <template v-else-if="hasTreatments">
              <TreatmentRecommendationSection
                v-for="section in treatmentSections"
                :key="section.type"
                :section="section"
                :selected-count="section.items.filter((item) => item.selected).length"
                :total-count="section.items.length"
                :requires-manual-match-before-select="requiresManualMatchBeforeSelect"
                :get-issue="getTreatmentIssue"
                :get-reason-key="getTreatmentReasonKey"
                :active-reason-key="activeReasonTooltipKey || ''"
                :get-treatment-spec="getTreatmentSpec"
                :get-treatment-match-label="getTreatmentMatchLabel"
                :has-probable-match="hasProbableMatch"
                :get-suggested-match-name="getSuggestedMatchName"
                :get-treatment-original-name="getTreatmentOriginalName"
                :get-editor-key="getTreatmentEditorKey"
                :is-pharmacy-required="isPharmacyRequired"
                :get-pharmacy-display="getPharmacyDisplay"
                :has-required-pharmacy="hasRequiredPharmacy"
                :is-exec-dept-required="isExecDeptRequired"
                :get-exec-dept-display="getExecDeptDisplay"
                :has-required-exec-dept="hasRequiredExecDept"
                :get-body-site-display="treatmentGates.getBodySiteDisplay"
                :has-required-body-site="hasRequiredBodySite"
                :frequency-options="frequencyOptions"
                :route-options="routeOptions"
                :should-show-treatment-editor="shouldShowTreatmentEditor"
                :should-show-editor-toggle="shouldShowTreatmentEditorToggle"
                :is-treatment-editor-expanded="isTreatmentEditorExpanded"
                :is-editable-field-active="isEditableFieldActive"
                :get-editable-field-key="getEditableFieldKey"
                :get-medicine-field-display="getMedicineFieldDisplay"
                :get-medicine-inline-summary="getMedicineCollapsedSummary"
                :is-medicine-inventory-checking="isMedicineInventoryChecking"
                :get-medicine-inventory-warning="getMedicineInventoryWarning"
                :is-secondary-selector-open="isSecondarySelectorOpen"
                :get-pharmacy-search-keyword="getPharmacySearchKeyword"
                :get-filtered-pharmacy-options="getFilteredPharmacyOptionsForRecord"
                :get-exec-dept-search-keyword="getExecDeptSearchKeyword"
                :get-filtered-exec-dept-options="getFilteredExecDeptOptionsForRecord"
                :get-body-site-search-keyword="getBodySiteSearchKeyword"
                :get-filtered-body-site-options="getFilteredBodySiteOptionsForRecord"
                :get-insurance-search-keyword="getInsuranceSearchKeyword"
                :get-filtered-insurance-options="getFilteredInsuranceOptionsForRecord"
                :is-manual-match-open="isManualMatchOpen"
                :get-manual-match-keyword="getManualMatchKeyword"
                :get-manual-match-candidates="getManualMatchPickerCandidates"
                :is-feedback-open="isTreatmentFeedbackOpen"
                :get-feedback-draft="getTreatmentFeedbackDraft"
                :is-feedback-submitting="isTreatmentFeedbackSubmitting"
                :get-feedback-submitted-label="getTreatmentFeedbackSubmittedLabel"
                @toggle="toggleTreatment"
                @toggle-reason="(rec, event) => toggleReasonTooltip(getTreatmentReasonKey(rec), event)"
                @confirm-match="confirmSuggestedMatch"
                @toggle-feedback="(rec, event) => toggleRecommendationFeedback(getTreatmentFeedbackKey(rec), event)"
                @update-feedback-draft="(rec, draft) => updateRecommendationDraft(getTreatmentFeedbackKey(rec), draft)"
                @submit-feedback="handleTreatmentFeedbackSubmit"
                @toggle-treatment-editor="toggleTreatmentEditor"
                @activate-editable-field="activateEditableField"
                @editable-field-blur="handleEditableFieldBlur"
                @register-editable-field-element="registerEditableFieldElement"
                @total-qty-input="handleTotalQtyInput"
                @frequency-open-change="handleFrequencyOpenChange"
                @route-open-change="handleRouteOpenChange"
                @usage-field-change="handleUsageFieldChange"
                @open-pharmacy="openPharmacyQuickSelector"
                @open-exec-dept="openExecDeptQuickSelector"
                @open-body-site="openBodySiteQuickSelector"
                @open-insurance="openInsuranceQuickSelector"
                @close-secondary-selector="closeSecondarySelector"
                @update-pharmacy-keyword="handlePharmacySearchInput"
                @select-pharmacy="selectPharmacyOption"
                @clear-pharmacy="clearPharmacySelection"
                @update-exec-dept-keyword="handleExecDeptSearchInput"
                @select-exec-dept="selectExecDeptOption"
                @clear-exec-dept="clearExecDeptSelection"
                @update-body-site-keyword="handleBodySiteSearchInput"
                @select-body-site="selectBodySiteOption"
                @clear-body-site="clearBodySiteSelection"
                @update-insurance-keyword="handleInsuranceSearchInput"
                @select-insurance="selectInsuranceOption"
                @clear-insurance="clearInsuranceSelection"
                @toggle-manual-match="toggleManualMatch"
                @update-manual-match-keyword="setManualMatchKeyword"
                @select-manual-match-candidate="handleManualMatchPickerSelect"
              />
            </template>

            <div v-else class="empty-text">{{ displayedTreatmentEmptyText }}</div>
          </div>
        </section>
      </div>

    </div>
    </div>

    <div class="voice-footer">
      <button
        v-if="secondaryFooterActionText"
        class="footer-secondary-btn"
        type="button"
        :disabled="secondaryFooterActionDisabled || isWritebackBusy"
        @click="emit('secondary-footer-action')"
      >
        {{ secondaryFooterActionText }}
      </button>
      <button
        class="footer-submit-btn"
        type="button"
        :disabled="!canSubmit"
        :aria-busy="isWritebackBusy"
        @click="handleBatchWriteBack"
      >
        {{ submitButtonText }}
      </button>
      <button class="footer-cancel-btn" type="button" :disabled="isWritebackBusy" @click="handleCancelClick">放弃</button>
    </div>

    <Teleport to="body">
      <div v-if="showSessionFeedbackDialog" class="confirm-overlay session-feedback-overlay" @click.self="completeVoiceConsultationFlow">
        <div class="session-feedback-dialog pane-card" @click.stop>
          <div class="session-feedback-dialog-head">
            <div>
              <h3 class="confirm-dialog-title">本次结果已回写成功</h3>
              <p class="confirm-dialog-text">如有时间，请将您的使用体验反馈给我们，我们会及时处理并改善！</p>
            </div>
            <button class="session-feedback-skip" type="button" @click="completeVoiceConsultationFlow">暂不反馈</button>
          </div>

          <VoiceSessionFeedbackBar
            :draft="getSessionFeedbackDraft()"
            :submitting="sessionSubmitting"
            :submitted-at="sessionSubmittedAt"
            @update:draft="updateSessionDraft($event)"
            @submit="handleSessionFeedbackSubmit"
          />
        </div>
      </div>
    </Teleport>

    <div v-if="showCancelConfirm" class="confirm-overlay" @click.self="closeCancelConfirm">
      <div class="confirm-dialog pane-card" role="dialog" aria-modal="true" aria-labelledby="voice-cancel-title">
        <div class="confirm-dialog-body">
          <p id="voice-cancel-title" class="confirm-dialog-title">{{ cancelDialogTitle }}</p>
          <p class="confirm-dialog-text">{{ cancelDialogText }}</p>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-btn secondary" type="button" @click="closeCancelConfirm">继续编辑</button>
          <button class="confirm-btn danger" type="button" @click="confirmCancel">确认放弃</button>
        </div>
      </div>
    </div>

    <div v-if="showChecklistModal" class="confirm-overlay checklist-overlay" @click.self="closeChecklistModal">
      <div class="checklist-dialog pane-card" role="dialog" aria-modal="true" aria-labelledby="voice-checklist-title">
        <div class="checklist-dialog-head">
          <div>
            <p id="voice-checklist-title" class="confirm-dialog-title">鉴别排查确认</p>
            <p class="checklist-dialog-subtitle">{{ activeChecklistDiagnosis?.name || '当前诊断' }}</p>
          </div>
          <button class="checklist-close-btn" type="button" aria-label="关闭" @click="closeChecklistModal">
            <Icon icon="lucide:x" size="18" />
          </button>
        </div>

        <div v-if="isChecklistLoading" class="loading-inline checklist-loading">
          <div class="ai-spinner small">
            <div class="spinner-ring"></div>
            <div class="spinner-core"></div>
          </div>
          <span>正在生成鉴别排查建议...</span>
        </div>

        <div v-else-if="checklistGenerationError" class="checklist-critical-error">
          {{ checklistGenerationError }}
        </div>

        <div v-else-if="checklistItems.length > 0" class="checklist-dialog-body">
          <p class="checklist-intro">
            为防止诊断与病历不匹配或高危疾病漏诊，系统建议进一步复核以下要点：
          </p>
          <div class="checklist-items">
            <div v-for="(item, index) in checklistItems" :key="`${index}-${item.question}`" class="checklist-item-label">
              <span class="checklist-text">{{ item.question }}</span>
              <span v-if="item.recordText" class="checklist-record-text">{{ item.recordText }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-text checklist-empty">当前诊断暂无需要复核或鉴别排查的提示。</div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../features/consultation-result/ui/ClinicalResultEditor.css"></style>

<style scoped>
.checklist-critical-error {
  padding: 12px 14px;
  border: 1px solid rgba(207, 74, 60, 0.24);
  border-radius: 12px;
  background: var(--voice-danger-soft);
  color: var(--voice-danger);
  line-height: 1.6;
}
</style>
