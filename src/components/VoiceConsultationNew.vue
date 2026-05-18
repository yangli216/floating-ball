<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import VoiceRecordFeedbackPopover from './VoiceRecordFeedbackPopover.vue';
import VoiceSessionFeedbackBar from './VoiceSessionFeedbackBar.vue';
import PatientHeader from './PatientHeader.vue';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { getHisAdapter } from '../services/his';
import type { PharmacyOption } from '../services/his';
import { medicalDataService, type DiagnosisItem } from '../services/medicalData';
import {
  clearVoiceConsultationCache,
  updateVoiceConsultationCache,
  getVoiceConsultationEditorSnapshot,
  type VoiceEditorSnapshot,
} from '../composables/useVoiceConsultation';
import { useVoiceFeedback } from '../composables/useVoiceFeedback';
import {
  checkDiagnosis,
  checkMedicine,
  checkExamination,
  isReviewerEnabled,
  type FactCheckIssue,
  type FactCheckResult,
} from '../services/factChecker';
import {
  getVoiceDiagnosisFeedbackKey,
  getVoiceRecordFieldFeedbackKey,
  getVoiceRecordFieldLabel,
  getVoiceTreatmentFeedbackKey,
  mapTreatmentTypeToRecommendationType,
  mapTreatmentTypeToTargetType,
} from '../services/voiceFeedback';
import {
  buildConsultationSelectionSnapshot,
  buildConsultationUserLogSnapshot,
  submitConsultationUserLog,
  computeChangeSummary,
} from '../services/consultationUserLog';
import type { ConsultationUserLogSnapshot } from '../services/consultationUserLog';
import type { TreatmentRecommendation, Diagnosis } from '../types/consultation';
import type { AppPatient } from '../types/appState';
import type { VoiceIntentResult, MatchedTreatment, MatchedDiagnosis } from '../composables/useVoiceIntentRecognition';
import {
  buildDiagList as buildSharedDiagList,
  buildOrderListItem as buildSharedOrderListItem,
  getMatchedOrderServiceId,
} from '../utils/recordConfirmedPayload';
import {
  normalizeUsageKeyword,
  createUsageOption,
  dedupeUsageOptions,
  type UsageOption,
} from '../utils/medicalDictionaryHelpers';
import {
  splitDosageAndUnit,
  inferFrequencyFromText as inferFrequencyFromTextPure,
  inferRouteFromText as inferRouteFromTextPure,
} from '../utils/treatmentInference';
import { resolvePatientAge, resolvePatientGender, resolvePatientName } from '../utils/patientProfile';
import { getPatientContextAnchorId } from '../utils/patientContext';
import { useMedicalDictionaries } from '../composables/useMedicalDictionaries';
import { useTreatmentNormalization } from '../composables/useTreatmentNormalization';
import { useTreatmentGates } from '../composables/useTreatmentGates';
import { useTreatmentHydration } from '../composables/useTreatmentHydration';
import { useSecondarySelector, type SecondarySelectorField } from '../composables/useSecondarySelector';
import { useBodySiteOptions } from '../composables/useBodySiteOptions';
import ManualMatchPicker, { type ManualMatchCandidate } from './ManualMatchPicker.vue';
import DiagnosisRecommendationCard from './DiagnosisRecommendationCard.vue';
import TreatmentRecommendationCard from './TreatmentRecommendationCard.vue';
import TreatmentItemEditor from './TreatmentItemEditor.vue';
import {
  assessTreatmentCatalogMatch,
  buildDiagnosisFeedbackSnapshot as buildSharedDiagnosisFeedbackSnapshot,
  buildTreatmentFeedbackSnapshot,
  getReasonTooltipKey,
  getSuggestedMatchName,
  getTreatmentMatchLabel as getSharedTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentSpec,
  hasProbableMatch,
} from '../features/clinical-result/recommendationHelpers';
import {
  applyManualMatchCandidate,
  findManualMatchCandidates,
  getManualMatchKey,
  type ManualMatchRawCandidate,
  toManualMatchCandidateView,
} from '../features/clinical-result/manualMatch';
import type {
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
  VoiceRecommendationFeedbackDraft,
  VoiceSessionFeedbackDraft,
} from '../types/voiceFeedback';

type ReferenceLifecycleStatus = 'pending' | 'success' | 'failed';

interface ReferenceFeedbackPayload {
  consultationId?: string;
  requestId: string;
  referenceType?: 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure' | 'batch';
  action?: 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure' | 'batch';
  status: ReferenceLifecycleStatus;
  message?: string;
  timestamp?: number;
}

const props = withDefaults(defineProps<{
  initialPatientData?: AppPatient;
  intentResult: VoiceIntentResult | null;
  channel?: 'voice' | 'symptom';
  showPatientHeader?: boolean;
  /**
   * intentResult 的来源。
   * - 'llm'：本次 LLM 刚刚解析出的全新结果，不叠加 editorSnapshot
   * - 'cache'：从同就诊缓存恢复，需叠加 editorSnapshot 还原现场
   * - null/undefined：未明确，默认不叠加
   */
  intentSource?: 'llm' | 'cache' | null;
  secondaryFooterActionText?: string;
  secondaryFooterActionDisabled?: boolean;
}>(), {
  channel: 'voice',
  showPatientHeader: true,
  intentSource: null,
  secondaryFooterActionText: '',
  secondaryFooterActionDisabled: false,
});

const emit = defineEmits(['close', 'cancel', 'secondary-footer-action']);

const showToast = inject<(msg: string, type?: string) => void>('showToast');

const chiefComplaint = ref('');
const historyOfPresentIllness = ref('');
const pastMedicalHistory = ref('');
const familyHistory = ref('');
const initialRecordSnapshot = ref<Record<VoiceRecordFieldKey, string>>({
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastMedicalHistory: '',
  familyHistory: '',
});

const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const selectedDiagnosisKeys = ref<Set<string>>(new Set());
const diagnosisLoading = ref(false);

const treatments = ref<TreatmentRecommendation[]>([]);
const treatmentLoading = ref(false);

const submitting = ref(false);
const waitingWritebackFeedback = ref(false);
const pendingWritebackRequestId = ref('');
const pendingWritebackMessage = ref('');
const lastWritebackFeedback = ref<ReferenceFeedbackPayload | null>(null);
let unlistenReferenceFeedback: (() => void) | null = null;
const consultationChannel = computed<'voice' | 'symptom'>(() => props.channel === 'symptom' ? 'symptom' : 'voice');
const consultationUserLogType = computed(() => consultationChannel.value === 'voice' ? 'voice' as const : 'smart' as const);
const shouldUseVoiceCache = computed(() => consultationChannel.value === 'voice');
const shouldShowPatientHeader = computed(() => props.showPatientHeader !== false);
const showCancelConfirm = ref(false);
const firstUserLogSnapshot = ref<ConsultationUserLogSnapshot | null>(null);
const cancelDialogTitle = computed(() => consultationChannel.value === 'voice' ? '确认放弃当前语音结果？' : '确认放弃当前问诊结果？');
const cancelDialogText = computed(() => consultationChannel.value === 'voice'
  ? '放弃后将清空当前未提交的语音结果，并退回小球状态。'
  : '放弃后将清空当前未提交的问诊结果，并退回小球状态。');

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const patientName = computed((): string => resolvePatientName(props.initialPatientData));
const patientGender = computed((): string => resolvePatientGender(props.initialPatientData));
const patientAge = computed((): string => resolvePatientAge(props.initialPatientData));
const patientTetId = computed((): string => s(props.initialPatientData?.idTet));
const consultationId = computed((): string => resolveConsultationId());
const isWritebackBusy = computed(() => submitting.value || waitingWritebackFeedback.value);
const submitButtonText = computed(() => {
  if (submitting.value) return '提交中...';
  if (waitingWritebackFeedback.value) return '等待 HIS 回执...';
  return '一键回写';
});
const writebackBannerTone = computed<'info' | 'error'>(() => {
  if (waitingWritebackFeedback.value) return 'info';
  if (lastWritebackFeedback.value?.status === 'failed') return 'error';
  return 'info';
});
const writebackBannerText = computed(() => {
  if (waitingWritebackFeedback.value) {
    return pendingWritebackMessage.value || '病历已发送至 HIS，等待处理结果回执。';
  }
  if (lastWritebackFeedback.value?.status === 'failed') {
    return lastWritebackFeedback.value.message || 'HIS 回写失败，请根据提示修改后重试。';
  }
  return '';
});

function getDiagnosisKey(diag: Diagnosis | null | undefined): string {
  if (!diag) return '';
  return `${diag.id || ''}|${diag.code || ''}|${diag.name || ''}`;
}

const selectedDiagnoses = computed(() => aiDiagnoses.value.filter((diag) => selectedDiagnosisKeys.value.has(getDiagnosisKey(diag))));
const selectedTreatments = computed(() => treatments.value.filter((item) => item.selected));
const treatmentRefreshNeeded = computed(() => {
  const currentIdentity = getDiagnosisIdentity(selectedDiagnosis.value);
  if (!currentIdentity || suppressDiagnosisTreatmentRefetch.value) {
    return false;
  }
  return currentIdentity !== lastTreatmentDiagnosisKey.value;
});
const treatmentEmptyText = computed(() => {
  if (!selectedDiagnosis.value) {
    return '请先选择诊断';
  }
  if (treatmentRefreshNeeded.value || !lastTreatmentDiagnosisKey.value) {
    return '当前诊断暂无已加载的治疗方案，请点击上方刷新方案';
  }
  return '暂无治疗建议';
});

function getDefaultPharmacyOption(rec?: TreatmentRecommendation): PharmacyOption | undefined {
  if (rec) {
    const candidates = getCandidatePharmaciesForMedicine(rec);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return pharmacyOptions.value[0];
}

function getMatchedMedicineStoreIds(rec: TreatmentRecommendation): string[] {
  return treatmentGates.getMatchedMedicineStoreIds(rec);
}

function ensureMedicineDefaultPharmacy(rec: TreatmentRecommendation): void {
  if (rec.type !== 'medicine' || (rec.pharmacy || '').trim()) {
    return;
  }

  const raw = getMatchedItemRaw(rec);
  if (raw?.__medicineDetailLoaded !== true) {
    return;
  }

  const allowed = getCandidatePharmaciesForMedicine(rec);
  const detailStoreId = readFirstString(raw, ['idSto']);
  const matchedPharmacy = allowed.find((option) => option.idSto === detailStoreId) || allowed[0];
  if (matchedPharmacy?.name) {
    rec.pharmacy = matchedPharmacy.name;
  }
}

function findMatchedPharmacyOption(rec: TreatmentRecommendation, currentValue?: string): PharmacyOption | undefined {
  const normalizedValue = (currentValue || '').trim();
  if (!normalizedValue) {
    return undefined;
  }

  const allowed = rec.type === 'medicine'
    ? getCandidatePharmaciesForMedicine(rec)
    : pharmacyOptions.value;

  return allowed.find((option) => option.name === normalizedValue || option.idSto === normalizedValue)
    || pharmacyOptions.value.find((option) => option.name === normalizedValue || option.idSto === normalizedValue);
}

function getNormalizedPharmacyValue(rec: TreatmentRecommendation): string {
  const currentValue = (rec.pharmacy || '').trim();
  if (!currentValue) {
    return '';
  }

  return findMatchedPharmacyOption(rec, currentValue)?.name || currentValue;
}

function normalizeMedicinePharmacyValue(rec: TreatmentRecommendation): void {
  if (rec.type !== 'medicine') {
    return;
  }

  const currentValue = (rec.pharmacy || '').trim();
  if (!currentValue) {
    return;
  }

  const normalizedValue = getNormalizedPharmacyValue(rec);
  if (normalizedValue && normalizedValue !== currentValue) {
    rec.pharmacy = normalizedValue;
  }
}

function normalizeMedicinePharmacyValues(items: TreatmentRecommendation[]): void {
  items.forEach((item) => {
    normalizeMedicinePharmacyValue(item);
  });
}

// 库存校验状态 / 药品详情 hydrate / 库存检查均迁移到共享 `useTreatmentHydration`，
// 实例化在 `treatmentNormalization` 之后（依赖 pharmacyOptions / treatmentGates / 字典查找函数）。
// 这里仅保留对外暴露的解构变量名（hydration.* -> 同名函数），call site 不变。

const getPatientAnchorId = (): string => {
  return getPatientContextAnchorId(props.initialPatientData);
};

const resolveConsultationId = (): string => getPatientAnchorId() || 'unknown';

// ---- 编辑器快照（用于跨会话恢复全部病历，避免重新调 fetchAITreatment） ----

/**
 * 把当前编辑器最新状态写回缓存的 editorSnapshot。
 * 节流到 600ms，避免输入时频繁写 localStorage。
 */
let snapshotPersistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistEditorSnapshot(): void {
  if (suppressDiagnosisTreatmentRefetch.value) return;
  if (!shouldUseVoiceCache.value) return;
  if (!props.initialPatientData) return;
  if (snapshotPersistTimer) clearTimeout(snapshotPersistTimer);
  snapshotPersistTimer = setTimeout(() => {
    snapshotPersistTimer = null;
    const snapshot: VoiceEditorSnapshot = {
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
      pastMedicalHistory: pastMedicalHistory.value,
      familyHistory: familyHistory.value,
      treatments: treatments.value as unknown[],
      diagnoses: aiDiagnoses.value as unknown[],
      selectedDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
      treatmentDiagnosisKey: lastTreatmentDiagnosisKey.value,
    };
    updateVoiceConsultationCache(props.initialPatientData, snapshot);
  }, 600);
}

/**
 * 立即写回（不节流），用于完成 fetchAITreatment 之后等关键节点。
 */
function persistEditorSnapshotImmediate(): void {
  if (!shouldUseVoiceCache.value) return;
  if (!props.initialPatientData) return;
  if (snapshotPersistTimer) {
    clearTimeout(snapshotPersistTimer);
    snapshotPersistTimer = null;
  }
  updateVoiceConsultationCache(props.initialPatientData, {
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
    pastMedicalHistory: pastMedicalHistory.value,
    familyHistory: familyHistory.value,
    treatments: treatments.value as unknown[],
    diagnoses: aiDiagnoses.value as unknown[],
    selectedDiagnosisIdentity: getDiagnosisIdentity(selectedDiagnosis.value),
    treatmentDiagnosisKey: lastTreatmentDiagnosisKey.value,
  });
}

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
  if (typeof snapshot.familyHistory === 'string') {
    familyHistory.value = snapshot.familyHistory;
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
    void hydrateMatchedMedicalItemDetails(treatments.value);
    console.info('[VoiceConsultationNew] Applied editor snapshot from cache', {
      treatmentCount: treatments.value.length,
      diagnosisIdentity: lastTreatmentDiagnosisKey.value,
    });
  }
}

function normalizeAnalysisText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .replace(/^(分析依据|模型分析|医生口述诊断|医生口述)[:：\s]*/u, '')
    .trim();
}

function truncateAnalysisText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

const canSubmit = computed(() => chiefComplaint.value.trim().length > 0 && selectedDiagnosis.value !== null && selectedDiagnoses.value.length > 0 && !isWritebackBusy.value);

function handleCancelClick(): void {
  if (submitting.value) {
    showToast?.('正在提交中，请稍候', 'info');
    return;
  }

  if (waitingWritebackFeedback.value) {
    showToast?.('正在等待 HIS 回执，请先等待处理结果。', 'info');
    return;
  }

  showCancelConfirm.value = true;
}

function closeCancelConfirm(): void {
  showCancelConfirm.value = false;
}

function confirmCancel(): void {
  showCancelConfirm.value = false;
  clearVoiceFeedbackDraft();
  submitVoiceAbandonedUserLog();
  emit('cancel');
}

const expandedTreatmentEditors = ref<Set<string>>(new Set());
const lastTreatmentDiagnosisKey = ref('');
const suppressDiagnosisTreatmentRefetch = ref(false);
const activeReasonTooltipKey = ref<string | null>(null);
const activeEditableFieldKey = ref<string | null>(null);
const editableFieldElements = new Map<string, HTMLInputElement | HTMLSelectElement>();
const frequencySearchKeywords = ref<Record<string, string>>({});
const routeSearchKeywords = ref<Record<string, string>>({});
const activeManualMatchKey = ref<string | null>(null);
const manualMatchKeywords = ref<Record<string, string>>({});
const activeFeedbackPopoverKey = ref<string | null>(null);
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
  familyHistory,
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
  return getVoiceDiagnosisFeedbackKey(diag);
}

function getTreatmentFeedbackKey(rec: TreatmentRecommendation): string {
  return getVoiceTreatmentFeedbackKey(rec);
}

function getRecommendationDraft(recommendationKey: string): VoiceRecommendationFeedbackDraft {
  return ensureRecommendationDraft(recommendationKey);
}

function getSessionFeedbackDraft(): VoiceSessionFeedbackDraft {
  return sessionDraft.value;
}

function getRecordFieldFeedbackKey(fieldKey: VoiceRecordFieldKey): string {
  return getVoiceRecordFieldFeedbackKey(fieldKey);
}

function getRecordFieldValue(fieldKey: VoiceRecordFieldKey): string {
  switch (fieldKey) {
    case 'chiefComplaint':
      return chiefComplaint.value;
    case 'historyOfPresentIllness':
      return historyOfPresentIllness.value;
    case 'pastMedicalHistory':
      return pastMedicalHistory.value;
    case 'familyHistory':
      return familyHistory.value;
    default:
      return '';
  }
}

function getRecordFieldDraft(fieldKey: VoiceRecordFieldKey): VoiceRecordFieldFeedbackDraft {
  return ensureRecordFieldDraft(fieldKey);
}

function getRecordFieldSubmittedLabel(fieldKey: VoiceRecordFieldKey): string {
  return recordFieldSubmittedMap.value[getRecordFieldFeedbackKey(fieldKey)]?.actionLabel || '';
}

function isRecordFieldModified(fieldKey: VoiceRecordFieldKey): boolean {
  return (initialRecordSnapshot.value[fieldKey] || '').trim() !== getRecordFieldValue(fieldKey).trim();
}

function getRecommendationSubmittedLabel(recommendationKey: string): string {
  return recommendationSubmittedMap.value[recommendationKey]?.actionLabel || '';
}

function isRecommendationFeedbackOpen(recommendationKey: string): boolean {
  return activeFeedbackPopoverKey.value === recommendationKey;
}

function toggleRecommendationFeedback(recommendationKey: string, event?: Event): void {
  event?.stopPropagation();
  activeFeedbackPopoverKey.value = activeFeedbackPopoverKey.value === recommendationKey ? null : recommendationKey;
}

function buildDiagnosisFeedbackSnapshot(diag: Diagnosis): Record<string, unknown> {
  return buildSharedDiagnosisFeedbackSnapshot(diag, {
    selected: isDiagnosisSelected(diag),
    primary: isPrimaryDiagnosis(diag),
  });
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

function submitVoiceGeneratedUserLog(): void {
  const snapshot = buildVoiceUserLogSnapshot();
  firstUserLogSnapshot.value = snapshot;
  void submitConsultationUserLog({
    consultationId: consultationId.value,
    consultationType: consultationUserLogType.value,
    patient: props.initialPatientData || null,
    firstSnapshot: snapshot,
  });
}

function submitVoiceFinalUserLog(): void {
  const finalSnapshot = buildVoiceUserLogSnapshot();
  const changeSummary = firstUserLogSnapshot.value
    ? computeChangeSummary(firstUserLogSnapshot.value, finalSnapshot, {
        pastMedicalHistoryChanged: isRecordFieldModified('pastMedicalHistory'),
        familyHistoryChanged: isRecordFieldModified('familyHistory'),
      })
    : undefined;
  void submitConsultationUserLog({
    consultationId: consultationId.value,
    consultationType: consultationUserLogType.value,
    patient: props.initialPatientData || null,
    finalSnapshot,
    selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
    changeSummary,
  });
}

function submitVoiceAbandonedUserLog(): void {
  const finalSnapshot = buildVoiceUserLogSnapshot();
  const changeSummary = firstUserLogSnapshot.value
    ? computeChangeSummary(firstUserLogSnapshot.value, finalSnapshot, {
        pastMedicalHistoryChanged: isRecordFieldModified('pastMedicalHistory'),
        familyHistoryChanged: isRecordFieldModified('familyHistory'),
      })
    : undefined;
  void submitConsultationUserLog({
    consultationId: consultationId.value,
    consultationType: consultationUserLogType.value,
    patient: props.initialPatientData || null,
    finalSnapshot,
    selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
    changeSummary,
    abandoned: true,
  });
}

async function handleDiagnosisFeedbackSubmit(diag: Diagnosis, draft: VoiceRecommendationFeedbackDraft): Promise<void> {
  const recommendationKey = getDiagnosisFeedbackKey(diag);
  try {
    await submitRecommendationFeedback({
      recommendationKey,
      recommendationTitle: diag.name,
      draft,
      snapshot: buildDiagnosisFeedbackSnapshot(diag),
      fallbackTargetType: 'diagnosis',
      fallbackRecommendationType: 'diagnosis',
    });
    activeFeedbackPopoverKey.value = null;
    showToast?.('诊断反馈已记录', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交反馈失败: ${message}`, 'error');
  }
}

async function handleTreatmentFeedbackSubmit(rec: TreatmentRecommendation, draft: VoiceRecommendationFeedbackDraft): Promise<void> {
  const recommendationKey = getTreatmentFeedbackKey(rec);
  try {
    await submitRecommendationFeedback({
      recommendationKey,
      recommendationTitle: rec.name,
      draft,
      snapshot: buildTreatmentFeedbackSnapshot(rec),
      fallbackTargetType: mapTreatmentTypeToTargetType(rec.type),
      fallbackRecommendationType: mapTreatmentTypeToRecommendationType(rec.type),
    });
    activeFeedbackPopoverKey.value = null;
    showToast?.('推荐反馈已记录', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交反馈失败: ${message}`, 'error');
  }
}

async function handleRecordFieldFeedbackSubmit(fieldKey: VoiceRecordFieldKey, draft: VoiceRecordFieldFeedbackDraft): Promise<void> {
  try {
    await submitRecordFieldFeedback({
      fieldKey,
      draft,
      originalValue: initialRecordSnapshot.value[fieldKey] || '',
      currentValue: getRecordFieldValue(fieldKey),
    });
    activeFeedbackPopoverKey.value = null;
    showToast?.(`${getVoiceRecordFieldLabel(fieldKey)}反馈已记录`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交反馈失败: ${message}`, 'error');
  }
}

async function handleSessionFeedbackSubmit(): Promise<void> {
  try {
    await submitSessionFeedback({
      diagnoses: selectedDiagnoses.value,
      selectedTreatments: selectedTreatments.value,
    });
    showToast?.('整页反馈已记录', 'success');
    completeVoiceConsultationFlow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast?.(`提交整页反馈失败: ${message}`, 'error');
  }
}

function completeVoiceConsultationFlow(): void {
  showSessionFeedbackDialog.value = false;
  clearVoiceFeedbackDraft();
  lastWritebackFeedback.value = null;
  emit('close');
}

function resetWritebackState(): void {
  waitingWritebackFeedback.value = false;
  pendingWritebackRequestId.value = '';
  pendingWritebackMessage.value = '';
  lastWritebackFeedback.value = null;
}

function applyWritebackFeedback(payload: ReferenceFeedbackPayload): void {
  if (!pendingWritebackRequestId.value || payload.requestId !== pendingWritebackRequestId.value) {
    return;
  }

  const safePayload: ReferenceFeedbackPayload = {
    ...payload,
    action: payload.referenceType || payload.action || 'batch',
    referenceType: payload.referenceType || payload.action || 'batch',
    timestamp: payload.timestamp || Date.now(),
  };
  lastWritebackFeedback.value = safePayload;
  waitingWritebackFeedback.value = false;
  pendingWritebackRequestId.value = '';
  pendingWritebackMessage.value = '';

  if (safePayload.status === 'success') {
    submitVoiceFinalUserLog();
    if (shouldUseVoiceCache.value) {
      clearVoiceConsultationCache(props.initialPatientData);
    }
    showToast?.(safePayload.message || 'HIS 已完成回写。', 'success');
    showSessionFeedbackDialog.value = true;
    return;
  }

  showToast?.(safePayload.message || 'HIS 回写失败，请根据提示修改后重试。', 'error');
}

type MedicinePrimaryField = 'dosage' | 'frequency' | 'route' | 'total';

function buildEncounterSummary(): string {
  const complaint = truncateAnalysisText(normalizeAnalysisText(chiefComplaint.value), 24);
  const history = truncateAnalysisText(normalizeAnalysisText(historyOfPresentIllness.value), 32);

  if (complaint && history) return `结合主诉“${complaint}”及现病史“${history}”`;
  if (complaint) return `结合主诉“${complaint}”`;
  if (history) return `结合现病史“${history}”`;
  return '结合当前问诊信息';
}

function buildDiagnosisRationale(matchedDiagnosis: MatchedDiagnosis, displayName: string): string {
  const summary = buildEncounterSummary();
  const evidenceText = normalizeAnalysisText(matchedDiagnosis.evidenceText || '').replace(/[。；;，,]+$/u, '');
  const rationaleText = normalizeAnalysisText(matchedDiagnosis.rationale || '').replace(/[。；;，,]+$/u, '');
  const sourceText = matchedDiagnosis.sourceType === 'inferred'
    ? '该诊断为模型结合完整对话推断得出'
    : matchedDiagnosis.sourceType === 'uncertain'
      ? '该诊断为信息不足时的谨慎提示'
      : '该诊断在对话中有明确依据';
  const matchNote = matchedDiagnosis.matchedItem ? '' : '当前标准库中暂未匹配到完全一致的诊断条目，需人工确认。';
  const rationaleBody = rationaleText || `${sourceText}，建议结合查体和必要检查进一步确认。`;
  if (evidenceText) {
    return `${summary}，模型初步考虑${displayName}，依据为“${evidenceText}”。${rationaleBody}${matchNote}`;
  }
  return `${summary}，模型初步考虑${displayName}。${rationaleBody}${matchNote}`;
}

function buildTreatmentReason(item: MatchedTreatment, name: string): string {
  const summary = buildEncounterSummary();
  const normalizedBasis = normalizeAnalysisText(item.evidenceText || item.text || '').replace(/[。；;，,]+$/u, '');
  const goalText = normalizeAnalysisText(item.goal || '').replace(/[。；;，,]+$/u, '');

  if (item.type === 'medicine' && isConditionalMedicine(item)) {
    return `${summary}，${name}属于需结合检验或后续评估再决定的条件性用药，当前不建议默认纳入处方。${normalizedBasis ? `依据：${normalizedBasis}。` : ''}`;
  }

  if (item.type === 'medicine' && isHistoricalSelfMedication(item)) {
    return `${summary}，${name}主要来自患者已自行服药信息，当前更适合作为用药史参考，不默认继续纳入处方。${normalizedBasis ? `依据：${normalizedBasis}。` : ''}`;
  }

  const sourceText = item.sourceType === 'inferred'
    ? '该项为模型结合病情补全的建议'
    : item.sourceType === 'uncertain'
      ? '该项为信息不足时的谨慎提示'
      : '该项在对话中有明确依据';
  if (normalizedBasis && goalText) {
    return `${summary}，模型建议将${name}纳入当前处理方案，主要依据是${normalizedBasis}，处理目标为${goalText}。${sourceText}。`;
  }
  if (normalizedBasis) {
    return `${summary}，模型建议将${name}纳入当前处理方案，主要依据是${normalizedBasis}。${sourceText}。`;
  }
  if (goalText) {
    return `${summary}，模型建议将${name}纳入当前处理方案，处理目标为${goalText}。${sourceText}。`;
  }
  return `${summary}，模型建议将${name}纳入当前处理方案。${sourceText}。`;
}

function getTreatmentEvidenceCorpus(item: Pick<MatchedTreatment, 'name' | 'evidenceText' | 'text' | 'goal'>): string {
  return normalizeAnalysisText([item.name, item.evidenceText, item.text, item.goal].filter(Boolean).join(' '));
}

function isConditionalMedicine(item: MatchedTreatment): boolean {
  const corpus = getTreatmentEvidenceCorpus(item);
  return /如果|若|待|查完|结果出来|结果回报|明确后|必要时|再用|再考虑|细菌感染就|病毒感染就|视情况/u.test(corpus);
}

function isHistoricalSelfMedication(item: MatchedTreatment): boolean {
  const corpus = getTreatmentEvidenceCorpus(item);
  return /吃了|已服用|已经服用|自行服用|自服|服用过|在家服用|院外已用/u.test(corpus);
}

function shouldAutoSelectTreatment(item: MatchedTreatment): boolean {
  if (!item.matchedItem) {
    return false;
  }

  if (item.type !== 'medicine') {
    return item.sourceType !== 'uncertain';
  }

  if (item.sourceType === 'uncertain') {
    return false;
  }

  if (isConditionalMedicine(item) || isHistoricalSelfMedication(item)) {
    return false;
  }

  return true;
}

function getTreatmentEditorKey(rec: TreatmentRecommendation): string {
  return `editor:${rec.type}:${rec.matchedItem?.id || rec.name}`;
}

function getEditableFieldKey(rec: TreatmentRecommendation, field: MedicinePrimaryField): string {
  return `${getTreatmentEditorKey(rec)}:${field}`;
}

function getDiagnosisIdentity(diag: Diagnosis | null): string {
  if (!diag) return '';
  return `${diag.code || ''}:${diag.name || ''}`;
}

function isDiagnosisSelected(diag: Diagnosis): boolean {
  return selectedDiagnosisKeys.value.has(getDiagnosisKey(diag));
}

function isPrimaryDiagnosis(diag: Diagnosis): boolean {
  return getDiagnosisKey(selectedDiagnosis.value) === getDiagnosisKey(diag);
}

function setDiagnosisSelection(keys: Iterable<string>): void {
  selectedDiagnosisKeys.value = new Set(Array.from(keys).filter(Boolean));
}

function syncPrimaryDiagnosis(preferred?: Diagnosis | null): void {
  const preferredKey = getDiagnosisKey(preferred);
  if (preferred && selectedDiagnosisKeys.value.has(preferredKey)) {
    selectedDiagnosis.value = preferred;
    return;
  }

  const currentKey = getDiagnosisKey(selectedDiagnosis.value);
  if (currentKey && selectedDiagnosisKeys.value.has(currentKey)) {
    const matchedCurrent = aiDiagnoses.value.find((diag) => getDiagnosisKey(diag) === currentKey);
    selectedDiagnosis.value = matchedCurrent || null;
    if (selectedDiagnosis.value) {
      return;
    }
  }

  selectedDiagnosis.value = aiDiagnoses.value.find((diag) => selectedDiagnosisKeys.value.has(getDiagnosisKey(diag))) || null;
}

function replaceDiagnosisSelection(diags: Diagnosis[], primary?: Diagnosis | null): void {
  setDiagnosisSelection(diags.map((diag) => getDiagnosisKey(diag)));
  syncPrimaryDiagnosis(primary || diags[0] || null);
}

function resetTreatmentEditorState(): void {
  expandedTreatmentEditors.value = new Set();
  activeEditableFieldKey.value = null;
  frequencySearchKeywords.value = {};
  routeSearchKeywords.value = {};
  secondarySelector.resetAll();
}

function isTreatmentEditorExpanded(rec: TreatmentRecommendation): boolean {
  return expandedTreatmentEditors.value.has(getTreatmentEditorKey(rec));
}

function toggleTreatmentEditor(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  const key = getTreatmentEditorKey(rec);
  const nextEditors = new Set(expandedTreatmentEditors.value);

  if (nextEditors.has(key)) {
    nextEditors.delete(key);
  } else {
    nextEditors.add(key);
  }

  expandedTreatmentEditors.value = nextEditors;
}

function expandTreatmentEditor(rec: TreatmentRecommendation): void {
  const key = getTreatmentEditorKey(rec);
  if (expandedTreatmentEditors.value.has(key)) {
    return;
  }

  expandedTreatmentEditors.value = new Set([...expandedTreatmentEditors.value, key]);
}

function shouldShowTreatmentEditor(rec: TreatmentRecommendation): boolean {
  return isTreatmentEditorExpanded(rec);
}

function registerEditableFieldElement(key: string, element: unknown): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    editableFieldElements.set(key, element);
    return;
  }
  editableFieldElements.delete(key);
}

function isEditableFieldActive(rec: TreatmentRecommendation, field: MedicinePrimaryField): boolean {
  return activeEditableFieldKey.value === getEditableFieldKey(rec, field);
}

function activateEditableField(rec: TreatmentRecommendation, field: MedicinePrimaryField, event?: Event): void {
  event?.stopPropagation();
  if (rec.type === 'medicine') {
    const normalized = normalizeTreatmentRecommendation(rec);
    Object.assign(rec, normalized);
    if (field === 'total' && !rec.totalManualEdited && normalized.totalQty) {
      rec.totalQty = normalized.totalQty;
    }
    if (field === 'total' && normalized.totalUnit) {
      rec.totalUnit = normalized.totalUnit;
    }
  }
  if (field === 'frequency') {
    syncFrequencySearchKeyword(rec);
  }
  if (field === 'route') {
    syncRouteSearchKeyword(rec);
  }
  const key = getEditableFieldKey(rec, field);
  activeEditableFieldKey.value = key;
  void nextTick(() => editableFieldElements.get(key)?.focus());
}

function handleEditableFieldBlur(rec: TreatmentRecommendation, field: MedicinePrimaryField, event: FocusEvent): void {
  const container = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;

  if (container && nextTarget && container.contains(nextTarget)) {
    return;
  }

  if (activeEditableFieldKey.value === getEditableFieldKey(rec, field)) {
    if (field === 'frequency') {
      rec.frequency = resolveFrequencyValueFromKeyword(rec);
      rec.frequencyKey = resolveFrequencyKeyFromKeyword(rec);
      syncFrequencySearchKeyword(rec);
    }
    if (field === 'route') {
      rec.route = resolveRouteValueFromKeyword(rec);
      rec.routeKey = resolveRouteKeyFromKeyword(rec);
      syncRouteSearchKeyword(rec);
    }
    if (field === 'total') {
      void checkMedicineInventoryEnough(rec, true);
    }
    activeEditableFieldKey.value = null;
  }
}

function handleTotalQtyInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  rec.totalQty = target?.value || '';
  rec.totalManualEdited = rec.totalQty.trim().length > 0;
  if (!rec.totalUnit) {
    rec.totalUnit = normalizeTreatmentRecommendation(rec).totalUnit || '';
  }
  clearMedicineInventoryWarning(rec);
}

// 频次/用法字段已迁移到共用 MedicineUsageFieldSelector，
// 父组件仍通过 activeEditableFieldKey 协调多字段互斥展开。
function handleFrequencyOpenChange(rec: TreatmentRecommendation, open: boolean): void {
  if (open) {
    activateEditableField(rec, 'frequency');
  } else if (isEditableFieldActive(rec, 'frequency')) {
    activeEditableFieldKey.value = null;
  }
}

function handleRouteOpenChange(rec: TreatmentRecommendation, open: boolean): void {
  if (open) {
    activateEditableField(rec, 'route');
  } else if (isEditableFieldActive(rec, 'route')) {
    activeEditableFieldKey.value = null;
  }
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
  return matched.map((item) => {
    const name = item.matchedItem?.name || item.name;
    return {
      id: item.matchedItem?.id,
      name,
      code: item.matchedItem?.code || item.code || '',
      rate: 'AI分析',
      rationale: buildDiagnosisRationale(item, name),
    };
  });
}

function mapTreatmentType(type: MatchedTreatment['type']): TreatmentRecommendation['type'] {
  if (type === 'examination') return 'exam';
  if (type === 'labTest') return 'lab_test';
  return type;
}

function initTreatmentsFromIntent(matched: MatchedTreatment[]): TreatmentRecommendation[] {
  return matched.map((item) => {
    const suggestedName = item.name;
    const assessment = assessTreatmentCatalogMatch(mapTreatmentType(item.type), suggestedName, item.aliases, item.spec);
    const name = assessment.matchedItem?.name || suggestedName;
    const dosagePair = splitDosageAndUnit(item.dosage);
    const normalized = normalizeTreatmentRecommendation({
      type: mapTreatmentType(item.type),
      name,
      originalName: suggestedName,
      reason: buildTreatmentReason(item, name),
      spec: item.spec || item.matchedItem?.spec || '',
      targetDose: item.targetDose || '',
      targetDoseUnit: item.targetDoseUnit || '',
      usage: [item.usage, item.frequency, item.dosage, item.dosageUnit].filter(Boolean).join('，'),
      dosage: item.dosage || dosagePair.dosage,
      dosageUnit: item.dosageUnit || dosagePair.dosageUnit,
      frequency: item.frequency || inferFrequencyFromText([item.frequency, item.evidenceText, item.text].filter(Boolean).join(' ')),
      frequencyKey: item.frequencyKey || '',
      route: item.usage || inferRouteFromText([item.usage, item.evidenceText, item.text].filter(Boolean).join(' ')),
      routeKey: item.usageKey || '',
      totalQty: item.totalQty || '',
      totalUnit: item.totalUnit || '',
      days: item.days || '',
      sourceType: item.sourceType,
      evidenceText: item.evidenceText || item.text || '',
      goal: item.goal || '',
      matchedItem: assessment.matchedItem,
      suggestedMatchItem: assessment.suggestedMatchItem,
      matchStatus: assessment.matchStatus,
      manualMatched: false,
      selected: assessment.matchStatus === 'exact' && shouldAutoSelectTreatment(item),
    });
    return normalized;
  });
}

interface TreatmentSection {
  type: TreatmentRecommendation['type'];
  title: string;
  items: TreatmentRecommendation[];
}

const treatmentSections = computed<TreatmentSection[]>(() => {
  const sections: Array<{ type: TreatmentRecommendation['type']; title: string }> = [
    { type: 'medicine', title: '药品' },
    { type: 'exam', title: '检查项目' },
    { type: 'lab_test', title: '检验项目' },
    { type: 'procedure', title: '处置项目' },
  ];

  return sections
    .map((section) => ({
      ...section,
      items: treatments.value.filter((item) => item.type === section.type),
    }))
    .filter((section) => section.items.length > 0);
});

const hasTreatments = computed(() => treatments.value.length > 0);

function getManualMatchSearchKey(rec: TreatmentRecommendation): string {
  return `${getManualMatchKey(rec)}:search`;
}

function getManualMatchKeyword(rec: TreatmentRecommendation): string {
  const cached = manualMatchKeywords.value[getManualMatchSearchKey(rec)];
  return typeof cached === 'string' ? cached : rec.name;
}

function setManualMatchKeyword(rec: TreatmentRecommendation, value: string): void {
  manualMatchKeywords.value = {
    ...manualMatchKeywords.value,
    [getManualMatchSearchKey(rec)]: value,
  };
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

function isManualMatchOpen(rec: TreatmentRecommendation): boolean {
  return activeManualMatchKey.value === getManualMatchKey(rec);
}

function toggleManualMatch(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  activeReasonTooltipKey.value = null;
  const key = getManualMatchKey(rec);
  const isOpening = activeManualMatchKey.value !== key;
  activeManualMatchKey.value = isOpening ? key : null;
  if (isOpening) {
    setManualMatchKeyword(rec, getManualMatchKeyword(rec) || rec.name);
  }
}

function getManualMatchCandidates(rec: TreatmentRecommendation): ManualMatchRawCandidate[] {
  return findManualMatchCandidates(rec, getManualMatchKeyword(rec));
}

// 部位选项落地：来自 HIS `fetchMedicalItemPartOptions(idCli)`，统一在 useBodySiteOptions 内处理。
const { applyMedicalItemPartOption, applyMedicalItemPartOptions } = useBodySiteOptions();

function getCandidatePharmaciesForMedicine(rec?: TreatmentRecommendation): PharmacyOption[] {
  if (!rec) {
    // 无 rec 时返回去重后的全部可用药房（与原逆辑一致）
    const seen = new Set<string>();
    return pharmacyOptions.value.filter((pharmacy) => {
      const idSto = (pharmacy.idSto || '').trim();
      if (!idSto || seen.has(idSto)) return false;
      seen.add(idSto);
      return true;
    });
  }
  const scoped = treatmentGates.pharmacyCandidatesFor(rec);
  if (scoped.length === 0 && getMatchedMedicineStoreIds(rec).length > 0) {
    console.warn('[VoiceConsultationNew] Matched medicine storeIds do not intersect current available pharmacies', {
      name: rec.name,
      matchedStoreIds: getMatchedMedicineStoreIds(rec),
      availableStoreIds: pharmacyOptions.value.map((pharmacy) => pharmacy.idSto).filter(Boolean),
    });
  }
  return scoped;
}

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
  rec.suggestedMatchItem = undefined;

  if (rec.type === 'medicine') {
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
  }

  if (rec.type === 'medicine' && !(await ensureMedicineSelectable(rec))) {
    showToast?.(`${rec.name} 已确认匹配，但当前药房无药品详情，暂不能选中`, 'warning');
    return;
  }

  if (rec.type !== 'medicine') {
    await hydrateMatchedMedicalItemDetail(rec);
  }

  if (!hasRequiredPharmacy(rec)) {
    openPharmacyQuickSelector(rec);
    showToast?.(`${rec.name} 当前发药药房不可用，请选择实际拥有该药品的药房后再选中`, 'warning');
    return;
  }

  if (!hasRequiredExecDept(rec)) {
    expandTreatmentEditor(rec);
    openSecondarySelector(rec, 'execDept');
    showToast?.(`${rec.name} 未设置执行科室，请先设置后再选中`, 'warning');
    return;
  }

  if (!hasRequiredBodySite(rec)) {
    openBodySiteQuickSelector(rec);
    showToast?.(`${rec.name} 未设置检查部位，请先设置后再选中`, 'warning');
    return;
  }

  if (rec.type === 'medicine') {
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
    if (!(await checkMedicineInventoryEnough(rec, true))) {
      expandTreatmentEditor(rec);
      return;
    }
  }

  rec.selected = true;

  showToast?.(`${rec.name} 已确认匹配`, 'success');
}

async function applyManualMatch(rec: TreatmentRecommendation, candidate: ManualMatchRawCandidate, event?: Event): Promise<void> {
  event?.stopPropagation();

  if (!applyManualMatchCandidate(rec, candidate)) {
    return;
  }

  if (rec.type === 'medicine') {
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
  }

  if (rec.type === 'medicine' && !(await ensureMedicineSelectable(rec))) {
    showToast?.(`${candidate.name} 已完成标准库匹配，但当前药房无药品详情，暂不能选中`, 'warning');
    return;
  }

  if (rec.type !== 'medicine') {
    await hydrateMatchedMedicalItemDetail(rec);
  }

  if (!hasRequiredPharmacy(rec)) {
    openPharmacyQuickSelector(rec);
    showToast?.(`${candidate.name} 当前发药药房不可用，请选择实际拥有该药品的药房后再选中`, 'warning');
    return;
  }

  if (!hasRequiredExecDept(rec)) {
    expandTreatmentEditor(rec);
    openSecondarySelector(rec, 'execDept');
    showToast?.(`${candidate.name} 未设置执行科室，请先设置后再选中`, 'warning');
    return;
  }

  if (!hasRequiredBodySite(rec)) {
    openBodySiteQuickSelector(rec);
    showToast?.(`${candidate.name} 未设置检查部位，请先设置后再选中`, 'warning');
    return;
  }

  if (rec.type === 'medicine') {
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
    if (!(await checkMedicineInventoryEnough(rec, true))) {
      expandTreatmentEditor(rec);
      return;
    }
  }

  rec.selected = true;
  activeManualMatchKey.value = null;
  showToast?.(`${candidate.name} 已完成标准库匹配`, 'success');
}

async function toggleTreatment(item: TreatmentRecommendation): Promise<void> {
  activeReasonTooltipKey.value = null;
  if (!item.selected && requiresManualMatchBeforeSelect(item)) {
    if (hasProbableMatch(item)) {
      showToast?.('该推荐存在候选标准项，请先确认匹配或改为手动匹配', 'warning');
      return;
    }
    activeManualMatchKey.value = getManualMatchKey(item);
    setManualMatchKeyword(item, getManualMatchKeyword(item) || item.name);
    showToast?.('该推荐尚未匹配标准库，请先手动匹配', 'warning');
    return;
  }
  const nextSelected = !item.selected;

  if (nextSelected && item.type === 'exam') {
    await hydrateMatchedMedicalItemDetail(item);
  }

  if (nextSelected && item.type === 'medicine' && !(await ensureMedicineSelectable(item, true))) {
    return;
  }

  if (nextSelected && !hasRequiredPharmacy(item)) {
    openPharmacyQuickSelector(item);
    showToast?.('当前发药药房不可用，请选择实际拥有该药品的药房后再选中', 'warning');
    return;
  }

  if (nextSelected && !hasRequiredExecDept(item)) {
    expandTreatmentEditor(item);
    openSecondarySelector(item, 'execDept');
    showToast?.('请先设置执行科室后再选中该项目', 'warning');
    return;
  }

  if (nextSelected && !hasRequiredBodySite(item)) {
    openBodySiteQuickSelector(item);
    showToast?.('请先设置检查部位后再选中该项目', 'warning');
    return;
  }

  if (nextSelected && item.type === 'medicine') {
    Object.assign(item, normalizeTreatmentRecommendation(item));
    if (!(await checkMedicineInventoryEnough(item, true))) {
      expandTreatmentEditor(item);
      return;
    }
  }

  item.selected = nextSelected;

  if (!item.selected) {
    const editorKey = getTreatmentEditorKey(item);
    const nextEditors = new Set(expandedTreatmentEditors.value);
    nextEditors.delete(editorKey);
    expandedTreatmentEditors.value = nextEditors;

    if (activeEditableFieldKey.value?.startsWith(`${editorKey}:`)) {
      activeEditableFieldKey.value = null;
    }
  }
}

function toggleDiagnosis(diag: Diagnosis): void {
  activeReasonTooltipKey.value = null;
  if (!isDiagnosisSelected(diag)) {
    const nextKeys = new Set(selectedDiagnosisKeys.value);
    nextKeys.add(getDiagnosisKey(diag));
    setDiagnosisSelection(nextKeys);
    if (!selectedDiagnosis.value) {
      selectedDiagnosis.value = diag;
    }
    return;
  }

  if (!isPrimaryDiagnosis(diag)) {
    selectedDiagnosis.value = diag;
    return;
  }
}

function setPrimaryDiagnosis(diag: Diagnosis, event?: Event): void {
  event?.stopPropagation();
  if (!isDiagnosisSelected(diag)) {
    const nextKeys = new Set(selectedDiagnosisKeys.value);
    nextKeys.add(getDiagnosisKey(diag));
    setDiagnosisSelection(nextKeys);
  }
  selectedDiagnosis.value = diag;
}

function removeDiagnosis(diag: Diagnosis, event?: Event): void {
  event?.stopPropagation();
  const key = getDiagnosisKey(diag);
  if (!key || !selectedDiagnosisKeys.value.has(key)) {
    return;
  }

  const nextKeys = new Set(selectedDiagnosisKeys.value);
  nextKeys.delete(key);

  if (nextKeys.size === 0) {
    return;
  }

  setDiagnosisSelection(nextKeys);
  if (isPrimaryDiagnosis(diag)) {
    syncPrimaryDiagnosis();
  }
}

function toggleReasonTooltip(key: string, event?: Event): void {
  event?.stopPropagation();
  activeReasonTooltipKey.value = activeReasonTooltipKey.value === key ? null : key;
}

function handleGlobalPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement | null;

  if (activeReasonTooltipKey.value) {
    if (!target?.closest('.reason-tooltip-trigger')) {
      activeReasonTooltipKey.value = null;
    }
  }

  if (activeFeedbackPopoverKey.value) {
    if (!target?.closest('.voice-feedback-anchor')) {
      activeFeedbackPopoverKey.value = null;
    }
  }
}

async function fetchAIDiagnosis(): Promise<void> {
  if (diagnosisLoading.value) return;
  if (!chiefComplaint.value.trim()) {
    showToast?.('请先填写主诉', 'warning');
    return;
  }

  diagnosisLoading.value = true;
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.consultation.diagnosisRecommendation.system },
      {
        role: 'user',
        content: PROMPTS.consultation.diagnosisRecommendation.buildUserPrompt({
          patientName: patientName.value,
          gender: patientGender.value,
          age: patientAge.value,
          chiefComplaint: chiefComplaint.value,
          historyOfPresentIllness: historyOfPresentIllness.value,
        }),
      },
    ];

    const response = await chat(messages, undefined, undefined, undefined, {
      traceContext: {
        scene: 'voice-consultation-diagnosis',
        sourceModule: 'voice_consultation_ai',
        operationModule: 'voice_consultation',
        operationAction: 'generate_diagnosis_recommendation',
        title: '语音问诊生成诊断推荐',
      },
    });
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    const parsed: Diagnosis[] = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);

    aiDiagnoses.value = parsed.map((diag) => {
      const matchContext = diag.code ? { icdCode: diag.code } : undefined;
      const matched = medicalDataService.matchDiagnosis(diag.name, matchContext) || medicalDataService.matchDiagnosis(diag.code);
      if (matched) {
        return { ...diag, code: matched.code, name: matched.name, id: matched.id };
      }
      return diag;
    });

    if (aiDiagnoses.value.length > 0) {
      replaceDiagnosisSelection([aiDiagnoses.value[0]], aiDiagnoses.value[0]);
    } else {
      setDiagnosisSelection([]);
      selectedDiagnosis.value = null;
    }

    void registerCurrentRecommendations();

    void performDiagnosisFactCheck(aiDiagnoses.value);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast?.(`诊断推荐失败: ${msg}`, 'error');
  } finally {
    diagnosisLoading.value = false;
  }
}

async function fetchAITreatment(): Promise<void> {
  if (treatmentLoading.value || !selectedDiagnosis.value) return;
  treatmentLoading.value = true;

  const diagnosisIdentity = getDiagnosisIdentity(selectedDiagnosis.value);
  console.info('[VoiceConsultationNew] Fetching treatment recommendations', {
    diagnosisIdentity,
    diagnosisName: selectedDiagnosis.value.name,
    existingTreatmentCount: treatments.value.length,
  });

  const baseParams = {
    patientName: patientName.value,
    gender: patientGender.value,
    age: patientAge.value,
    diagnosisName: selectedDiagnosis.value.name,
    diagnosisCode: selectedDiagnosis.value.code,
    chiefComplaint: chiefComplaint.value,
  };

  try {
    await fetchPharmacyOptions();

    const [medResponse, examResponse, labResponse, procResponse] = await Promise.allSettled([
      chat([
        { role: 'system', content: PROMPTS.consultation.treatmentRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.treatmentRecommendation.buildUserPrompt(baseParams) },
      ], undefined, undefined, undefined, {
        traceContext: {
          scene: 'voice-consultation-treatment-medication',
          sourceModule: 'voice_consultation_ai',
          operationModule: 'voice_consultation',
          operationAction: 'generate_treatment_recommendation',
          title: '语音问诊生成用药推荐',
        },
      }),
      chat([
        { role: 'system', content: PROMPTS.consultation.examinationRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.examinationRecommendation.buildUserPrompt(baseParams) },
      ], undefined, undefined, undefined, {
        traceContext: {
          scene: 'voice-consultation-treatment-examination',
          sourceModule: 'voice_consultation_ai',
          operationModule: 'voice_consultation',
          operationAction: 'generate_examination_recommendation',
          title: '语音问诊生成检查推荐',
        },
      }),
      chat([
        { role: 'system', content: PROMPTS.consultation.labTestRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.labTestRecommendation.buildUserPrompt(baseParams) },
      ], undefined, undefined, undefined, {
        traceContext: {
          scene: 'voice-consultation-treatment-lab-test',
          sourceModule: 'voice_consultation_ai',
          operationModule: 'voice_consultation',
          operationAction: 'generate_lab_test_recommendation',
          title: '语音问诊生成检验推荐',
        },
      }),
      chat([
        { role: 'system', content: PROMPTS.consultation.procedureRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.procedureRecommendation.buildUserPrompt(baseParams) },
      ], undefined, undefined, undefined, {
        traceContext: {
          scene: 'voice-consultation-treatment-procedure',
          sourceModule: 'voice_consultation_ai',
          operationModule: 'voice_consultation',
          operationAction: 'generate_procedure_recommendation',
          title: '语音问诊生成处置推荐',
        },
      }),
    ]);

    const parseAndMatch = (
      response: PromiseSettledResult<string>,
    ): TreatmentRecommendation[] => {
      if (response.status !== 'fulfilled') return [];

      try {
        const clean = response.value.replace(/```json\n?|\n?```/g, '').trim();
        const jsonMatch = clean.match(/\[[\s\S]*\]/);
        const parsed: TreatmentRecommendation[] = JSON.parse(jsonMatch ? jsonMatch[0] : clean);

        return parsed.map((rec) => {
          const assessment = assessTreatmentCatalogMatch(
            rec.type,
            rec.name,
            Array.isArray(rec.aliases) ? rec.aliases : undefined,
            rec.type === 'medicine' ? rec.spec : undefined,
          );
          return normalizeTreatmentRecommendation({
            ...rec,
            originalName: rec.originalName || rec.name,
            matchedItem: assessment.matchedItem,
            suggestedMatchItem: assessment.suggestedMatchItem,
            matchStatus: assessment.matchStatus,
            manualMatched: false,
            selected: assessment.matchStatus === 'exact',
          });
        });
      } catch (error) {
        console.warn('[VoiceConsultationNew] Failed to parse treatment recommendation response', {
          error: error instanceof Error ? error.message : String(error),
          responsePreview: response.value.slice(0, 400),
        });
        return [];
      }
    };

    const nextTreatments: TreatmentRecommendation[] = [];
    nextTreatments.push(...parseAndMatch(medResponse));
    nextTreatments.push(...parseAndMatch(examResponse));
    nextTreatments.push(...parseAndMatch(labResponse));
    nextTreatments.push(...parseAndMatch(procResponse));

    console.info('[VoiceConsultationNew] Treatment recommendations loaded', {
      diagnosisIdentity,
      totalCount: nextTreatments.length,
      medicineCount: nextTreatments.filter((item) => item.type === 'medicine').length,
      medicineWithDosageCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.dosage).length,
      medicineWithDaysCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.days).length,
      medicineWithTotalQtyCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.totalQty).length,
    });

    if (diagnosisIdentity !== getDiagnosisIdentity(selectedDiagnosis.value)) {
      return;
    }

    treatments.value = nextTreatments;
    lastTreatmentDiagnosisKey.value = diagnosisIdentity;
    await reconcileAutoSelectedMedicineInventory(nextTreatments);
    void registerCurrentRecommendations();
    void hydrateMatchedMedicalItemDetails(nextTreatments);
    void performTreatmentFactCheck(nextTreatments);
    submitVoiceGeneratedUserLog();
    // 把 LLM 推荐的诊疗方案写回缓存，下次同就诊恢复时直接复用、跳过 fetchAITreatment
    persistEditorSnapshotImmediate();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast?.(`方案推荐失败: ${msg}`, 'error');
  } finally {
    treatmentLoading.value = false;
  }
}

async function handleTreatmentRefresh(event?: Event): Promise<void> {
  event?.stopPropagation();
  activeReasonTooltipKey.value = null;
  resetTreatmentEditorState();
  await fetchAITreatment();
}

const openRelatedId = ref<string | null>(null);
const inlineRelatedDiagnoses = ref<DiagnosisItem[]>([]);

function toggleRelatedDropdown(diag: Diagnosis, event?: Event): void {
  if (!event) return;
  event.stopPropagation();
  const targetId = diag.id || diag.code;

  if (openRelatedId.value === targetId) {
    openRelatedId.value = null;
    inlineRelatedDiagnoses.value = [];
    return;
  }

  openRelatedId.value = targetId;
  const related = medicalDataService.getRelatedDiagnoses(diag.code);
  inlineRelatedDiagnoses.value = related.filter((item) => item.code !== diag.code);
}

function swapDiagnosis(originalDiag: Diagnosis, newItem: { id?: string; code: string; name: string }): void {
  const index = aiDiagnoses.value.findIndex((item) => (item.id || item.code) === (originalDiag.id || originalDiag.code));
  if (index === -1) return;

  const updatedDiag: Diagnosis = {
    ...aiDiagnoses.value[index],
    id: newItem.id,
    code: newItem.code,
    name: newItem.name,
  };

  aiDiagnoses.value[index] = updatedDiag;

  const originalKey = getDiagnosisKey(originalDiag);
  const updatedKey = getDiagnosisKey(updatedDiag);
  if (selectedDiagnosisKeys.value.has(originalKey)) {
    const nextKeys = new Set(selectedDiagnosisKeys.value);
    nextKeys.delete(originalKey);
    nextKeys.add(updatedKey);
    setDiagnosisSelection(nextKeys);
  }

  if (selectedDiagnosis.value && (selectedDiagnosis.value.id || selectedDiagnosis.value.code) === (originalDiag.id || originalDiag.code)) {
    selectedDiagnosis.value = updatedDiag;
  } else {
    syncPrimaryDiagnosis();
  }

  openRelatedId.value = null;
  inlineRelatedDiagnoses.value = [];
  void registerCurrentRecommendations();
}

watch(
  () => getDiagnosisIdentity(selectedDiagnosis.value),
  (currentIdentity, previousIdentity) => {
    openRelatedId.value = null;

    if (!currentIdentity || !selectedDiagnosis.value) {
      treatments.value = [];
      lastTreatmentDiagnosisKey.value = '';
      resetTreatmentEditorState();
      return;
    }

    if (currentIdentity !== previousIdentity) {
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

    if (shouldAutoFetchInitialTreatment) {
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

const diagnosisFactChecks = ref<Map<string, FactCheckResult>>(new Map());
const treatmentFactChecks = ref<Map<string, FactCheckResult>>(new Map());

function getIssueForDiagnosis(diagCode: string): FactCheckIssue | undefined {
  const check = diagnosisFactChecks.value.get(diagCode);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0];
}

function getIssueForTreatment(treatmentName: string): FactCheckIssue | undefined {
  const check = treatmentFactChecks.value.get(treatmentName);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0];
}

async function performDiagnosisFactCheck(diagnoses: Diagnosis[]): Promise<void> {
  if (!diagnoses.length || !isReviewerEnabled()) return;
  diagnosisFactChecks.value.clear();

  for (const diagnosis of diagnoses) {
    try {
      const result = await checkDiagnosis({
        diagnosis: diagnosis.name,
        chiefComplaint: chiefComplaint.value,
        historyOfPresentIllness: historyOfPresentIllness.value,
      });
      diagnosisFactChecks.value.set(diagnosis.code, result);
    } catch (error) {
      console.error(`Failed to fact check diagnosis: ${diagnosis.name}`, error);
    }
  }
}

async function performTreatmentFactCheck(items: TreatmentRecommendation[]): Promise<void> {
  if (!items.length || !isReviewerEnabled()) return;
  treatmentFactChecks.value.clear();

  for (const treatment of items) {
    try {
      let result: FactCheckResult;
      if (treatment.type === 'medicine') {
        result = await checkMedicine({
          medicineName: treatment.name,
          diagnosis: selectedDiagnosis.value?.name || '',
        });
      } else {
        result = await checkExamination({
          examinationName: treatment.name,
          diagnosis: selectedDiagnosis.value?.name || '',
        });
      }

      treatmentFactChecks.value.set(treatment.name, result);
    } catch (error) {
      console.error(`Failed to fact check treatment: ${treatment.name}`, error);
    }
  }
}

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
// 语音侧仅保留 ensureMedicineDefaultPharmacy 另外的语义（需 detail 加载后才设默认）。
const treatmentGates = useTreatmentGates({ pharmacyOptions, execDeptOptions });

// 治疗项归一化 composable：注入语音侧的执行科室门禁 & 默认发药药房副作用，
// 与症状问诊共享同一份归一化口径（症状侧调用时传入对应回调或默认值）。
const treatmentNormalization = useTreatmentNormalization({
  frequencyOptions,
  routeOptions,
  ensurePharmacy: ensureMedicineDefaultPharmacy,
  isExecDeptSatisfied: (rec) => !isExecDeptRequired(rec) || !!getExecDeptDisplay(rec),
});

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

// 药品详情 hydrate / 库存校验：与症状问诊共享同一份口径（useTreatmentHydration）。
// 注入：候选药房收窄、字典查找；toast 通过 notify 回调走 voice 侧的 'warning' 级别。
const {
  hydrateMatchedMedicalItemDetail,
  hydrateMatchedMedicalItemDetails,
  ensureMedicineSelectable,
  checkMedicineInventoryEnough,
  getMedicineInventoryWarning,
  clearMedicineInventoryWarning,
  isMedicineInventoryChecking,
} = useTreatmentHydration({
  pharmacyOptions,
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
    void hydrateMatchedMedicalItemDetails(treatments.value);
  } catch (error) {
    console.error('[VoiceConsultationNew] ensureMedicineCatalogForStoreIds failed', error);
  }
}

function syncTreatmentExecDeptSelections(): void {
  if (execDeptOptions.value.length === 0) {
    return;
  }

  const keyByText = new Map(execDeptOptions.value.map((option) => [option.text, option.key]));
  treatments.value.forEach((rec) => {
    if (rec.type === 'medicine') {
      return;
    }

    const currentValue = (rec.execDept || '').trim();
    if (!currentValue) {
      return;
    }

    if (execDeptOptions.value.some((option) => option.key === currentValue)) {
      return;
    }

    rec.execDept = keyByText.get(currentValue) || rec.execDept;
  });
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
  event?.stopPropagation();
  expandTreatmentEditor(rec);
  openSecondarySelector(rec, 'execDept');
  void nextTick(() => {
    const selector = document.querySelector<HTMLInputElement>(`[data-exec-dept-input="${getTreatmentEditorKey(rec)}"]`);
    selector?.focus();
    selector?.select();
  });
}

function openBodySiteQuickSelector(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(rec);
  openSecondarySelector(rec, 'bodySite');
  void nextTick(() => {
    const selector = document.querySelector<HTMLInputElement>(`[data-body-site-input="${getTreatmentEditorKey(rec)}"]`);
    selector?.focus();
    selector?.select();
  });
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
  event?.stopPropagation();
  expandTreatmentEditor(rec);
  openSecondarySelector(rec, 'pharmacy');
  void nextTick(() => {
    const selector = document.querySelector<HTMLInputElement>(`[data-pharmacy-input="${getTreatmentEditorKey(rec)}"]`);
    selector?.focus();
    selector?.select();
  });
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown);
  void Promise.all([fetchFrequencyOptions(), fetchRouteOptions(), fetchPharmacyOptions(), fetchExecDeptOptions()]);
  void listen<ReferenceFeedbackPayload>('consultation-reference-feedback', (event) => {
    const payload = event.payload;
    if (payload.consultationId && payload.consultationId !== resolveConsultationId()) {
      return;
    }
    applyWritebackFeedback(payload);
  })
    .then((unlisten) => {
      unlistenReferenceFeedback = unlisten;
    })
    .catch((error) => {
      console.error('[VoiceConsultationNew] Failed to subscribe reference feedback:', error);
    });
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown);
  if (unlistenReferenceFeedback) {
    unlistenReferenceFeedback();
    unlistenReferenceFeedback = null;
  }
});
const insuranceOptions = ['医保使用', '自费'];

function getMatchedItemRaw(rec: TreatmentRecommendation): Record<string, unknown> | undefined {
  const raw = rec.matchedItem?.raw;
  return raw && typeof raw === 'object' ? raw : undefined;
}

function readFirstString(source: Record<string, unknown> | undefined, keys: string[]): string {
  if (!source) {
    return '';
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

function getDefaultOrderServiceCode(type: TreatmentRecommendation['type']): string {
  switch (type) {
    case 'medicine':
      return '11';
    case 'exam':
      return '31';
    case 'lab_test':
      return '41';
    default:
      return '21';
  }
}

function getOrderServiceCode(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  const explicitCode = (rec.matchedItem?.sdSrv || readFirstString(raw, ['sdSrv'])).trim();
  if (explicitCode && explicitCode !== '1' && explicitCode !== '2') {
    return explicitCode;
  }
  return getDefaultOrderServiceCode(rec.type);
}

function getOrderServiceId(rec: TreatmentRecommendation): string {
  return getMatchedOrderServiceId(rec);
}

function getOrderServiceName(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.naSrv || readFirstString(raw, ['naSrv', 'naCli', 'naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '').trim();
}

function getSelectedPharmacyOption(rec: TreatmentRecommendation): PharmacyOption | undefined {
  const pharmacyValue = (rec.pharmacy || '').trim();
  if (!pharmacyValue) {
    return getDefaultPharmacyOption(rec);
  }

  return findMatchedPharmacyOption(rec, pharmacyValue) || getDefaultPharmacyOption(rec);
}

function getOrderExecDeptId(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  const pharmacyOption = rec.type === 'medicine' ? getSelectedPharmacyOption(rec) : undefined;
  const selectedExecDeptKey = (rec.type !== 'medicine'
    ? (execDeptOptions.value.find((option) => option.key === (rec.execDept || '').trim() || option.text === (rec.execDept || '').trim())?.key || rec.execDept || '')
    : '').trim();
  return (
    selectedExecDeptKey ||
    pharmacyOption?.idSto ||
    rec.matchedItem?.idDeptExec ||
    readFirstString(raw, ['idDeptExec', 'idDept']) ||
    getHisAdapter()?.getDefaultExecDeptId() ||
    ''
  ).trim();
}

function getOrderPartId(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.bodySiteId || rec.matchedItem?.idPart || readFirstString(raw, ['idPart'])).trim();
}

function getOrderJsonField(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  const explicitJsonField = (rec.matchedItem?.jsonField || readFirstString(raw, ['jsonField'])).trim();
  if (explicitJsonField) {
    return explicitJsonField;
  }

  const idLisCategory = readFirstString(raw, ['idLisCategory']);
  const fgCombination = readFirstString(raw, ['fgCombination']);
  if (!idLisCategory && !fgCombination) {
    return '';
  }

  return JSON.stringify({
    ...(idLisCategory ? { idLisCategory } : {}),
    ...(fgCombination ? { fgCombination } : {}),
  });
}

function getOrderFgCheckOrd(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.fgCheckOrd || readFirstString(raw, ['fgCheckOrd']) || '1').trim() || '1';
}

function getOrderFgSkintest(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.fgSkintest || readFirstString(raw, ['fgSkintest']) || '0').trim() || '0';
}

function buildOrderListItem(rec: TreatmentRecommendation): Record<string, string | number > {
  return buildSharedOrderListItem(rec, {
    getServiceCode: getOrderServiceCode,
    getServiceId: getOrderServiceId,
    getServiceName: getOrderServiceName,
    getExecDeptId: getOrderExecDeptId,
    getPartId: getOrderPartId,
    getJsonField: getOrderJsonField,
    getFgCheckOrd: getOrderFgCheckOrd,
    getFgSkintest: getOrderFgSkintest,
    getFrequencyKey: getResolvedFrequencyKey,
    getRouteKey: getResolvedRouteKey,
    normalize: normalizeTreatmentRecommendation,
  });
}

function buildDiagList(): Array<Record<string, string>> {
  return buildSharedDiagList({
    selectedDiagnoses: selectedDiagnoses.value,
    primaryDiagnosis: selectedDiagnosis.value,
    patientTetId: patientTetId.value,
  });
}

function getTreatmentMatchLabel(rec: TreatmentRecommendation): string {
  return getSharedTreatmentMatchLabel(rec, 'detailed');
}

function formatOptionLabel(option: UsageOption): string {
  const text = option.text.trim();
  const key = option.key.trim();
  if (!key || key === text || text.includes(key)) {
    return text;
  }
  return `${text}(${key})`;
}

function resolveSelectorFilterKeyword(keyword: string, currentValue?: string): string {
  const normalizedKeyword = normalizeUsageKeyword(keyword);
  if (!normalizedKeyword) {
    return '';
  }

  const normalizedCurrentValue = normalizeUsageKeyword((currentValue || '').trim());
  if (normalizedCurrentValue && normalizedKeyword === normalizedCurrentValue) {
    return '';
  }

  return normalizedKeyword;
}

function findFrequencyOptionByValue(value?: string): UsageOption | undefined {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) {
    return undefined;
  }

  return frequencyOptions.value.find((option) => option.text === normalizedValue || option.key === normalizedValue);
}

function findRouteOptionByValue(value?: string): UsageOption | undefined {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) {
    return undefined;
  }

  return routeOptions.value.find((option) => option.text === normalizedValue || option.key === normalizedValue);
}

function getResolvedFrequencyKey(rec: TreatmentRecommendation): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  return normalized.frequencyKey || findFrequencyOptionByValue(normalized.frequency)?.key || '';
}

function getResolvedRouteKey(rec: TreatmentRecommendation): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  return normalized.routeKey || findRouteOptionByValue(normalized.route)?.key || '';
}

function getFrequencyDisplayValue(value?: string): string {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  const matchedOption = findFrequencyOptionByValue(normalizedValue);
  if (matchedOption) {
    return formatOptionLabel(matchedOption);
  }

  return normalizedValue;
}

function getMedicineFieldDisplay(rec: TreatmentRecommendation, field: MedicinePrimaryField): string {
  const normalized = normalizeTreatmentRecommendation(rec);

  switch (field) {
    case 'dosage':
      return [normalized.dosage, normalized.dosageUnit].filter(Boolean).join(' ') || '点击填写';
    case 'frequency':
      return getFrequencyDisplayValue(normalized.frequency) || '点击选择';
    case 'route':
      return normalized.route || '点击选择';
    case 'total':
      return [
        [normalized.totalQty, normalized.totalUnit].filter(Boolean).join(' '),
        normalized.days ? `${normalized.days}天` : '',
      ].filter(Boolean).join(' / ') || '点击填写';
  }
}

function getMedicineCollapsedSummary(rec: TreatmentRecommendation): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  const parts = [
    normalized.dosage || normalized.dosageUnit
      ? [normalized.dosage, normalized.dosageUnit].filter(Boolean).join('')
      : '',
    normalized.frequency ? getFrequencyDisplayValue(normalized.frequency) : '',
    normalized.route || '',
    [
      [normalized.totalQty, normalized.totalUnit].filter(Boolean).join(''),
      normalized.days ? `${normalized.days}天` : '',
    ].filter(Boolean).join('/'),
  ].filter(Boolean);

  return parts.join(' · ') || '点击展开设置用法用量';
}

function getFrequencySearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:frequency-search`;
}

function getFrequencySearchKeyword(rec: TreatmentRecommendation): string {
  const cached = frequencySearchKeywords.value[getFrequencySearchKey(rec)];
  if (typeof cached === 'string') {
    return cached;
  }
  return normalizeTreatmentRecommendation(rec).frequency || '';
}

function setFrequencySearchKeyword(rec: TreatmentRecommendation, value: string): void {
  frequencySearchKeywords.value = {
    ...frequencySearchKeywords.value,
    [getFrequencySearchKey(rec)]: value,
  };
}

function syncFrequencySearchKeyword(rec: TreatmentRecommendation): void {
  setFrequencySearchKeyword(rec, normalizeTreatmentRecommendation(rec).frequency || '');
}

function getFilteredFrequencyOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (normalizeTreatmentRecommendation(rec).frequency || '').trim();
  const query = resolveSelectorFilterKeyword(getFrequencySearchKeyword(rec), currentValue);
  const matchedOptions = !query
    ? frequencyOptions.value
    : frequencyOptions.value.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matchedOptions.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: currentValue, text: currentValue }), ...matchedOptions];
  }

  return matchedOptions;
}

function resolveFrequencyValueFromKeyword(rec: TreatmentRecommendation): string {
  const keyword = getFrequencySearchKeyword(rec).trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = frequencyOptions.value.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.text;
  }

  const exactTokenMatch = frequencyOptions.value.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.text;
  }

  const filteredOptions = getFilteredFrequencyOptionsForRecord(rec);
  if (filteredOptions.length === 1) {
    return filteredOptions[0].text;
  }

  return normalizeTreatmentRecommendation(rec).frequency || '';
}

function resolveFrequencyKeyFromKeyword(rec: TreatmentRecommendation): string {
  const keyword = getFrequencySearchKeyword(rec).trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = frequencyOptions.value.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.key;
  }

  const exactTokenMatch = frequencyOptions.value.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.key;
  }

  const filteredOptions = getFilteredFrequencyOptionsForRecord(rec);
  if (filteredOptions.length === 1) {
    return filteredOptions[0].key;
  }

  return normalizeTreatmentRecommendation(rec).frequencyKey || '';
}

function getRouteSearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:route-search`;
}

function getRouteSearchKeyword(rec: TreatmentRecommendation): string {
  const cached = routeSearchKeywords.value[getRouteSearchKey(rec)];
  if (typeof cached === 'string') {
    return cached;
  }
  return normalizeTreatmentRecommendation(rec).route || '';
}

function setRouteSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  routeSearchKeywords.value = {
    ...routeSearchKeywords.value,
    [getRouteSearchKey(rec)]: value,
  };
}

function syncRouteSearchKeyword(rec: TreatmentRecommendation): void {
  setRouteSearchKeyword(rec, normalizeTreatmentRecommendation(rec).route || '');
}

function getFilteredRouteOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (normalizeTreatmentRecommendation(rec).route || '').trim();
  const query = resolveSelectorFilterKeyword(getRouteSearchKeyword(rec), currentValue);
  const matchedOptions = !query
    ? routeOptions.value
    : routeOptions.value.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matchedOptions.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: currentValue, text: currentValue }), ...matchedOptions];
  }

  return matchedOptions;
}

function resolveRouteValueFromKeyword(rec: TreatmentRecommendation): string {
  const keyword = getRouteSearchKeyword(rec).trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = routeOptions.value.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.text;
  }

  const exactTokenMatch = routeOptions.value.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.text;
  }

  const filteredOptions = getFilteredRouteOptionsForRecord(rec);
  if (filteredOptions.length === 1) {
    return filteredOptions[0].text;
  }

  return normalizeTreatmentRecommendation(rec).route || '';
}

function resolveRouteKeyFromKeyword(rec: TreatmentRecommendation): string {
  const keyword = getRouteSearchKeyword(rec).trim();
  if (!keyword) {
    return '';
  }

  const normalizedKeyword = normalizeUsageKeyword(keyword);
  const exactTextMatch = routeOptions.value.find((option) => option.text === keyword);
  if (exactTextMatch) {
    return exactTextMatch.key;
  }

  const exactTokenMatch = routeOptions.value.find((option) => option.normalizedTokens.includes(normalizedKeyword));
  if (exactTokenMatch) {
    return exactTokenMatch.key;
  }

  const filteredOptions = getFilteredRouteOptionsForRecord(rec);
  if (filteredOptions.length === 1) {
    return filteredOptions[0].key;
  }

  return normalizeTreatmentRecommendation(rec).routeKey || '';
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
  return secondarySelector.getKeyword(rec, 'pharmacy');
}

function setPharmacySearchKeyword(rec: TreatmentRecommendation, value: string): void {
  secondarySelector.setKeyword(rec, 'pharmacy', value);
}

function handlePharmacySearchInput(rec: TreatmentRecommendation, event: Event): void {
  secondarySelector.handleInput(rec, 'pharmacy', event);
}

function getFilteredPharmacyOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = getNormalizedPharmacyValue(rec);
  const query = secondarySelector.resolveFilterKeyword(getPharmacySearchKeyword(rec), currentValue);
  // 仅保留当前药品实际存在的药房（matchedItem.storeIds ∩ 有效发药药房）
  const allowedPharmacies = rec.type === 'medicine' && rec.matchedItem
    ? getCandidatePharmaciesForMedicine(rec)
    : pharmacyOptions.value;
  const options = dedupeUsageOptions(
    allowedPharmacies.map((option) => createUsageOption({
      key: option.idSto || option.idDept || option.name,
      text: option.name,
      mcode: option.idDept,
    })),
  );
  const matched = !query
    ? options
    : options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matched.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: currentValue, text: currentValue }), ...matched];
  }

  return matched;
}

function selectPharmacyOption(rec: TreatmentRecommendation, option: UsageOption): void {
  rec.pharmacy = option.text;
  setPharmacySearchKeyword(rec, option.text);
  clearMedicineInventoryWarning(rec);
  if (rec.type === 'medicine' && (rec.totalQty || '').trim()) {
    void checkMedicineInventoryEnough(rec, true);
  }
  secondarySelector.closeAll();
}

function clearPharmacySelection(rec: TreatmentRecommendation): void {
  rec.pharmacy = '';
  setPharmacySearchKeyword(rec, '');
  clearMedicineInventoryWarning(rec);
  if (isPharmacyRequired(rec) && rec.selected) {
    rec.selected = false;
    showToast?.('发药药房已清空，请重新设置后再选中该药品', 'warning');
  }
}

// === 执行科室 ===
function getExecDeptSearchKeyword(rec: TreatmentRecommendation): string {
  return secondarySelector.getKeyword(rec, 'execDept');
}

function setExecDeptSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  secondarySelector.setKeyword(rec, 'execDept', value);
}

function handleExecDeptSearchInput(rec: TreatmentRecommendation, event: Event): void {
  secondarySelector.handleInput(rec, 'execDept', event);
}

function getExecDeptUsageOptions(): UsageOption[] {
  return dedupeUsageOptions(
    execDeptOptions.value.map((option) => createUsageOption({
      key: option.key,
      text: option.text,
      mcode: option.key,
    })),
  );
}

function getFilteredExecDeptOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = getExecDeptSearchKeyword(rec).trim();
  const query = secondarySelector.resolveFilterKeyword(getExecDeptSearchKeyword(rec), currentValue);
  const options = getExecDeptUsageOptions();
  const matched = !query
    ? options
    : options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matched.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: currentValue, text: currentValue }), ...matched];
  }

  return matched;
}

function selectExecDeptOption(rec: TreatmentRecommendation, option: UsageOption): void {
  rec.execDept = option.key || option.text;
  setExecDeptSearchKeyword(rec, option.text);
  secondarySelector.closeAll();
}

function clearExecDeptSelection(rec: TreatmentRecommendation): void {
  rec.execDept = '';
  setExecDeptSearchKeyword(rec, '');
  if (isExecDeptRequired(rec)) {
    rec.selected = false;
    showToast?.('执行科室已清空，请重新设置后再选中该项目', 'warning');
  }
}


// === 部位 ===
function getBodySiteSearchKeyword(rec: TreatmentRecommendation): string {
  return secondarySelector.getKeyword(rec, 'bodySite');
}

function setBodySiteSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  secondarySelector.setKeyword(rec, 'bodySite', value);
}

function handleBodySiteSearchInput(rec: TreatmentRecommendation, event: Event): void {
  secondarySelector.handleInput(rec, 'bodySite', event);
}

function getBodySiteUsageOptions(rec: TreatmentRecommendation): UsageOption[] {
  return dedupeUsageOptions((rec.bodySiteOptions || []).map((option) => createUsageOption({
    key: option.partId || option.name,
    text: option.name,
    mcode: option.partAndWayCode || option.partAndWay,
  })));
}

function getFilteredBodySiteOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (rec.bodySite || '').trim();
  const query = secondarySelector.resolveFilterKeyword(getBodySiteSearchKeyword(rec), currentValue);
  const options = getBodySiteUsageOptions(rec);
  const matched = !query
    ? options
    : options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matched.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: rec.bodySiteId || currentValue, text: currentValue }), ...matched];
  }

  return matched;
}

function selectBodySiteOption(rec: TreatmentRecommendation, option: UsageOption): void {
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
  return secondarySelector.getKeyword(rec, 'insurance');
}

function setInsuranceSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  secondarySelector.setKeyword(rec, 'insurance', value);
}

function handleInsuranceSearchInput(rec: TreatmentRecommendation, event: Event): void {
  secondarySelector.handleInput(rec, 'insurance', event);
}

function getInsuranceUsageOptions(): UsageOption[] {
  return dedupeUsageOptions(
    insuranceOptions.map((option) => createUsageOption({ key: option, text: option })),
  );
}

function getFilteredInsuranceOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (rec.insuranceType || '').trim();
  const query = secondarySelector.resolveFilterKeyword(getInsuranceSearchKeyword(rec), currentValue);
  const options = getInsuranceUsageOptions();
  const matched = !query
    ? options
    : options.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  if (currentValue && !matched.some((option) => option.text === currentValue)) {
    return [createUsageOption({ key: currentValue, text: currentValue }), ...matched];
  }

  return matched;
}

function selectInsuranceOption(rec: TreatmentRecommendation, option: UsageOption): void {
  rec.insuranceType = option.text;
  setInsuranceSearchKeyword(rec, option.text);
  secondarySelector.closeAll();
}

function clearInsuranceSelection(rec: TreatmentRecommendation): void {
  rec.insuranceType = '';
  setInsuranceSearchKeyword(rec, '');
}

function getInventoryBlockedToastMessage(items: TreatmentRecommendation[]): string {
  if (items.length === 0) {
    return '存在库存不足的药品，请调整用药数量或药房后再提交';
  }

  const names = Array.from(new Set(items.map((item) => item.name).filter(Boolean)));
  if (names.length === 1) {
    return `${names[0]} 库存不足，请调整用药数量或药房后再提交`;
  }

  const preview = names.slice(0, 3).join('、');
  return `${preview}${names.length > 3 ? ` 等${names.length}种药品` : ''}库存不足，请调整用药数量或药房后再提交`;
}

async function reconcileAutoSelectedMedicineInventory(items: TreatmentRecommendation[]): Promise<void> {
  const autoSelectedMedicines = items.filter((item) => item.type === 'medicine' && item.selected);
  if (autoSelectedMedicines.length === 0) {
    return;
  }

  const inventoryReady = await Promise.all(autoSelectedMedicines
    .map((item) => checkMedicineInventoryEnough(item, false)));
  const blockedItems = autoSelectedMedicines.filter((_, index) => !inventoryReady[index]);
  if (blockedItems.length === 0) {
    return;
  }

  blockedItems.forEach((item) => {
    item.selected = false;
  });
  expandTreatmentEditor(blockedItems[0]);
  showToast?.(getInventoryBlockedToastMessage(blockedItems), 'warning');
}

async function handleBatchWriteBack(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  lastWritebackFeedback.value = null;

  try {
    const selected = treatments.value.filter((item) => item.selected);
    const medicinesReady = await Promise.all(selected
      .filter((item) => item.type === 'medicine')
      .map((item) => ensureMedicineSelectable(item, true)));
    if (medicinesReady.some((ready) => !ready)) {
      showToast?.('存在当前药房无有效详情的药品，请取消选择后再提交', 'warning');
      return;
    }

    const selectedMedicines = selected.filter((item) => item.type === 'medicine');
    const medicineInventoriesReady = await Promise.all(selectedMedicines
      .map((item) => checkMedicineInventoryEnough(item, false)));
    const inventoryBlockedItems = selectedMedicines.filter((_, index) => !medicineInventoriesReady[index]);
    if (inventoryBlockedItems.length > 0) {
      showToast?.(getInventoryBlockedToastMessage(inventoryBlockedItems), 'warning');
      return;
    }

    const missingPharmacy = selected.find((item) => !hasRequiredPharmacy(item));
    if (missingPharmacy) {
      openPharmacyQuickSelector(missingPharmacy);
      showToast?.(`${missingPharmacy.name} 当前发药药房不可用，请选择实际拥有该药品的药房后再提交`, 'warning');
      return;
    }

    const missingExecDept = selected.find((item) => !hasRequiredExecDept(item));
    if (missingExecDept) {
      expandTreatmentEditor(missingExecDept);
      openSecondarySelector(missingExecDept, 'execDept');
      showToast?.(`${missingExecDept.name} 未设置执行科室，请先设置后再提交`, 'warning');
      return;
    }

    const examItems = selected.filter((item) => item.type === 'exam');
    if (examItems.length > 0) {
      await Promise.all(examItems.map((item) => hydrateMatchedMedicalItemDetail(item)));
    }

    const missingBodySite = selected.find((item) => !hasRequiredBodySite(item));
    if (missingBodySite) {
      openBodySiteQuickSelector(missingBodySite);
      showToast?.(`${missingBodySite.name} 未设置检查部位，请先设置后再提交`, 'warning');
      return;
    }

    const meds = selected.filter((item) => item.type === 'medicine');
    const exams = selected.filter((item) => item.type === 'exam');
    const labs = selected.filter((item) => item.type === 'lab_test');
    const procs = selected.filter((item) => item.type === 'procedure');
    const diagList = buildDiagList();
    const orderList = selected.map((item) => buildOrderListItem(item));

    const treatmentPlan = [
      meds.length ? `用药：${meds.map((item) => item.name).join('；')}` : '',
      exams.length ? `检查：${exams.map((item) => item.name).join('；')}` : '',
      labs.length ? `检验：${labs.map((item) => item.name).join('；')}` : '',
      procs.length ? `处置：${procs.map((item) => item.name).join('；')}` : '',
    ].filter(Boolean).join('。');

    const requestId = `record-confirmed-${Date.now()}`;
    const result = {
      consultationId: resolveConsultationId(),
      timestamp: Date.now(),
      resultType: 'record-confirmed',
      requestId,
      referenceType: 'batch',
      action: 'batch',
      referenceStatus: 'pending',
      referenceMessage: '等待 HIS 完成最终回写并回执。',
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
      pastMedicalHistory: pastMedicalHistory.value,
      familyHistory: familyHistory.value,
      diagList,
      orderList,
      treatmentPlan,
    };

    await invoke('complete_consultation', { result });
    pendingWritebackRequestId.value = requestId;
    pendingWritebackMessage.value = '病历已发送至 HIS，等待处理结果回执。';
    waitingWritebackFeedback.value = true;
    showToast?.('病历已发送至 HIS，等待处理结果回执。', 'info');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast?.(`提交失败: ${msg}`, 'error');
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.intentResult,
  async (result) => {
    if (!result) return;

    suppressDiagnosisTreatmentRefetch.value = true;

    resetTreatmentEditorState();
    lastTreatmentDiagnosisKey.value = '';
    openRelatedId.value = null;
    inlineRelatedDiagnoses.value = [];
    activeManualMatchKey.value = null;
    activeFeedbackPopoverKey.value = null;
    showSessionFeedbackDialog.value = false;
    resetWritebackState();
    aiDiagnoses.value = [];
    selectedDiagnosisKeys.value = new Set();
    selectedDiagnosis.value = null;
    treatments.value = [];
    firstUserLogSnapshot.value = null;

    initialRecordSnapshot.value = {
      chiefComplaint: result.chiefComplaint || '',
      historyOfPresentIllness: result.historyOfPresentIllness || '',
      pastMedicalHistory: result.pastMedicalHistory || '',
      familyHistory: result.familyHistory || '',
    };
    chiefComplaint.value = result.chiefComplaint;
    historyOfPresentIllness.value = result.historyOfPresentIllness;
    pastMedicalHistory.value = result.pastMedicalHistory;
    familyHistory.value = result.familyHistory || '';

    if (result.diagnoses?.length) {
      aiDiagnoses.value = initDiagnosesFromIntent(result.diagnoses);
      const firstMatched = aiDiagnoses.value.find((diag) => diag.id || diag.code);
      replaceDiagnosisSelection(firstMatched ? [firstMatched] : aiDiagnoses.value.slice(0, 1), firstMatched || aiDiagnoses.value[0] || null);
      void registerCurrentRecommendations();
    }

    if (result.treatments.length > 0) {
      await fetchPharmacyOptions();
      treatments.value = initTreatmentsFromIntent(result.treatments);
      normalizeMedicinePharmacyValues(treatments.value);
      lastTreatmentDiagnosisKey.value = getDiagnosisIdentity(selectedDiagnosis.value);
      await reconcileAutoSelectedMedicineInventory(treatments.value);
      void registerCurrentRecommendations();
      void hydrateMatchedMedicalItemDetails(treatments.value);
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
    } else if (chiefComplaint.value.trim()) {
      void fetchAIDiagnosis();
    }

    if (treatments.value.length > 0) {
      void performTreatmentFactCheck(treatments.value);
    }

    await nextTick();
    suppressDiagnosisTreatmentRefetch.value = false;
    submitVoiceGeneratedUserLog();

    const primaryDiagnosis = selectedDiagnosis.value;
    const primaryDiagnosisName = primaryDiagnosis ? s((primaryDiagnosis as Record<string, unknown>).name) : '';
    if (treatments.value.length === 0 && primaryDiagnosis) {
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
              <h3 class="section-title">病历详情</h3>
            </div>
          </div>

          <div class="record-fields">
            <div class="record-field">
              <div class="record-field-head">
                <label>主诉</label>
                <div class="record-field-actions">
                  <span v-if="isRecordFieldModified('chiefComplaint')" class="record-field-status-chip">已人工修改</span>
                  <div class="voice-feedback-anchor" @click.stop>
                    <button
                      class="voice-feedback-trigger"
                      :class="{ submitted: !!getRecordFieldSubmittedLabel('chiefComplaint') }"
                      type="button"
                      @click.stop="toggleRecommendationFeedback(getRecordFieldFeedbackKey('chiefComplaint'), $event)"
                    >反馈</button>
                    <div v-if="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('chiefComplaint'))" class="voice-feedback-panel">
                      <VoiceRecordFeedbackPopover
                        :visible="true"
                        title="主诉"
                        :original-value="initialRecordSnapshot.chiefComplaint"
                        :current-value="chiefComplaint"
                        :draft="getRecordFieldDraft('chiefComplaint')"
                        :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('chiefComplaint')"
                        :submitted-label="getRecordFieldSubmittedLabel('chiefComplaint')"
                        @close="toggleRecommendationFeedback(getRecordFieldFeedbackKey('chiefComplaint'))"
                        @update:draft="updateRecordFieldDraft('chiefComplaint', $event)"
                        @submit="handleRecordFieldFeedbackSubmit('chiefComplaint', $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <textarea v-model="chiefComplaint" rows="2" placeholder="请输入主诉..."></textarea>
            </div>
            <div class="record-field field-grow">
              <div class="record-field-head">
                <label>现病史</label>
                <div class="record-field-actions">
                  <span v-if="isRecordFieldModified('historyOfPresentIllness')" class="record-field-status-chip">已人工修改</span>
                  <div class="voice-feedback-anchor" @click.stop>
                    <button
                      class="voice-feedback-trigger"
                      :class="{ submitted: !!getRecordFieldSubmittedLabel('historyOfPresentIllness') }"
                      type="button"
                      @click.stop="toggleRecommendationFeedback(getRecordFieldFeedbackKey('historyOfPresentIllness'), $event)"
                    >反馈</button>
                    <div v-if="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('historyOfPresentIllness'))" class="voice-feedback-panel">
                      <VoiceRecordFeedbackPopover
                        :visible="true"
                        title="现病史"
                        :original-value="initialRecordSnapshot.historyOfPresentIllness"
                        :current-value="historyOfPresentIllness"
                        :draft="getRecordFieldDraft('historyOfPresentIllness')"
                        :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('historyOfPresentIllness')"
                        :submitted-label="getRecordFieldSubmittedLabel('historyOfPresentIllness')"
                        @close="toggleRecommendationFeedback(getRecordFieldFeedbackKey('historyOfPresentIllness'))"
                        @update:draft="updateRecordFieldDraft('historyOfPresentIllness', $event)"
                        @submit="handleRecordFieldFeedbackSubmit('historyOfPresentIllness', $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <textarea v-model="historyOfPresentIllness" rows="6" placeholder="请输入现病史..."></textarea>
            </div>
            <div class="record-field">
              <div class="record-field-head">
                <label>既往史</label>
                <div class="record-field-actions">
                  <span v-if="isRecordFieldModified('pastMedicalHistory')" class="record-field-status-chip">已人工修改</span>
                  <div class="voice-feedback-anchor" @click.stop>
                    <button
                      class="voice-feedback-trigger"
                      :class="{ submitted: !!getRecordFieldSubmittedLabel('pastMedicalHistory') }"
                      type="button"
                      @click.stop="toggleRecommendationFeedback(getRecordFieldFeedbackKey('pastMedicalHistory'), $event)"
                    >反馈</button>
                    <div v-if="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('pastMedicalHistory'))" class="voice-feedback-panel">
                      <VoiceRecordFeedbackPopover
                        :visible="true"
                        title="既往史"
                        :original-value="initialRecordSnapshot.pastMedicalHistory"
                        :current-value="pastMedicalHistory"
                        :draft="getRecordFieldDraft('pastMedicalHistory')"
                        :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('pastMedicalHistory')"
                        :submitted-label="getRecordFieldSubmittedLabel('pastMedicalHistory')"
                        @close="toggleRecommendationFeedback(getRecordFieldFeedbackKey('pastMedicalHistory'))"
                        @update:draft="updateRecordFieldDraft('pastMedicalHistory', $event)"
                        @submit="handleRecordFieldFeedbackSubmit('pastMedicalHistory', $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <textarea v-model="pastMedicalHistory" rows="4" placeholder="请输入既往史..."></textarea>
            </div>
            <!-- <div class="record-field">
              <div class="record-field-head">
                <label>家族史</label>
                <div class="record-field-actions">
                  <span v-if="isRecordFieldModified('familyHistory')" class="record-field-status-chip">已人工修改</span>
                  <div class="voice-feedback-anchor" @click.stop>
                    <button
                      class="voice-feedback-trigger"
                      :class="{ submitted: !!getRecordFieldSubmittedLabel('familyHistory') }"
                      type="button"
                      @click.stop="toggleRecommendationFeedback(getRecordFieldFeedbackKey('familyHistory'), $event)"
                    >反馈</button>
                    <div v-if="isRecommendationFeedbackOpen(getRecordFieldFeedbackKey('familyHistory'))" class="voice-feedback-panel">
                      <VoiceRecordFeedbackPopover
                        :visible="true"
                        title="家族史"
                        :original-value="initialRecordSnapshot.familyHistory"
                        :current-value="familyHistory"
                        :draft="getRecordFieldDraft('familyHistory')"
                        :submitting="recordFieldSubmittingKey === getRecordFieldFeedbackKey('familyHistory')"
                        :submitted-label="getRecordFieldSubmittedLabel('familyHistory')"
                        @close="toggleRecommendationFeedback(getRecordFieldFeedbackKey('familyHistory'))"
                        @update:draft="updateRecordFieldDraft('familyHistory', $event)"
                        @submit="handleRecordFieldFeedbackSubmit('familyHistory', $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <textarea v-model="familyHistory" rows="3" placeholder="请输入家族史..."></textarea>
            </div> -->
          </div>
        </section>

        <section class="vcn-right-panel">
          <div class="decision-card pane-card">
            <div class="section-heading">
              <h3 class="section-title">诊断建议</h3>
              <div v-if="selectedDiagnoses.length > 0" class="section-meta">
                已纳入 {{ selectedDiagnoses.length }} 项
                <span v-if="selectedDiagnosis" class="section-meta-strong">主：{{ selectedDiagnosis.name }}</span>
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
                :related-open="openRelatedId === (diag.id || diag.code)"
                :related-diagnoses="openRelatedId === (diag.id || diag.code) ? inlineRelatedDiagnoses : []"
                :issue="getIssueForDiagnosis(diag.code)"
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
                @toggle-feedback="toggleRecommendationFeedback(getDiagnosisFeedbackKey(diag), $event)"
                @update:feedback-draft="updateRecommendationDraft(getDiagnosisFeedbackKey(diag), $event)"
                @submit-feedback="handleDiagnosisFeedbackSubmit(diag, $event)"
              />
            </ul>

            <div v-else class="empty-text">暂无诊断建议</div>
          </div>

          <div class="decision-card pane-card">
            <div class="section-heading treatment-heading">
              <div class="section-heading-main">
                <h3 class="section-title">治疗方案</h3>
              </div>
              <div class="treatment-heading-actions">
                <button
                  class="refresh-treatment-btn"
                  type="button"
                  :disabled="!selectedDiagnosis || treatmentLoading"
                  @click="handleTreatmentRefresh"
                >
                  {{ treatmentLoading ? '刷新中...' : '刷新方案' }}
                </button>
              </div>
            </div>

            <div v-if="treatmentLoading" class="loading-inline">
              <div class="ai-spinner small">
                <div class="spinner-ring"></div>
                <div class="spinner-core"></div>
              </div>
              <span>正在匹配方案...</span>
            </div>

            <template v-else-if="hasTreatments">
              <section v-for="section in treatmentSections" :key="section.type" class="treatment-section">
                <div class="treatment-section-header">
                  <h5>{{ section.title }}</h5>
                  <span class="treatment-section-summary">{{ section.items.length }} 项推荐 / {{ section.items.filter((item) => item.selected).length }} 项已选</span>
                </div>

                <div class="vcn-treatment-list">
                  <TreatmentRecommendationCard
                    v-for="rec in section.items"
                    :key="`${rec.type}-${rec.name}`"
                    :rec="rec"
                    :selected="!!rec.selected"
                    :locked="requiresManualMatchBeforeSelect(rec)"
                    :matching="isManualMatchOpen(rec)"
                    :issue="getIssueForTreatment(rec.name)"
                    :spec="getTreatmentSpec(rec)"
                    :reason-open="activeReasonTooltipKey === getReasonTooltipKey('treatment', rec.type, rec.name)"
                    :match-label="rec.matchedItem || rec.matchStatus === 'probable' ? getTreatmentMatchLabel(rec) : '未匹配标准库'"
                    :match-tone="rec.matchStatus === 'probable' || rec.matchStatus === 'unmatched' ? 'warning' : (rec.matchStatus === 'manual' || rec.matchStatus === 'confirmed' ? 'success' : 'default')"
                    :show-exec-dept-chip="isExecDeptRequired(rec)"
                    :exec-dept-display="getExecDeptDisplay(rec)"
                    :exec-dept-missing="!hasRequiredExecDept(rec)"
                    :exec-dept-title="hasRequiredExecDept(rec) ? '点击调整执行科室' : '执行科室为空，点击设置后才能选中'"
                    :show-pharmacy-chip="isPharmacyRequired(rec)"
                    :pharmacy-display="getPharmacyDisplay(rec)"
                    :pharmacy-missing="!hasRequiredPharmacy(rec)"
                    :pharmacy-title="hasRequiredPharmacy(rec) ? '点击调整发药药房' : '发药药房未设置或不在当前药品可用药房列表，点击选择'"
                    :usage-token="rec.type !== 'medicine' ? (rec.usage || '') : ''"
                    :probable-match-name="hasProbableMatch(rec) ? getSuggestedMatchName(rec) : ''"
                    :original-name="getTreatmentOriginalName(rec)"
                    :inline-summary="rec.type === 'medicine' && !isTreatmentEditorExpanded(rec) ? getMedicineCollapsedSummary(rec) : ''"
                    :feedback-visible="isRecommendationFeedbackOpen(getTreatmentFeedbackKey(rec))"
                    :feedback-draft="getRecommendationDraft(getTreatmentFeedbackKey(rec))"
                    :feedback-submitting="recommendationSubmittingKey === getTreatmentFeedbackKey(rec)"
                    :feedback-submitted-label="getRecommendationSubmittedLabel(getTreatmentFeedbackKey(rec))"
                    :show-manual-match-button="!rec.matchedItem"
                    :manual-match-title="isManualMatchOpen(rec) ? '收起手动匹配' : '手动匹配标准库项目'"
                    :manual-match-button-text="isManualMatchOpen(rec) ? '收起匹配' : '手动匹配'"
                    :show-editor-toggle="!!rec.selected"
                    :editor-expanded="isTreatmentEditorExpanded(rec)"
                    @toggle="toggleTreatment(rec)"
                    @toggle-reason="toggleReasonTooltip(getReasonTooltipKey('treatment', rec.type, rec.name), $event)"
                    @open-exec-dept="openExecDeptQuickSelector(rec, $event)"
                    @open-pharmacy="openPharmacyQuickSelector(rec, $event)"
                    @confirm-probable-match="confirmSuggestedMatch(rec, $event)"
                    @toggle-feedback="toggleRecommendationFeedback(getTreatmentFeedbackKey(rec), $event)"
                    @update:feedback-draft="updateRecommendationDraft(getTreatmentFeedbackKey(rec), $event)"
                    @submit-feedback="handleTreatmentFeedbackSubmit(rec, $event)"
                    @toggle-manual-match="toggleManualMatch(rec, $event)"
                    @toggle-editor="toggleTreatmentEditor(rec, $event)"
                  >
                    <template #manual-match>
                      <ManualMatchPicker
                        v-if="!rec.matchedItem && isManualMatchOpen(rec)"
                        :title="`从标准库选择${section.title.replace('项目', '')}`"
                        :keyword="getManualMatchKeyword(rec)"
                        :candidates="getManualMatchPickerCandidates(rec)"
                        @update:keyword="setManualMatchKeyword(rec, $event)"
                        @select="handleManualMatchPickerSelect(rec, $event)"
                      />
                    </template>

                    <template #editor>
                      <div v-if="shouldShowTreatmentEditor(rec)" class="editor-shell" @click.stop>
                      <template v-if="rec.type === 'medicine'">
                        <TreatmentItemEditor
                          :rec="rec"
                          mode="inline"
                          :frequency-options="frequencyOptions"
                          :route-options="routeOptions"
                          :is-field-active="(field) => isEditableFieldActive(rec, field)"
                          :activate-field="(field, event) => activateEditableField(rec, field, event)"
                          :on-field-blur="(field, event) => handleEditableFieldBlur(rec, field, event)"
                          :register-field-element="(field, element) => registerEditableFieldElement(getEditableFieldKey(rec, field), element)"
                          :on-total-qty-input="(event) => handleTotalQtyInput(rec, event)"
                          :on-field-open-change="(field, open) => field === 'frequency' ? handleFrequencyOpenChange(rec, open) : handleRouteOpenChange(rec, open)"
                          :get-display-value="(field) => getMedicineFieldDisplay(rec, field)"
                        />

                        <div v-if="isMedicineInventoryChecking(rec)" class="medicine-inventory-note checking">
                          正在校验库存...
                        </div>
                        <div v-else-if="getMedicineInventoryWarning(rec)" class="medicine-inventory-note warning">
                          {{ getMedicineInventoryWarning(rec) }}
                        </div>

                        <div v-if="isTreatmentEditorExpanded(rec)" class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>天数</label>
                            <input v-model="rec.days" type="text" placeholder="天" class="edit-input mini" />
                          </div>
                          <div class="secondary-field">
                            <label>药房</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'pharmacy', $event)">
                              <input
                                :data-pharmacy-input="getTreatmentEditorKey(rec)"
                                :value="getPharmacySearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选药房"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'pharmacy')"
                                @input="handlePharmacySearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'pharmacy')" class="route-option-list" role="listbox" aria-label="药房候选项">
                                <button
                                  v-if="rec.pharmacy"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearPharmacySelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredPharmacyOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectPharmacyOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                                </button>
                                <div v-if="getFilteredPharmacyOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配药房</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'insurance', $event)">
                              <input
                                :value="getInsuranceSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选医保类型"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'insurance')"
                                @input="handleInsuranceSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'insurance')" class="route-option-list" role="listbox" aria-label="医保限用候选项">
                                <button
                                  v-if="rec.insuranceType"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearInsuranceSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredInsuranceOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectInsuranceOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                </button>
                                <div v-if="getFilteredInsuranceOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配医保类型</div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </template>

                      <template v-if="rec.type === 'exam' && isTreatmentEditorExpanded(rec)">
                        <div class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>执行科室</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'execDept', $event)">
                              <input
                                :value="getExecDeptSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选科室"
                                class="edit-input"
                                :data-exec-dept-input="getTreatmentEditorKey(rec)"
                                @focus="openSecondarySelector(rec, 'execDept')"
                                @input="handleExecDeptSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'execDept')" class="route-option-list" role="listbox" aria-label="执行科室候选项">
                                <button
                                  v-if="rec.execDept"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearExecDeptSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredExecDeptOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectExecDeptOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.key !== option.text" class="route-option-meta">{{ option.key }}</span>
                                </button>
                                <div v-if="getFilteredExecDeptOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配科室</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>检查部位</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'bodySite', $event)">
                              <input
                                :data-body-site-input="getTreatmentEditorKey(rec)"
                                :value="getBodySiteSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选部位"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'bodySite')"
                                @input="handleBodySiteSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'bodySite')" class="route-option-list" role="listbox" aria-label="检查部位候选项">
                                <button
                                  v-if="rec.bodySite"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearBodySiteSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredBodySiteOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectBodySiteOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                                </button>
                                <div v-if="getFilteredBodySiteOptionsForRecord(rec).length === 0" class="route-option-empty">暂无可选部位</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'insurance', $event)">
                              <input
                                :value="getInsuranceSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选医保类型"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'insurance')"
                                @input="handleInsuranceSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'insurance')" class="route-option-list" role="listbox" aria-label="医保限用候选项">
                                <button
                                  v-if="rec.insuranceType"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearInsuranceSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredInsuranceOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectInsuranceOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                </button>
                                <div v-if="getFilteredInsuranceOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配医保类型</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                        </div>
                      </template>

                      <template v-if="rec.type === 'lab_test' && isTreatmentEditorExpanded(rec)">
                        <div class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>执行科室</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'execDept', $event)">
                              <input
                                :value="getExecDeptSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选科室"
                                class="edit-input"
                                :data-exec-dept-input="getTreatmentEditorKey(rec)"
                                @focus="openSecondarySelector(rec, 'execDept')"
                                @input="handleExecDeptSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'execDept')" class="route-option-list" role="listbox" aria-label="执行科室候选项">
                                <button
                                  v-if="rec.execDept"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearExecDeptSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredExecDeptOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectExecDeptOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.key !== option.text" class="route-option-meta">{{ option.key }}</span>
                                </button>
                                <div v-if="getFilteredExecDeptOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配科室</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'insurance', $event)">
                              <input
                                :value="getInsuranceSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选医保类型"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'insurance')"
                                @input="handleInsuranceSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'insurance')" class="route-option-list" role="listbox" aria-label="医保限用候选项">
                                <button
                                  v-if="rec.insuranceType"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearInsuranceSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredInsuranceOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectInsuranceOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                </button>
                                <div v-if="getFilteredInsuranceOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配医保类型</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                        </div>
                      </template>

                      <template v-if="rec.type === 'procedure' && isTreatmentEditorExpanded(rec)">
                        <div class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>总量</label>
                            <div class="edit-field-row">
                              <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input small" />
                              <span class="edit-unit">次</span>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>执行科室</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'execDept', $event)">
                              <input
                                :value="getExecDeptSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选科室"
                                class="edit-input"
                                :data-exec-dept-input="getTreatmentEditorKey(rec)"
                                @focus="openSecondarySelector(rec, 'execDept')"
                                @input="handleExecDeptSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'execDept')" class="route-option-list" role="listbox" aria-label="执行科室候选项">
                                <button
                                  v-if="rec.execDept"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearExecDeptSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredExecDeptOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectExecDeptOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.key !== option.text" class="route-option-meta">{{ option.key }}</span>
                                </button>
                                <div v-if="getFilteredExecDeptOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配科室</div>
                              </div>
                            </div>
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <div class="field-editor route-field-editor" @focusout="closeSecondarySelector(rec, 'insurance', $event)">
                              <input
                                :value="getInsuranceSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选医保类型"
                                class="edit-input"
                                @focus="openSecondarySelector(rec, 'insurance')"
                                @input="handleInsuranceSearchInput(rec, $event)"
                              />
                              <div v-if="isSecondarySelectorOpen(rec, 'insurance')" class="route-option-list" role="listbox" aria-label="医保限用候选项">
                                <button
                                  v-if="rec.insuranceType"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearInsuranceSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredInsuranceOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectInsuranceOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                </button>
                                <div v-if="getFilteredInsuranceOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配医保类型</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </template>
                      </div>
                    </template>
                  </TreatmentRecommendationCard>
                </div>
              </section>
            </template>

            <div v-else class="empty-text">{{ treatmentEmptyText }}</div>
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
  </div>
</template>

<style scoped>
.voice-consultation-new {
  --voice-font-min: 13px;
  --voice-font-main: 14px;
  --voice-font-strong: 14px;
  --voice-border: var(--color-border-light, #dbe4ef);
  --voice-border-strong: var(--color-border-medium, #cbd7e6);
  --voice-text: var(--color-text-strong, #0f172a);
  --voice-text-muted: var(--color-text-muted, #475569);
  --voice-text-disabled: var(--color-text-disabled, #94a3b8);
  --voice-accent: var(--color-cta, #2b7fe3);
  --voice-accent-strong: var(--color-cta-dark, #1f6fd0);
  --voice-accent-soft: var(--color-cta-100, rgba(43, 127, 227, 0.12));
  --voice-accent-softer: var(--color-cta-50, rgba(43, 127, 227, 0.06));
  --voice-warning: var(--color-warning-text, #c97a11);
  --voice-success: var(--color-success, #1f8a5b);
  --voice-danger: var(--color-error, #cf4a3c);
  --voice-danger-soft: var(--color-error-bg, #fee2e2);
  --voice-surface: var(--color-background-white, #ffffff);
  --voice-surface-soft: var(--color-background-light, #f7f9fc);
  --voice-surface-hover: var(--color-background-hover, #f3f7fc);
  --voice-surface-muted: var(--color-background-gray, #eef3f8);
  --voice-surface-glass: var(--surface-glass-strong, rgba(255, 255, 255, 0.96));
  --voice-overlay: var(--surface-overlay, rgba(15, 23, 42, 0.3));
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
  background:
    radial-gradient(960px 300px at 82% -6%, var(--color-primary-100, rgba(59, 130, 246, 0.1)) 0%, transparent 60%),
    radial-gradient(720px 220px at 18% 0%, var(--color-cta-50, rgba(43, 127, 227, 0.06)) 0%, transparent 58%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, var(--color-background-gray, #f8fafc) 18%, var(--color-background, #f5f7fb) 100%);
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  overflow: hidden;
}

.voice-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  scrollbar-gutter: stable;
}

.pane-card {
  background: var(--voice-surface-glass);
  border: 1px solid var(--voice-border);
  border-radius: 8px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.72) inset,
    0 10px 24px rgba(15, 23, 42, 0.035),
    0 2px 6px rgba(15, 23, 42, 0.02);
}

/* Voice Footer (与症状问诊底部按钮保持一致) */
.voice-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #EEF2F6;
  flex-shrink: 0;
}

.voice-footer .footer-cancel-btn {
  width: 64px;
  height: 32px;
  padding: 5px 14px;
  border: 1px solid #DBDBDB;
  background: #fff;
  border-radius: 4px;
  font-weight: 400;
  font-size: 14px;
  color: #262626;
  cursor: pointer;
  transition: all 0.2s ease;
}

.voice-footer .footer-cancel-btn:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.voice-footer .footer-cancel-btn:disabled {
  color: #94A3B8;
  background: #F8FAFC;
  border-color: #E2E8F0;
  cursor: not-allowed;
}

.voice-footer .footer-secondary-btn {
  min-width: 112px;
  height: 32px;
  padding: 5px 14px;
  border: 1px solid #BFD5F6;
  background: #F7FBFF;
  border-radius: 4px;
  font-weight: 400;
  font-size: 14px;
  color: #2469F2;
  cursor: pointer;
  transition: all 0.2s ease;
}

.voice-footer .footer-secondary-btn:hover:not(:disabled) {
  background: #EDF5FF;
  border-color: #95B8F1;
}

.voice-footer .footer-secondary-btn:disabled {
  color: #8FA9D4;
  background: #F5F8FD;
  border-color: #D8E4F6;
  cursor: not-allowed;
}

.voice-footer .footer-submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  height: 32px;
  gap: 6px;
  padding: 5px 16px;
  background: #2469F2;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
}

.voice-footer .footer-submit-btn:hover:not(:disabled) {
  background: #1A6FD5;
  box-shadow: 0 2px 8px rgba(43, 127, 227, 0.35);
}

.voice-footer .footer-submit-btn:disabled {
  background: rgba(43, 127, 227, 0.45);
  cursor: not-allowed;
  box-shadow: none;
}

.writeback-status-banner {
  margin: 0 16px 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.writeback-status-banner-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #1d4ed8;
}

.writeback-status-banner-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #b91c1c;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--voice-overlay);
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  width: min(420px, 100%);
  padding: 22px;
  border-radius: 20px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
}

.session-feedback-overlay {
  z-index: 22;
}

.session-feedback-dialog {
  width: min(720px, 100%);
  padding: 18px;
  border-radius: 22px;
  box-shadow: 0 20px 52px rgba(15, 23, 42, 0.2);
}

.session-feedback-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.session-feedback-skip {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--voice-border);
  border-radius: 10px;
  background: var(--voice-surface);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.session-feedback-skip:hover {
  border-color: var(--voice-border-strong);
  color: var(--voice-text);
}

.confirm-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--voice-text);
}

.confirm-dialog-text {
  margin: 0;
  color: var(--voice-text-muted);
  line-height: 1.6;
}

.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.confirm-btn {
  min-width: 96px;
  height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: var(--voice-font-main);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.confirm-btn:hover {
  opacity: 0.92;
}

.confirm-btn.secondary {
  border-color: var(--voice-border-strong);
  background: var(--voice-surface);
  color: var(--voice-text);
}

.confirm-btn.danger {
  background: var(--voice-danger);
  color: #fff;
  box-shadow: 0 10px 20px rgba(207, 74, 60, 0.18);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 280px;
}

.loading-title,
.loading-inline span,
.empty-text {
  font-size: var(--voice-font-main);
  color: var(--voice-text-muted);
}

.medical-record-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-content {
  display: grid;
  grid-template-columns: minmax(360px, 0.92fr) minmax(0, 1.08fr);
  gap: 16px;
  align-items: start;
}

.vcn-panel {
  min-width: 0;
}

.vcn-left-panel {
  padding: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, var(--voice-surface-glass) 100%);
}

.vcn-right-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  border-radius: 20px;
  overflow: visible;
  isolation: isolate;
}

.decision-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.985) 0%, var(--voice-surface-glass) 100%);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(90deg, #DCECFF 0%, rgba(189, 220, 255, 0) 100%);
  border-bottom: 1px solid #EEF2F6;
  border-radius: 8px 8px 0 0;
}

.vcn-left-panel > .section-heading {
  margin: -18px -18px 14px;
}

.decision-card > .section-heading {
  margin: -16px -16px 14px;
}

.section-heading-main {
  flex: 1;
  min-width: 0;
}

.section-heading-split {
  margin-bottom: 12px;
}

.treatment-heading {
  margin-bottom: 12px;
}

.treatment-heading-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.section-kicker {
  margin: 0 0 4px;
  font-size: var(--voice-font-min);
  color: #475569;
}

.section-title {
  margin: 0;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
  display: flex;
  align-items: center;
}

/* .section-title::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  background: #2B7FE3;
  margin-right: 10px;
  border-radius: 2px;
} */

.section-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.section-meta-strong {
  color: #1E293B;
  font-weight: 600;
}

.section-subtitle {
  margin-top: 4px;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.refresh-treatment-btn {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--voice-border);
  border-radius: 999px;
  background: var(--voice-surface);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
}

.refresh-treatment-btn:hover:not(:disabled) {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
  background: var(--voice-accent-softer);
}

.refresh-treatment-btn:disabled {
  cursor: not-allowed;
  color: var(--voice-text-disabled);
  background: var(--voice-surface-soft);
}

.section-summary {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  white-space: nowrap;
}

.record-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.record-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.record-field-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.field-grow {
  flex: 1;
}

.record-field label,
.primary-field label,
.secondary-field label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.record-field-status-chip {
  display: inline-flex;
  align-items: center;
  max-width: min(260px, 36vw);
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record-field textarea,
.edit-input,
.edit-select {
  width: 100%;
  border: 1px solid var(--voice-border);
  border-radius: 12px;
  background: var(--voice-surface);
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.015) inset;
}

.record-field textarea {
  padding: 12px 14px;
  line-height: 1.7;
  resize: vertical;
}

.record-field textarea:focus,
.edit-input:focus,
.edit-select:focus {
  border-color: var(--voice-accent);
  box-shadow: 0 0 0 3px var(--voice-accent-soft);
  background: rgba(255, 255, 255, 0.98);
}

.decision-overview,
.decision-card {
  padding: 16px;
}

.decision-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 132px;
  gap: 10px;
}

.overview-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, var(--voice-surface-soft) 100%);
  border: 1px solid var(--voice-border);
}

.overview-item-compact {
  align-items: flex-start;
}

.overview-label {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.overview-value {
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vcn-diagnosis-list,
.vcn-treatment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vcn-diagnosis-item,
.vcn-treatment-item {
  position: relative;
  padding: 12px 14px 12px 34px;
  border: 1px solid var(--voice-border);
  border-radius: 14px;
  background: var(--voice-surface);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
}

.vcn-diagnosis-item:hover,
.vcn-treatment-item:hover {
  border-color: var(--voice-border-strong);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.035);
}

.vcn-diagnosis-item.selected,
.vcn-treatment-item.selected {
  background: var(--voice-surface);
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 8px 18px rgba(15, 23, 42, 0.028);
}

.vcn-treatment-item.locked {
  border-style: dashed;
}

.vcn-treatment-item.matching {
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 10px 20px rgba(15, 23, 42, 0.03);
}

.vcn-diagnosis-item.primary {
  border-color: var(--voice-accent);
  box-shadow:
    0 0 0 1px var(--voice-accent-soft),
    0 10px 20px rgba(15, 23, 42, 0.03);
}

.diag-selected-mark,
.card-selected-mark {
  position: absolute;
  top: -1px;
  left: -1px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px 0 12px 0;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  border-right: 1px solid var(--voice-accent-soft);
  border-bottom: 1px solid var(--voice-accent-soft);
  z-index: 2;
}

.diag-selected-mark::after,
.card-selected-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.38);
  border-left: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: inherit;
  pointer-events: none;
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.treatment-card-row {
  align-items: baseline;
}

.card-main {
  flex: 1;
  min-width: 0;
  overflow: visible;
}

.card-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
  max-width: 100%;
}

.card-title-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: visible;
}

.card-title {
  display: block;
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reason-tooltip-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.reason-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--voice-text-muted);
  cursor: help;
}

.reason-icon-btn:hover,
.reason-tooltip-trigger:hover .reason-icon-btn,
.reason-tooltip-trigger:focus-within .reason-icon-btn {
  color: var(--voice-accent);
}

.hover-reason-tooltip {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 12;
  width: min(320px, 48vw);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--voice-border);
  background: var(--voice-surface-glass);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  line-height: 1.6;
  white-space: normal;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
  pointer-events: none;
}

.reason-tooltip-trigger:hover .hover-reason-tooltip,
.reason-tooltip-trigger:focus-within .hover-reason-tooltip,
.reason-tooltip-trigger.open .hover-reason-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.medicine-inline-summary {
  margin-top: 6px;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.manual-match-origin-note {
  margin-top: 6px;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  line-height: 1.5;
}

.probable-match-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(201, 122, 17, 0.18);
  background: linear-gradient(180deg, rgba(201, 122, 17, 0.09) 0%, rgba(201, 122, 17, 0.04) 100%);
  color: var(--voice-text);
}

.probable-match-copy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.probable-match-label {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(201, 122, 17, 0.14);
  color: var(--voice-warning);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.probable-match-name {
  color: var(--voice-text);
  font-weight: 600;
  word-break: break-word;
}

.meta-token {
  flex-shrink: 0;
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  white-space: nowrap;
}

.meta-token.warning,
.status-chip.warning {
  color: var(--voice-warning);
}

.meta-token.success {
  color: var(--voice-success);
}

.exec-dept-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 180px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent-strong);
  cursor: pointer;
}

.exec-dept-chip:hover {
  border-color: var(--voice-accent);
  background: rgba(37, 99, 235, 0.1);
}

.exec-dept-chip.missing {
  border-color: rgba(201, 122, 17, 0.28);
  background: rgba(201, 122, 17, 0.1);
  color: var(--voice-warning);
}

.exec-dept-chip-label {
  flex-shrink: 0;
  font-size: var(--voice-font-min);
  font-weight: 700;
}

.exec-dept-chip-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--voice-font-min);
  font-weight: 700;
}

.diag-role-token {
  color: var(--voice-accent);
}

.diag-action-btn {
  flex-shrink: 0;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.diag-action-btn.subtle {
  border-color: var(--voice-border);
  background: var(--voice-surface);
  color: var(--voice-text-muted);
}

.diag-action-btn:hover {
  border-color: var(--voice-accent);
}

.diag-action-btn.subtle:hover {
  color: var(--voice-text);
  border-color: var(--voice-border-strong);
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
}

.treatment-card-actions {
  align-items: center;
  align-self: baseline;
  min-height: 28px;
}

.voice-feedback-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.voice-feedback-trigger {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--voice-border);
  border-radius: 999px;
  background: var(--voice-surface);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.voice-feedback-trigger:hover {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
}

.voice-feedback-trigger.submitted {
  border-color: rgba(31, 138, 91, 0.2);
  background: rgba(31, 138, 91, 0.08);
  color: var(--voice-success);
}

.voice-feedback-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 12;
}

.manual-match-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--voice-accent-soft);
  border-radius: 999px;
  background: var(--voice-accent-softer);
  color: var(--voice-accent);
  font-size: var(--voice-font-min);
  font-weight: 600;
  cursor: pointer;
}

.manual-match-btn:hover {
  border-color: var(--voice-accent);
  background: var(--voice-accent-soft);
}

.confirm-match-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(201, 122, 17, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #9a5a07;
  font-size: var(--voice-font-min);
  font-weight: 600;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36);
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.confirm-match-btn.inline {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
  flex-shrink: 0;
}

.confirm-match-btn:hover {
  border-color: rgba(201, 122, 17, 0.34);
  background: rgba(201, 122, 17, 0.14);
  color: #7a4505;
  transform: translateY(-1px);
}

.inline-arrow-btn,
.close-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--voice-text-muted);
  cursor: pointer;
}

.inline-arrow-btn:hover,
.close-btn:hover {
  color: var(--voice-accent);
}

.inline-arrow-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
}

.action-arrow {
  background: var(--voice-surface-soft);
}

.inline-arrow {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.18s ease;
}

.inline-arrow.open {
  transform: rotate(225deg);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--voice-surface-soft);
  border: 1px solid var(--voice-border);
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.related-section {
  margin-top: 10px;
}

.related-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.related-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--voice-border);
  border-radius: 999px;
  background: var(--voice-surface);
  color: var(--voice-text);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.related-item:hover {
  border-color: var(--voice-accent);
  color: var(--voice-accent);
}

.related-code {
  color: var(--voice-text-muted);
}

.treatment-section + .treatment-section {
  margin-top: 14px;
}

.treatment-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.treatment-section-header h5 {
  margin: 0;
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
}

.treatment-section-summary {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.editor-shell {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--voice-border);
}

.medicine-primary-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.medicine-inventory-note {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: var(--voice-font-min);
  line-height: 1.5;
}

.medicine-inventory-note.checking {
  background: var(--voice-accent-softer);
  color: var(--voice-accent);
}

.medicine-inventory-note.warning {
  background: rgba(201, 122, 17, 0.1);
  color: var(--voice-warning);
}

.primary-field,
.secondary-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--voice-border);
  background: var(--voice-surface-soft);
}

.primary-field {
  min-height: 44px;
}

.primary-field.editing {
  border-color: var(--voice-accent);
  background: var(--voice-surface);
}

.primary-field label,
.secondary-field label {
  flex-shrink: 0;
  white-space: nowrap;
}

.field-read-btn {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.field-read-btn.placeholder {
  color: var(--voice-text-disabled);
  font-weight: 500;
}

.field-editor {
  flex: 1;
  min-width: 0;
}

.route-field-editor {
  position: relative;
}

.route-option-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: auto;
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: max(100%, 200px);
  width: max-content;
  max-width: min(360px, 48vw);
  max-height: 188px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--voice-border);
  border-radius: 12px;
  background: var(--voice-surface-glass);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.route-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--voice-text);
  cursor: pointer;
  text-align: left;
}

.route-option-item:hover {
  background: var(--voice-surface-hover);
}

.route-option-clear {
  border-bottom: 1px solid var(--voice-border);
  border-radius: 10px 10px 8px 8px;
  color: var(--voice-text-muted);
}

.route-option-text,
.route-option-meta {
  min-width: 0;
  font-size: var(--voice-font-min);
}

.route-option-text {
  flex: 1;
  color: var(--voice-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-option-meta,
.route-option-empty {
  color: var(--voice-text-muted);
}

.route-option-meta {
  flex-shrink: 0;
  white-space: nowrap;
}

.route-option-empty {
  padding: 6px 10px;
  font-size: var(--voice-font-min);
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.secondary-field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.edit-input,
.edit-select {
  min-height: 38px;
  padding: 0 10px;
}

.edit-input.small {
  max-width: 86px;
}

.edit-input.mini,
.edit-select.mini {
  max-width: 74px;
}

.edit-unit {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.writeback-btn,
.back-btn,
.btn-primary,
.btn-secondary {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: var(--voice-font-main);
  font-weight: 600;
  cursor: pointer;
}

.writeback-btn,
.btn-primary {
  border: none;
  background: var(--voice-accent);
  color: #fff;
}

.writeback-btn:disabled,
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.back-btn,
.btn-secondary {
  border: 1px solid var(--voice-border);
  background: var(--voice-surface-glass);
  color: var(--voice-text);
}

.ai-spinner {
  position: relative;
  width: 42px;
  height: 42px;
}

.ai-spinner.small {
  width: 18px;
  height: 18px;
}

.spinner-ring,
.spinner-core,
.spinner {
  animation: voice-spin 0.9s linear infinite;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2px solid var(--voice-accent-soft);
  border-top-color: var(--voice-accent);
  border-radius: 50%;
}

.spinner-core {
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: var(--voice-accent-soft);
}

.loading-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

@keyframes voice-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1280px) {
  .record-content {
    grid-template-columns: minmax(320px, 0.94fr) minmax(0, 1.06fr);
  }

  .decision-overview {
    grid-template-columns: 1fr;
  }

  .medicine-primary-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .secondary-field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .voice-content {
    padding: 16px;
  }

  .record-content {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 720px) {
  .voice-topbar,
  .decision-overview,
  .decision-card,
  .vcn-left-panel {
    padding: 14px;
  }

  .patient-summary-line,
  .card-title-line {
    flex-wrap: wrap;
  }

  .voice-topbar {
    align-items: flex-start;
  }

  .session-feedback-dialog-head {
    flex-direction: column;
  }

  .voice-footer {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .card-row,
  .treatment-section-header,
  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .card-actions {
    justify-content: flex-start;
  }

  .voice-feedback-panel {
    right: auto;
    left: 0;
  }

  .medicine-primary-fields,
  .secondary-field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
