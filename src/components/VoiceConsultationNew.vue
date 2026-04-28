<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import VoiceRecommendationFeedbackPopover from './VoiceRecommendationFeedbackPopover.vue';
import VoiceRecordFeedbackPopover from './VoiceRecordFeedbackPopover.vue';
import VoiceSessionFeedbackBar from './VoiceSessionFeedbackBar.vue';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { getHisAdapter } from '../services/his';
import type { DictionaryEntry, InventoryCheckRequest, MedicalItemPartOption, MedicineDetail, PharmacyOption } from '../services/his';
import { medicalDataService, type DiagnosisItem, type MedicalItem, type MedicineItem } from '../services/medicalData';
import { clearVoiceConsultationCache } from '../composables/useVoiceConsultation';
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
} from '../services/consultationUserLog';
import type { TreatmentRecommendation, Diagnosis } from '../types/consultation';
import type { AppPatient } from '../types/appState';
import type { VoiceIntentResult, MatchedTreatment, MatchedDiagnosis } from '../composables/useVoiceIntentRecognition';
import type {
  VoiceRecordFieldFeedbackDraft,
  VoiceRecordFieldKey,
  VoiceRecommendationFeedbackDraft,
  VoiceSessionFeedbackDraft,
} from '../types/voiceFeedback';

interface UsageOption {
  key: string;
  text: string;
  py: string;
  wb: string;
  mcode: string;
  execCount?: number;
  normalizedTokens: string[];
}

interface ExecDeptOption {
  key: string;
  text: string;
}

const props = defineProps<{
  initialPatientData?: AppPatient;
  intentResult: VoiceIntentResult | null;
}>();

const emit = defineEmits(['close', 'cancel']);

const showToast = inject<(msg: string, type?: string) => void>('showToast');

const chiefComplaint = ref('');
const historyOfPresentIllness = ref('');
const pastMedicalHistory = ref('');
const initialRecordSnapshot = ref<Record<VoiceRecordFieldKey, string>>({
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastMedicalHistory: '',
});

const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const selectedDiagnosisKeys = ref<Set<string>>(new Set());
const diagnosisLoading = ref(false);

const treatments = ref<TreatmentRecommendation[]>([]);
const treatmentLoading = ref(false);

const submitting = ref(false);
const showCancelConfirm = ref(false);

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const patientName = computed((): string => s(props.initialPatientData?.naPi) || s(props.initialPatientData?.['na_pi']) || s(props.initialPatientData?.name) || s(props.initialPatientData?.patientName) || s(props.initialPatientData?.['patient_name']));
const patientGender = computed((): string => s(props.initialPatientData?.sdSexText) || s(props.initialPatientData?.sdSex));
const patientAge = computed((): string => s(props.initialPatientData?.ageText) || (props.initialPatientData?.ageNum != null ? `${props.initialPatientData.ageNum}${s(props.initialPatientData.ageUnit) || '岁'}` : ''));
const patientIdCard = computed((): string => s(props.initialPatientData?.idCard));
const patientTetId = computed((): string => s(props.initialPatientData?.idTet));
const consultationId = computed((): string => resolveConsultationId());

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
  const matched = rec.matchedItem as MedicineItem | null | undefined;
  if (!matched || !Array.isArray(matched.storeIds)) {
    return [];
  }
  return matched.storeIds
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => Boolean(value));
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

function getMedicineInventoryKey(rec: TreatmentRecommendation): string {
  return getTreatmentEditorKey(rec);
}

function getMedicineInventoryWarning(rec: TreatmentRecommendation): string {
  return medicineInventoryWarnings.value[getMedicineInventoryKey(rec)] || '';
}

function clearMedicineInventoryWarning(rec: TreatmentRecommendation): void {
  const key = getMedicineInventoryKey(rec);
  if (!medicineInventoryWarnings.value[key]) {
    return;
  }

  const nextWarnings = { ...medicineInventoryWarnings.value };
  delete nextWarnings[key];
  medicineInventoryWarnings.value = nextWarnings;
}

function setMedicineInventoryWarning(rec: TreatmentRecommendation, message: string): void {
  medicineInventoryWarnings.value = {
    ...medicineInventoryWarnings.value,
    [getMedicineInventoryKey(rec)]: message,
  };
}

function isMedicineInventoryChecking(rec: TreatmentRecommendation): boolean {
  return medicineInventoryCheckingKeys.value.has(getMedicineInventoryKey(rec));
}

function setMedicineInventoryChecking(rec: TreatmentRecommendation, checking: boolean): void {
  const key = getMedicineInventoryKey(rec);
  const nextKeys = new Set(medicineInventoryCheckingKeys.value);
  if (checking) {
    nextKeys.add(key);
  } else {
    nextKeys.delete(key);
  }
  medicineInventoryCheckingKeys.value = nextKeys;
}

const getPatientAnchorId = (): string => {
  const patient = props.initialPatientData;
  return String(patient?.idPi || patient?.idTet || patient?.idMpi || '');
};

const resolveConsultationId = (): string => getPatientAnchorId() || 'unknown';

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

const canSubmit = computed(() => chiefComplaint.value.trim().length > 0 && selectedDiagnosis.value !== null && selectedDiagnoses.value.length > 0 && !submitting.value);

function handleCancelClick(): void {
  if (submitting.value) {
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
const activeSecondarySelectorKey = ref<string | null>(null);
const pharmacySearchKeywords = ref<Record<string, string>>({});
const execDeptSearchKeywords = ref<Record<string, string>>({});
const insuranceSearchKeywords = ref<Record<string, string>>({});
const bodySiteSearchKeywords = ref<Record<string, string>>({});
const activeFeedbackPopoverKey = ref<string | null>(null);
const showSessionFeedbackDialog = ref(false);
const medicineInventoryWarnings = ref<Record<string, string>>({});
const medicineInventoryCheckingKeys = ref<Set<string>>(new Set());

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
  return {
    id: diag.id || '',
    code: diag.code || '',
    name: diag.name || '',
    rationale: diag.rationale || '',
    selected: isDiagnosisSelected(diag),
    primary: isPrimaryDiagnosis(diag),
  };
}

function buildTreatmentFeedbackSnapshot(rec: TreatmentRecommendation): Record<string, unknown> {
  return {
    type: rec.type,
    name: rec.name,
    originalName: rec.originalName || '',
    reason: rec.reason || '',
    selected: !!rec.selected,
    matchedItem: rec.matchedItem || null,
    matchStatus: rec.matchStatus || 'unmatched',
    dosage: rec.dosage || '',
    dosageUnit: rec.dosageUnit || '',
    frequency: rec.frequency || '',
    route: rec.route || '',
    totalQty: rec.totalQty || '',
    totalUnit: rec.totalUnit || '',
    pharmacy: rec.pharmacy || '',
    execDept: rec.execDept || '',
    insuranceType: rec.insuranceType || '',
    bodySite: rec.bodySite || '',
    bodySiteId: rec.bodySiteId || '',
  };
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
  void submitConsultationUserLog({
    consultationId: consultationId.value,
    consultationType: 'voice',
    patient: props.initialPatientData || null,
    firstSnapshot: buildVoiceUserLogSnapshot(),
  });
}

function submitVoiceFinalUserLog(): void {
  const finalSnapshot = buildVoiceUserLogSnapshot();
  void submitConsultationUserLog({
    consultationId: consultationId.value,
    consultationType: 'voice',
    patient: props.initialPatientData || null,
    finalSnapshot,
    selectionSnapshot: buildConsultationSelectionSnapshot(finalSnapshot),
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
  emit('close');
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
  activeSecondarySelectorKey.value = null;
  frequencySearchKeywords.value = {};
  routeSearchKeywords.value = {};
  pharmacySearchKeywords.value = {};
  execDeptSearchKeywords.value = {};
  insuranceSearchKeywords.value = {};
  bodySiteSearchKeywords.value = {};
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
  if (rec.type === 'medicine') {
    return !!rec.selected;
  }

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

function splitDosageAndUnit(value?: string): { dosage: string; dosageUnit: string } {
  const raw = (value || '').trim();
  if (!raw) {
    return { dosage: '', dosageUnit: '' };
  }

  const matchedUnit = ['mg', 'g', 'ml', 'ug', '片', '粒', '支', '袋'].find((unit) => raw.endsWith(unit));
  if (!matchedUnit) {
    return { dosage: raw, dosageUnit: '' };
  }

  return {
    dosage: raw.slice(0, -matchedUnit.length).trim(),
    dosageUnit: matchedUnit,
  };
}

function formatMedicineSpec(spec?: string, unit?: string): string {
  const normalizedSpec = (spec || '').trim();
  const normalizedUnit = (unit || '').trim();

  if (!normalizedSpec) {
    return normalizedUnit;
  }

  if (!normalizedUnit) {
    return normalizedSpec;
  }

  if (normalizedSpec.includes(normalizedUnit)) {
    return normalizedSpec;
  }

  return `${normalizedSpec} ${normalizedUnit}`;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

/**
 * 从规格字符串中提取有效含量并归一化为 mg。
 * 示例: "0.25g" → 250, "10mg" → 10, "0.25" (默认 g) → 250
 */
function extractStrengthMg(value: string | undefined | null, unitHint?: string): number | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  // 尝试匹配带单位的数值: "0.25g", "10mg", "500ug"
  const withUnit = text.match(/^(\d+(?:\.\d+)?)\s*(g|mg|ug|μg|毫克|克|微克|ml|毫升)?$/i);
  if (!withUnit) return null;

  const num = parseFloat(withUnit[1]);
  if (isNaN(num) || num <= 0) return null;

  let unit = (withUnit[2] || unitHint || '').toLowerCase().trim();

  // 如果没有明确单位，尝试从数值大小推断
  if (!unit) {
    if (num < 1) unit = 'g';       // 0.25 → 大概率是 g
    else if (num <= 100) unit = 'mg'; // 10 → 大概率是 mg
    else return null;               // 无法推断
  }

  switch (unit) {
    case 'g':
    case '克':
      return num * 1000;
    case 'mg':
    case '毫克':
      return num;
    case 'ug':
    case 'μg':
    case '微克':
      return num / 1000;
    case 'ml':
    case '毫升':
      return null; // 液体单位不与固体互换
    default:
      return null;
  }
}

/**
 * 根据目标治疗剂量和每单位含量计算一次几个制剂单位。
 * @param targetDose  AI 目标剂量数值（如 "500"）
 * @param targetUnit  AI 剂量单位（如 "mg"）
 * @param unitDose    HIS 每制剂单位含量（如 "0.25"）
 * @param unitSpec    HIS 制剂规格（如 "0.25g"，用于推断单位）
 * @returns 制剂单位数（如 2），或 null 表示无法换算
 */
function computeDoseCount(
  targetDose: string | undefined,
  targetUnit: string | undefined,
  unitDose: string | undefined,
  unitSpec: string | undefined,
): number | null {
  if (!targetDose) return null;

  // 解析 AI 的目标剂量为 mg
  const targetMg = extractStrengthMg(targetDose, targetUnit);
  if (targetMg === null) return null;

  // 解析 HIS 的每单位含量为 mg
  // 优先用 dose 字段，其次从 spec 字段提取
  let unitMg = extractStrengthMg(unitDose, unitSpec ? undefined : undefined);
  if (unitMg === null && unitSpec) {
    // 从规格字符串提取: "0.25g*24粒/盒" → "0.25g" → 250mg
    const specMatch = unitSpec.match(/(\d+(?:\.\d+)?)\s*(g|mg|ug|μg)/i);
    if (specMatch) {
      unitMg = extractStrengthMg(specMatch[1], specMatch[2]);
    }
  }
  if (unitMg === null || unitMg <= 0) return null;

  const count = targetMg / unitMg;

  // 安全护栏：结果必须在合理范围 [0.25, 20]
  if (count < 0.25 || count > 20) return null;

  // 结果必须是 0.25 的倍数（临床常见: 0.5, 1, 1.5, 2, 3 等）
  const rounded = Math.round(count * 4) / 4;
  if (Math.abs(rounded - count) > 0.05) return null;

  return rounded;
}

/**
 * 格式化制剂单位数为字符串。
 * 1 → "1", 0.5 → "0.5", 2.0 → "2"
 */
function formatDoseCount(count: number): string {
  return count === Math.floor(count) ? String(count) : count.toFixed(2).replace(/0+$/, '');
}

function inferDosageFromText(text: string): { dosage: string; dosageUnit: string } {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return { dosage: '', dosageUnit: '' };
  }

  const matched = normalizedText.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|ug|片|粒|支|袋)/i);
  if (!matched) {
    return { dosage: '', dosageUnit: '' };
  }

  return {
    dosage: matched[1]?.trim() || '',
    dosageUnit: matched[2]?.trim() || '',
  };
}

function inferTotalFromText(text: string): { totalQty: string; totalUnit: string } {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return { totalQty: '', totalUnit: '' };
  }

  const explicitMatch = normalizedText.match(/(?:总量|共|开(?:具|立)?|发药|给)\s*(\d+(?:\.\d+)?)\s*(盒|瓶|袋|支|片|粒|包|板|次)/i);
  if (explicitMatch) {
    return {
      totalQty: explicitMatch[1]?.trim() || '',
      totalUnit: explicitMatch[2]?.trim() || '',
    };
  }

  const matches = Array.from(normalizedText.matchAll(/(\d+(?:\.\d+)?)\s*(盒|瓶|袋|支|片|粒|包|板|次)/gi));
  if (matches.length > 1) {
    const fallback = matches[matches.length - 1];
    return {
      totalQty: fallback?.[1]?.trim() || '',
      totalUnit: fallback?.[2]?.trim() || '',
    };
  }

  return { totalQty: '', totalUnit: '' };
}

function inferDaysFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';

  const matched = normalizedText.match(/(\d+(?:\s*[-~到至]\s*\d+)?)\s*天/i);
  return matched?.[1]?.replace(/\s+/g, '') || '';
}

function inferFrequencyFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';

  const exactOption = frequencyOptions.value.find((option) => normalizedText.includes(option.text));
  if (exactOption) return exactOption.text;

  const matched = normalizedText.match(/(每日[^，,；;。\s]*次?|每天[^，,；;。\s]*次?|每周[^，,；;。\s]*次?|隔日一次|必要时|立即|间隔\d+小时[^，,；;。\s]*|qd|bid|tid|qid|qn|prn|q\d+h)/i);
  return matched?.[0]?.trim() || '';
}

function inferExecCountFromFrequencyText(text: string): number | null {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return null;
  }

  if (normalizedText === 'qd' || normalizedText.includes('每天一次') || normalizedText.includes('每日一次')) {
    return 1;
  }
  if (normalizedText === 'bid' || normalizedText.includes('每天两次') || normalizedText.includes('每日两次')) {
    return 2;
  }
  if (normalizedText === 'tid' || normalizedText.includes('每天三次') || normalizedText.includes('每日三次')) {
    return 3;
  }
  if (normalizedText === 'qid' || normalizedText.includes('每天四次') || normalizedText.includes('每日四次')) {
    return 4;
  }
  if (normalizedText.includes('隔日一次')) {
    return 0.5;
  }

  const timesPerDayMatch = normalizedText.match(/每[日天]\D*(\d+(?:\.\d+)?)\D*次/);
  if (timesPerDayMatch?.[1]) {
    return parsePositiveNumber(timesPerDayMatch[1]);
  }

  const intervalMatch = normalizedText.match(/q(\d+(?:\.\d+)?)h/);
  if (intervalMatch?.[1]) {
    const hours = parsePositiveNumber(intervalMatch[1]);
    if (hours) {
      return 24 / hours;
    }
  }

  return null;
}

function resolveDoseCountPerAdministration(dosage: string, dosageUnit: string, dose: string, doseUnitHint: string): number | null {
  const dosageStrength = extractStrengthMg(dosage, dosageUnit);
  const singleUnitStrength = extractStrengthMg(dose, doseUnitHint);
  if (dosageStrength !== null && singleUnitStrength !== null && singleUnitStrength > 0) {
    return dosageStrength / singleUnitStrength;
  }

  const dosageCount = parsePositiveNumber(dosage);
  const doseCount = parsePositiveNumber(dose);
  if (dosageCount !== null && doseCount !== null && doseCount > 0) {
    return dosageCount / doseCount;
  }

  return null;
}

function inferRouteFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';
  return routeOptions.value.find((option) => normalizedText.includes(option.text))?.text || '';
}

function inferMedicineDefaults(rec: Partial<TreatmentRecommendation>): {
  dosage: string;
  dosageUnit: string;
  frequency: string;
  route: string;
  totalQty: string;
  totalUnit: string;
  days: string;
} {
  const dosagePair = splitDosageAndUnit(rec.dosage);
  const usageText = [rec.usage, rec.route].filter(Boolean).join('，');
  const daysText = [rec.days, rec.usage, rec.route, rec.reason].filter(Boolean).join('，');
  const inferredDosage = dosagePair.dosage || dosagePair.dosageUnit ? dosagePair : inferDosageFromText(usageText);
  const inferredTotal = rec.totalQty || rec.totalUnit
    ? { totalQty: rec.totalQty || '', totalUnit: rec.totalUnit || '' }
    : inferTotalFromText(usageText);

  return {
    dosage: rec.dosage || inferredDosage.dosage,
    dosageUnit: rec.dosageUnit || inferredDosage.dosageUnit,
    frequency: rec.frequency || inferFrequencyFromText([rec.frequency, usageText].filter(Boolean).join(' ')),
    route: rec.route || inferRouteFromText([rec.route, rec.usage].filter(Boolean).join(' ')),
    totalQty: rec.totalQty || inferredTotal.totalQty,
    totalUnit: rec.totalUnit || inferredTotal.totalUnit,
    days: rec.days || inferDaysFromText(daysText),
  };
}

function resolveMatchedMedicineDosageValue(
  currentDosage: string,
  fallbackDosage: string,
  raw: Record<string, unknown> | undefined,
): string {
  const hisDoseOnce = readFirstString(raw, ['dftDoseOnce']);
  return currentDosage || hisDoseOnce || fallbackDosage;
}

function resolveMatchedMedicineDosageUnit(
  _currentDosageUnit: string,
  _fallbackDosageUnit: string,
  raw: Record<string, unknown> | undefined,
): string {
  return readFirstString(raw, ['unitDose', 'unitPre']) || '';
}

function resolveMatchedMedicineFrequency(rec: Partial<TreatmentRecommendation>, fallbackFrequency: string): { frequency: string; frequencyKey: string } {
  const currentFrequencyValue = (rec.frequencyKey || rec.frequency || '').trim();
  const currentMatchedOption = currentFrequencyValue ? findFrequencyOptionByValue(currentFrequencyValue) : undefined;
  if (currentMatchedOption) {
    return {
      frequency: currentMatchedOption.text,
      frequencyKey: currentMatchedOption.key,
    };
  }

  const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
    ? rec.matchedItem.raw as Record<string, unknown>
    : undefined;
  const hisDefault = readFirstString(raw, ['dftFreq']).trim();
  if (hisDefault) {
    const hisMatchedOption = findFrequencyOptionByValue(hisDefault);
    if (hisMatchedOption) {
      return {
        frequency: hisMatchedOption.text,
        frequencyKey: hisMatchedOption.key,
      };
    }

    return {
      frequency: hisDefault,
      frequencyKey: '',
    };
  }

  const fallbackMatchedOption = fallbackFrequency ? findFrequencyOptionByValue(fallbackFrequency) : undefined;
  if (fallbackMatchedOption) {
    return {
      frequency: fallbackMatchedOption.text,
      frequencyKey: fallbackMatchedOption.key,
    };
  }

  return {
    frequency: '',
    frequencyKey: '',
  };
}

function resolveMatchedMedicineRoute(rec: Partial<TreatmentRecommendation>, fallbackRoute: string): { route: string; routeKey: string } {
  const currentRouteValue = (rec.routeKey || rec.route || '').trim();
  const currentMatchedOption = currentRouteValue ? findRouteOptionByValue(currentRouteValue) : undefined;
  if (currentMatchedOption) {
    return {
      route: currentMatchedOption.text,
      routeKey: currentMatchedOption.key,
    };
  }

  const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
    ? rec.matchedItem.raw as Record<string, unknown>
    : undefined;
  const hisDefault = readFirstString(raw, ['dftUsage']).trim();
  if (hisDefault) {
    const hisMatchedOption = findRouteOptionByValue(hisDefault);
    if (hisMatchedOption) {
      return {
        route: hisMatchedOption.text,
        routeKey: hisMatchedOption.key,
      };
    }

    return {
      route: hisDefault,
      routeKey: '',
    };
  }

  const fallbackMatchedOption = fallbackRoute ? findRouteOptionByValue(fallbackRoute) : undefined;
  if (fallbackMatchedOption) {
    return {
      route: fallbackMatchedOption.text,
      routeKey: fallbackMatchedOption.key,
    };
  }

  return {
    route: '',
    routeKey: '',
  };
}

function getFrequencyExecCount(rec: Partial<TreatmentRecommendation>): number | null {
  const frequencyValue = (rec.frequencyKey || rec.frequency || '').trim();
  if (!frequencyValue) {
    return null;
  }

  const matchedOption = frequencyOptions.value.find((option) => option.key === frequencyValue || option.text === frequencyValue);
  return matchedOption?.execCount ?? inferExecCountFromFrequencyText(matchedOption?.text || frequencyValue);
}

function resolveMedicineAutoTotal(rec: Partial<TreatmentRecommendation>): { totalQty: string; totalUnit: string } {
  if ((rec.type || 'medicine') !== 'medicine') {
    return { totalQty: rec.totalQty || '', totalUnit: rec.totalUnit || '' };
  }

  const raw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
    ? rec.matchedItem.raw as Record<string, unknown>
    : undefined;
  const totalUnit = (rec.totalUnit || readFirstString(raw, ['unitSale'])).trim();
  const dosage = (rec.dosage || '').trim();
  const dosageUnit = (rec.dosageUnit || '').trim();
  const hisDose = readFirstString(raw, ['dose']);
  const hisDoseUnit = readFirstString(raw, ['unitDose', 'unitPre']) || dosageUnit || readFirstString(raw, ['spec', 'specSale']);
  const days = parsePositiveNumber(rec.days);
  const unitSaleFactor = parsePositiveNumber(readFirstString(raw, ['unitSaleFactor']));
  const execCount = getFrequencyExecCount(rec);

  if (!totalUnit || !dosage || !hisDose || !days || !unitSaleFactor || !execCount) {
    return { totalQty: rec.totalQty || '', totalUnit };
  }

  const doseCount = resolveDoseCountPerAdministration(dosage, dosageUnit, hisDose, hisDoseUnit);
  if (doseCount === null || doseCount <= 0) {
    return { totalQty: rec.totalQty || '', totalUnit };
  }

  const totalQty = Math.ceil((doseCount * execCount * days) / unitSaleFactor);
  if (!Number.isFinite(totalQty) || totalQty <= 0) {
    return { totalQty: rec.totalQty || '', totalUnit };
  }

  return {
    totalQty: String(totalQty),
    totalUnit,
  };
}

function normalizeTreatmentRecommendation(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  const matchedRaw = rec.matchedItem?.raw && typeof rec.matchedItem.raw === 'object'
    ? rec.matchedItem.raw as Record<string, unknown>
    : undefined;
  const base: TreatmentRecommendation = {
    type: rec.type || 'medicine',
    name: rec.name || '',
    originalName: rec.originalName || '',
    reason: rec.reason || '',
    spec: rec.spec || '',
    targetDose: rec.targetDose || '',
    targetDoseUnit: rec.targetDoseUnit || '',
    usage: rec.usage || '',
    matchedItem: rec.matchedItem,
    suggestedMatchItem: rec.suggestedMatchItem,
    matchStatus: rec.matchStatus || (rec.matchedItem ? 'exact' : 'unmatched'),
    manualMatched: !!rec.manualMatched,
    selected: !!rec.selected,
    dosage: rec.dosage || '',
    dosageUnit: rec.dosageUnit || '',
    totalQty: rec.totalQty || (((rec.type || 'medicine') === 'exam' || (rec.type || 'medicine') === 'lab_test') ? '1' : ''),
    totalUnit: rec.totalUnit || '',
    totalManualEdited: !!rec.totalManualEdited,
    frequency: rec.frequency || '',
    frequencyKey: rec.frequencyKey || '',
    route: rec.route || '',
    routeKey: rec.routeKey || '',
    days: rec.days || '',
    pharmacy: rec.pharmacy || '',
    remark: rec.remark || '',
    regulatedDisease: rec.regulatedDisease || '',
    bodySite: rec.bodySite || '',
    bodySiteId: rec.bodySiteId || rec.matchedItem?.idPart || readFirstString(matchedRaw, ['idPart']),
    bodySiteOptions: rec.bodySiteOptions || [],
    execDept: rec.execDept || (rec.type && rec.type !== 'medicine'
      ? (rec.matchedItem?.idDeptExec || readFirstString(matchedRaw, ['idDeptExec', 'idDept']))
      : '') || '',
    insuranceType: rec.insuranceType || '医保使用',
  };

  if (isExecDeptRequired(base) && !getExecDeptDisplay(base)) {
    base.selected = false;
  }

  if (base.type !== 'medicine') {
    return base;
  }

  const defaults = inferMedicineDefaults(base);
  const hisRaw = getMatchedItemRaw(base);
  const frequencySelection = base.matchedItem
    ? resolveMatchedMedicineFrequency(base, defaults.frequency)
    : {
        frequency: base.frequency || defaults.frequency,
        frequencyKey: base.frequencyKey || findFrequencyOptionByValue(base.frequency || defaults.frequency)?.key || '',
      };
  const routeSelection = base.matchedItem
    ? resolveMatchedMedicineRoute(base, defaults.route)
    : {
        route: base.route || defaults.route,
        routeKey: base.routeKey || findRouteOptionByValue(base.route || defaults.route)?.key || '',
      };
  const normalizedMedicine = {
    ...base,
    dosage: base.matchedItem
      ? resolveMatchedMedicineDosageValue(base.dosage || '', defaults.dosage || '', hisRaw)
      : (base.dosage || defaults.dosage),
    dosageUnit: base.matchedItem
      ? resolveMatchedMedicineDosageUnit(base.dosageUnit || '', defaults.dosageUnit || '', hisRaw)
      : (base.dosageUnit || defaults.dosageUnit),
    frequency: frequencySelection.frequency,
    frequencyKey: frequencySelection.frequencyKey,
    route: routeSelection.route,
    routeKey: routeSelection.routeKey,
    totalQty: base.totalQty || defaults.totalQty,
    totalUnit: base.matchedItem
      ? (readFirstString(hisRaw, ['unitSale']) || base.totalUnit || defaults.totalUnit)
      : (base.totalUnit || defaults.totalUnit),
    days: base.days || defaults.days,
  };
  const autoTotal = resolveMedicineAutoTotal(normalizedMedicine);
  const preferManualTotal = !!rec.totalManualEdited;

  const normalizedResult = {
    ...normalizedMedicine,
    totalQty: preferManualTotal
      ? (normalizedMedicine.totalQty || autoTotal.totalQty)
      : (autoTotal.totalQty || normalizedMedicine.totalQty),
    totalUnit: preferManualTotal
      ? (normalizedMedicine.totalUnit || autoTotal.totalUnit)
      : (autoTotal.totalUnit || normalizedMedicine.totalUnit),
  };

  ensureMedicineDefaultPharmacy(normalizedResult);
  return normalizedResult;
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

function getManualMatchKey(rec: TreatmentRecommendation): string {
  return `manual-match:${rec.type}:${rec.name}`;
}

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

function handleManualMatchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setManualMatchKeyword(rec, target?.value || '');
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

function isMedicineSearchCandidate(candidate: MedicineItem | MedicalItem): candidate is MedicineItem {
  return 'spec' in candidate;
}

function getManualMatchCandidates(rec: TreatmentRecommendation): Array<MedicineItem | MedicalItem> {
  const query = getManualMatchKeyword(rec).trim();
  if (!query) {
    return [];
  }

  switch (rec.type) {
    case 'medicine':
      return medicalDataService.searchMedicines(query, undefined, 8);
    case 'exam':
      return medicalDataService.searchExamItems(query, undefined, 8);
    case 'lab_test':
      return medicalDataService.searchLabTestItems(query, undefined, 8);
    case 'procedure':
      return medicalDataService.searchProcedureItems(query, undefined, 8);
    default:
      return [];
  }
}

function buildMedicineMatchedItem(item: MedicineItem): TreatmentRecommendation['matchedItem'] {
  return {
    id: item.id,
    name: item.name,
    spec: item.spec,
    storeIds: Array.isArray(item.storeIds)
      ? Array.from(new Set(item.storeIds.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)))
      : [],
    idSrv: item.idSrv,
    naSrv: item.naSrv,
    sdSrv: item.sdSrv,
    idDeptExec: item.idDeptExec,
    fgCheckOrd: item.fgCheckOrd,
    fgSkintest: item.fgSkintest,
    raw: item.raw,
  };
}

function buildMedicalItemMatchedItem(item: MedicalItem): TreatmentRecommendation['matchedItem'] {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    idSrv: item.idSrv,
    naSrv: item.naSrv,
    sdSrv: item.sdSrv,
    idDeptExec: item.idDeptExec,
    idPart: item.idPart,
    jsonField: item.jsonField,
    fgCheckOrd: item.fgCheckOrd,
    raw: item.raw,
  };
}


function applyMedicalItemPartOption(rec: TreatmentRecommendation, option: MedicalItemPartOption): void {
  const partId = (option.partId || '').trim();
  const name = (option.name || option.partAndWay || '').trim();
  if (!partId && !name) {
    return;
  }

  const mergedRaw = {
    ...(getMatchedItemRaw(rec) || {}),
    ...option.raw,
    idPart: partId,
    partAndWay: option.partAndWay || name,
    sdPartAndWay: option.partAndWayCode || '',
    __partOptionsLoaded: true,
  };

  rec.bodySiteId = partId;
  rec.bodySite = name;
  rec.matchedItem = {
    ...(rec.matchedItem || {}),
    idPart: partId,
    raw: mergedRaw,
  };
}

function applyMedicalItemPartOptions(rec: TreatmentRecommendation, options: MedicalItemPartOption[]): void {
  if (rec.type !== 'exam') {
    return;
  }

  rec.bodySiteOptions = options;
  if (options.length === 0) {
    return;
  }

  const currentPartId = (rec.bodySiteId || rec.matchedItem?.idPart || readFirstString(getMatchedItemRaw(rec), ['idPart'])).trim();
  const matchedCurrent = currentPartId ? options.find((option) => option.partId === currentPartId) : undefined;
  if (matchedCurrent) {
    applyMedicalItemPartOption(rec, matchedCurrent);
    return;
  }

  if (options.length === 1) {
    applyMedicalItemPartOption(rec, options[0]);
  }
}

interface MedicineDetailLookupResult {
  detail: MedicineDetail;
  pharmacy: PharmacyOption;
}

function getMedicineDetailId(rec: TreatmentRecommendation): string {
  return (rec.matchedItem?.id || rec.matchedItem?.idSrv || readFirstString(getMatchedItemRaw(rec), ['idMedPro', 'idMed']) || '').trim();
}

function isValidMedicineProDetail(detail: MedicineDetail | null): detail is MedicineDetail {
  if (!detail || !detail.active) {
    return false;
  }

  return [
    detail.productId,
    detail.medicineId,
    detail.productName,
    detail.medicineName,
    detail.specSale,
    detail.unitSale,
    detail.dose,
    detail.defaultSingleDose,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function getCandidatePharmaciesForMedicine(rec?: TreatmentRecommendation): PharmacyOption[] {
  const seen = new Set<string>();
  const allowedStoreIds = rec ? new Set(getMatchedMedicineStoreIds(rec)) : null;
  const uniquePharmacies = pharmacyOptions.value.filter((pharmacy) => {
    const idSto = (pharmacy.idSto || '').trim();
    if (!idSto || seen.has(idSto)) {
      return false;
    }
    seen.add(idSto);
    return true;
  });

  if (!allowedStoreIds || allowedStoreIds.size === 0) {
    return uniquePharmacies;
  }

  const scopedPharmacies = uniquePharmacies.filter((pharmacy) => allowedStoreIds.has((pharmacy.idSto || '').trim()));
  if (scopedPharmacies.length > 0) {
    return scopedPharmacies;
  }

  console.warn('[VoiceConsultationNew] Matched medicine storeIds do not intersect current available pharmacies', {
    name: rec?.name,
    matchedStoreIds: Array.from(allowedStoreIds),
    availableStoreIds: uniquePharmacies.map((pharmacy) => pharmacy.idSto).filter(Boolean),
  });
  return [];
}

function isMedicineDetailLoadedForSelectedPharmacy(rec: TreatmentRecommendation): boolean {
  const raw = getMatchedItemRaw(rec);
  if (raw?.__medicineDetailLoaded !== true) {
    return false;
  }

  const pharmacyName = (rec.pharmacy || '').trim();
  const detailStoreId = readFirstString(raw, ['idSto']);
  if (!pharmacyName || !detailStoreId) {
    return false;
  }

  return pharmacyOptions.value.some((option) => option.name === pharmacyName && option.idSto === detailStoreId);
}

async function fetchFirstValidMedicineDetail(rec: TreatmentRecommendation): Promise<MedicineDetailLookupResult | null> {
  const his = getHisAdapter();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, medicine detail unavailable', { name: rec.name });
    return null;
  }

  const id = getMedicineDetailId(rec);
  if (!id) {
    return null;
  }

  const pharmacies = getCandidatePharmaciesForMedicine(rec);
  if (pharmacies.length === 0) {
    console.warn('[VoiceConsultationNew] No pharmacy idSto available for matched medicine, medicine detail unavailable', {
      name: rec.name,
      matchedStoreIds: getMatchedMedicineStoreIds(rec),
    });
    return null;
  }

  for (const pharmacy of pharmacies) {
    const idSto = (pharmacy.idSto || '').trim();
    const detail = await his.fetchMedicineProDetail(id, idSto);
    if (isValidMedicineProDetail(detail)) {
      return { detail, pharmacy };
    }

    console.info('[VoiceConsultationNew] Medicine detail not found in pharmacy, trying next pharmacy', {
      name: rec.name,
      id,
      idSto,
      pharmacyName: pharmacy.name,
    });
  }

  return null;
}

async function ensureMedicineSelectable(rec: TreatmentRecommendation, notify = false): Promise<boolean> {
  if (rec.type !== 'medicine') {
    return true;
  }

  if (isMedicineDetailLoadedForSelectedPharmacy(rec)) {
    return true;
  }

  const hydrated = await hydrateMatchedMedicineDetail(rec);
  if (!hydrated && notify) {
    showToast?.(`${rec.name} 在当前可用发药药房中均不存在药品详情，不能选中`, 'warning');
  }

  return hydrated;
}

function buildMedicineInventoryCheckItem(rec: TreatmentRecommendation): InventoryCheckRequest | null {
  const normalized = normalizeTreatmentRecommendation(rec);
  const raw = getMatchedItemRaw(rec);
  const storeId = getSelectedPharmacyOption(rec)?.idSto || readFirstString(raw, ['idSto']);
  const productId = readFirstString(raw, ['idMedPro']) || rec.matchedItem?.id || rec.matchedItem?.idSrv || '';
  const medicineName = readFirstString(raw, ['naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '';
  const quantity = parsePositiveNumber(normalized.totalQty);
  const unitPrice = parsePositiveNumber(readFirstString(raw, ['priceSale'])) ?? 0;

  if (!storeId || !productId || !medicineName || !quantity) {
    return null;
  }

  return {
    storeId,
    productId,
    medicineName,
    quantity,
    unitPrice,
    businessType: 'outpatient',
  };
}

async function checkMedicineInventoryEnough(rec: TreatmentRecommendation, notify = false): Promise<boolean> {
  if (rec.type !== 'medicine') {
    return true;
  }

  if (!(await ensureMedicineSelectable(rec, notify))) {
    return false;
  }

  const his = getHisAdapter();
  const checkItem = buildMedicineInventoryCheckItem(rec);
  if (!his || !checkItem) {
    return true;
  }

  setMedicineInventoryChecking(rec, true);
  try {
    const result = await his.checkMedicineInventoryEnough([checkItem]);
    if (result.code === 200) {
      clearMedicineInventoryWarning(rec);
      return true;
    }

    const message = result.message || `${rec.name} 库存不足，请调整用药数量或药房`;
    setMedicineInventoryWarning(rec, message);
    if (notify) {
      showToast?.(message, 'warning');
    }
    return false;
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to check medicine inventory', {
      name: rec.name,
      checkItem,
      error,
    });
    if (notify) {
      showToast?.('库存校验失败，请稍后重试或手动确认库存', 'warning');
    }
    return false;
  } finally {
    setMedicineInventoryChecking(rec, false);
  }
}

async function hydrateMatchedMedicineDetail(rec: TreatmentRecommendation): Promise<boolean> {
  if (rec.type !== 'medicine' || !rec.matchedItem) {
    return false;
  }

  const id = getMedicineDetailId(rec);
  if (!id) {
    return false;
  }

  try {
    const lookupResult = await fetchFirstValidMedicineDetail(rec);
    if (!lookupResult) {
      if (getCandidatePharmaciesForMedicine(rec).length > 0) {
        rec.selected = false;
      }
      console.warn('[VoiceConsultationNew] Medicine detail unavailable in all pharmacies', {
        id,
        name: rec.name,
        pharmacyCount: getCandidatePharmaciesForMedicine(rec).length,
      });
      return false;
    }

    const { detail, pharmacy } = lookupResult;
    const idSto = (pharmacy.idSto || '').trim();

    const mergedRaw = {
      ...(getMatchedItemRaw(rec) || {}),
      ...detail.raw,
      idSto: detail.storeId || idSto,
      __medicineDetailLoaded: true,
    };

    rec.matchedItem = {
      ...rec.matchedItem,
      name: detail.productName?.trim() || rec.matchedItem.name || rec.name,
      fgSkintest: detail.needsSkinTest ? '1' : (rec.matchedItem.fgSkintest || '0'),
      raw: mergedRaw,
    };

    // 剂量换算优先级：
    // 1. AI targetDose + HIS dose → 自动换算（最可靠）
    // 2. HIS defaultSingleDose → 直接使用（降级方案）
    // 3. AI dosage → 保留原值（最低优先级）
    const doseUnit = detail.doseUnit || '';
    const computedCount = computeDoseCount(
      rec.targetDose,
      rec.targetDoseUnit,
      detail.dose,
      detail.spec || detail.specSale,
    );

    if (computedCount !== null) {
      // 换算成功：一次 N 个制剂单位
      rec.dosage = formatDoseCount(computedCount);
      rec.dosageUnit = doseUnit || '片';
      console.log('[VoiceConsultationNew] Dose computed from targetDose', {
        name: rec.name,
        targetDose: rec.targetDose,
        targetDoseUnit: rec.targetDoseUnit,
        hisDose: detail.dose,
        hisSpec: detail.spec,
        computedCount,
      });
    } else if (detail.defaultSingleDose) {
      // 降级：使用 HIS 默认值
      rec.dosage = rec.dosage || detail.defaultSingleDose;
    }

    if (doseUnit) {
      rec.dosageUnit = doseUnit;
    }

    // HIS 默认频次：如果当前频次不能匹配业务字典，则用 HIS 默认值覆盖
    if (detail.defaultFrequency) {
      const hisFreqOption = findFrequencyOptionByValue(detail.defaultFrequency);
      const currentFreqMatched = rec.frequencyKey ? findFrequencyOptionByValue(rec.frequencyKey) : findFrequencyOptionByValue(rec.frequency);
      if (hisFreqOption && !currentFreqMatched) {
        rec.frequency = hisFreqOption.text;
        rec.frequencyKey = hisFreqOption.key;
      } else if (!rec.frequency && hisFreqOption) {
        rec.frequency = hisFreqOption.text;
        rec.frequencyKey = hisFreqOption.key;
      } else if (!currentFreqMatched) {
        rec.frequency = detail.defaultFrequency;
        rec.frequencyKey = hisFreqOption?.key || '';
      }
    } else if (rec.frequency && !findFrequencyOptionByValue(rec.frequencyKey || rec.frequency)) {
      rec.frequency = '';
      rec.frequencyKey = '';
    }

    // HIS 默认用法：如果当前用法不能匹配业务字典，则用 HIS 默认值覆盖
    if (detail.defaultRoute) {
      const hisRouteOption = findRouteOptionByValue(detail.defaultRoute);
      const currentRouteMatched = rec.routeKey ? findRouteOptionByValue(rec.routeKey) : findRouteOptionByValue(rec.route);
      if (hisRouteOption && !currentRouteMatched) {
        rec.route = hisRouteOption.text;
        rec.routeKey = hisRouteOption.key;
      } else if (!rec.route && hisRouteOption) {
        rec.route = hisRouteOption.text;
        rec.routeKey = hisRouteOption.key;
      } else if (!currentRouteMatched) {
        rec.route = detail.defaultRoute;
        rec.routeKey = hisRouteOption?.key || '';
      }
    } else if (rec.route && !findRouteOptionByValue(rec.routeKey || rec.route)) {
      rec.route = '';
      rec.routeKey = '';
    }

    // 回填规格信息（始终使用 HIS 权威值）
    if (detail.specSale || detail.unitSale) {
      rec.spec = formatMedicineSpec(detail.specSale, detail.unitSale);
    }

    if (detail.unitSale) {
      rec.totalUnit = detail.unitSale;
    }

    rec.pharmacy = pharmacy.name;

    console.log('[VoiceConsultationNew] Medicine detail hydrated', {
      name: rec.name,
      id,
      idSto,
      defaultSingleDose: detail.defaultSingleDose,
      defaultFrequency: detail.defaultFrequency,
      defaultRoute: detail.defaultRoute,
      specSale: detail.specSale,
      hisDose: detail.dose,
      appliedDosage: rec.dosage,
      appliedDosageUnit: rec.dosageUnit,
      appliedFrequency: rec.frequency,
      appliedRoute: rec.route,
      appliedPharmacy: rec.pharmacy,
    });
    return true;
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to hydrate medicine detail', {
      id,
      name: rec.name,
      error,
    });
    rec.selected = false;
    return false;
  }
}

async function hydrateMatchedMedicalItemDetail(rec: TreatmentRecommendation): Promise<void> {
  if (!rec.matchedItem) {
    return;
  }

  if (rec.type === 'medicine') {
    await hydrateMatchedMedicineDetail(rec);
    return;
  }

  const his = getHisAdapter();
  if (!his) {
    return;
  }

  const idCli = (rec.matchedItem.code || readFirstString(getMatchedItemRaw(rec), ['idCli']) || '').trim();
  if (!idCli) {
    return;
  }

  try {
    const detail = await his.fetchMedicalItemDetail(idCli);
    if (!detail) {
      if (rec.type === 'exam') {
        const partOptions = await his.fetchMedicalItemPartOptions(idCli);
        applyMedicalItemPartOptions(rec, partOptions);
      }
      return;
    }

    const mergedRaw = {
      ...(getMatchedItemRaw(rec) || {}),
      ...detail.raw,
      __detailLoaded: true,
    };

    rec.matchedItem = {
      ...rec.matchedItem,
      name: detail.itemName?.trim() || rec.matchedItem.name || rec.name,
      code: detail.itemId?.trim() || rec.matchedItem.code || idCli,
      idDeptExec: detail.executingDeptId || rec.matchedItem.idDeptExec || '',
      raw: mergedRaw,
    };

    if (!rec.execDept && detail.executingDeptId) {
      rec.execDept = detail.executingDeptId;
    }

    if (!rec.totalUnit && detail.unit) {
      rec.totalUnit = detail.unit;
    }

    if (rec.type === 'exam') {
      try {
        const partOptions = await his.fetchMedicalItemPartOptions(detail.itemId || idCli);
        applyMedicalItemPartOptions(rec, partOptions);
      } catch (partError) {
        console.error('[VoiceConsultationNew] Failed to hydrate medical item part options', {
          idCli: detail.itemId || idCli,
          name: rec.name,
          error: partError,
        });
      }
    }

    syncTreatmentExecDeptSelections();
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to hydrate medical item detail', {
      idCli,
      name: rec.name,
      error,
    });
  }
}

async function hydrateMatchedMedicalItemDetails(items: TreatmentRecommendation[]): Promise<void> {
  const candidates = items.filter((item) => !!item.matchedItem);
  await Promise.all(candidates.map((item) => hydrateMatchedMedicalItemDetail(item)));
}

function assessTreatmentCatalogMatch(
  type: TreatmentRecommendation['type'],
  name: string,
  aliases?: string[],
  spec?: string,
): Pick<TreatmentRecommendation, 'matchedItem' | 'suggestedMatchItem' | 'matchStatus'> {
  switch (type) {
    case 'medicine': {
      const result = medicalDataService.assessMedicineMatch(name, aliases, spec);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicineMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicineMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'exam': {
      const result = medicalDataService.assessExamItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'lab_test': {
      const result = medicalDataService.assessLabTestItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    case 'procedure': {
      const result = medicalDataService.assessProcedureItemMatch(name, aliases);
      return {
        matchedItem: result.status === 'exact' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        suggestedMatchItem: result.status === 'probable' && result.candidate ? buildMedicalItemMatchedItem(result.candidate) : undefined,
        matchStatus: result.status,
      };
    }
    default:
      return {
        matchedItem: undefined,
        suggestedMatchItem: undefined,
        matchStatus: 'unmatched',
      };
  }
}

function hasProbableMatch(rec: TreatmentRecommendation): boolean {
  return rec.matchStatus === 'probable' && !!rec.suggestedMatchItem;
}

function getSuggestedMatchName(rec: TreatmentRecommendation): string {
  return (rec.suggestedMatchItem?.name || '').trim();
}

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

  rec.selected = true;

  showToast?.(`${rec.name} 已确认匹配`, 'success');
}

async function applyManualMatch(rec: TreatmentRecommendation, candidate: MedicineItem | MedicalItem, event?: Event): Promise<void> {
  event?.stopPropagation();

  if (rec.type === 'medicine' && isMedicineSearchCandidate(candidate)) {
    rec.matchedItem = buildMedicineMatchedItem(candidate);
    rec.spec = candidate.spec || rec.spec || '';
  } else if (rec.type !== 'medicine' && !isMedicineSearchCandidate(candidate)) {
    rec.matchedItem = buildMedicalItemMatchedItem(candidate);
  } else {
    return;
  }

  rec.originalName = rec.originalName || rec.name;
  rec.name = candidate.name;
  rec.manualMatched = true;
  rec.matchStatus = 'manual';
  rec.selected = false;
  rec.suggestedMatchItem = undefined;

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

  item.selected = nextSelected;

  if (item.selected && item.type === 'medicine') {
    Object.assign(item, normalizeTreatmentRecommendation(item));
  }

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

function getReasonTooltipKey(kind: 'diagnosis' | 'treatment', primary: string, secondary = ''): string {
  return `${kind}:${primary}:${secondary}`;
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

    const response = await chat(messages);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    const parsed: Diagnosis[] = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);

    aiDiagnoses.value = parsed.map((diag) => {
      const matched = medicalDataService.matchDiagnosis(diag.name) || medicalDataService.matchDiagnosis(diag.code);
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
      ]),
      chat([
        { role: 'system', content: PROMPTS.consultation.examinationRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.examinationRecommendation.buildUserPrompt(baseParams) },
      ]),
      chat([
        { role: 'system', content: PROMPTS.consultation.labTestRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.labTestRecommendation.buildUserPrompt(baseParams) },
      ]),
      chat([
        { role: 'system', content: PROMPTS.consultation.procedureRecommendation.system },
        { role: 'user', content: PROMPTS.consultation.procedureRecommendation.buildUserPrompt(baseParams) },
      ]),
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
    void registerCurrentRecommendations();
    void hydrateMatchedMedicalItemDetails(nextTreatments);
    void performTreatmentFactCheck(nextTreatments);
    submitVoiceGeneratedUserLog();
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

function toggleRelatedDropdown(diag: Diagnosis, event: Event): void {
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

function swapDiagnosis(originalDiag: Diagnosis, newItem: DiagnosisItem): void {
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

const frequencyOptions = ref<UsageOption[]>(dedupeUsageOptions([
  createUsageOption({ key: '每天一次', text: '每天一次', execCount: 1 }),
  createUsageOption({ key: '每天两次', text: '每天两次', execCount: 2 }),
  createUsageOption({ key: '每天三次', text: '每天三次', execCount: 3 }),
  createUsageOption({ key: '隔日一次', text: '隔日一次', execCount: 0.5 }),
  createUsageOption({ key: '每周一次', text: '每周一次' }),
  createUsageOption({ key: '每周两次', text: '每周两次' }),
  createUsageOption({ key: '必要时', text: '必要时' }),
  createUsageOption({ key: '立即', text: '立即', execCount: 1 }),
]));

function normalizeUsageKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function createUsageOption(item: {
  key?: string;
  text?: string;
  py?: string;
  wb?: string;
  mcode?: string;
  properties?: Record<string, unknown>;
  execCount?: number | string;
}): UsageOption {
  const text = (item.text || '').trim();
  const py = (item.py || '').trim();
  const wb = (item.wb || '').trim();
  const mcode = (item.mcode || '').trim();
  const key = (item.key || text).trim();
  const execCount = parsePositiveNumber(item.execCount ?? item.properties?.execCount) ?? inferExecCountFromFrequencyText(text) ?? undefined;

  return {
    key,
    text,
    py,
    wb,
    mcode,
    execCount,
    normalizedTokens: Array.from(new Set(
      [text, py, wb, mcode, key]
        .map(normalizeUsageKeyword)
        .filter(Boolean)
    )),
  };
}

function dedupeUsageOptions(items: UsageOption[]): UsageOption[] {
  const unique = new Map<string, UsageOption>();

  items.forEach((item) => {
    if (!item.text) return;

    const identity = item.key || item.text;
    if (!unique.has(identity)) {
      unique.set(identity, item);
    }
  });

  return Array.from(unique.values());
}

const routeOptions = ref<UsageOption[]>(dedupeUsageOptions([
  createUsageOption({ key: '口服', text: '口服', py: 'kf' }),
  createUsageOption({ key: '静脉注射', text: '静脉注射', py: 'jmzs' }),
  createUsageOption({ key: '肌肉注射', text: '肌肉注射', py: 'jrzs' }),
  createUsageOption({ key: '皮下注射', text: '皮下注射', py: 'pxzs' }),
  createUsageOption({ key: '外用', text: '外用', py: 'wy' }),
  createUsageOption({ key: '雾化吸入', text: '雾化吸入', py: 'whxr' }),
  createUsageOption({ key: '舌下含服', text: '舌下含服', py: 'sxhf' }),
  createUsageOption({ key: '直肠给药', text: '直肠给药', py: 'zcgy' }),
  createUsageOption({ key: '滴眼', text: '滴眼', py: 'dy' }),
]));

async function fetchFrequencyOptions(): Promise<void> {
  const his = getHisAdapter();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, using default frequency options');
    return;
  }

  try {
    const items = await his.fetchFrequencyDictionary();
    if (items.length) {
      frequencyOptions.value = dedupeUsageOptions(items.map((item) => createUsageOption(item)));
    }
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load frequency options from HIS', error);
  }
}

async function fetchRouteOptions(): Promise<void> {
  const his = getHisAdapter();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, using default route options');
    return;
  }

  try {
    const items = await his.fetchMedicineUsageDictionary();
    if (items.length > 0) {
      routeOptions.value = dedupeUsageOptions(items.map((item) => createUsageOption(item)));
    }
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load route options from HIS', error);
  }
}

function fetchPharmacyOptions(): Promise<void> {
  if (!pharmacyOptionsPromise) {
    pharmacyOptionsPromise = loadPharmacyOptions().finally(() => {
      pharmacyOptionsPromise = null;
    });
  }

  return pharmacyOptionsPromise;
}

async function loadPharmacyOptions(): Promise<void> {
  const his = getHisAdapter();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, pharmacy options skipped');
    pharmacyOptions.value = [];
    return;
  }

  try {
    const availablePharmacies = await his.fetchAvailablePharmacies();
    pharmacyOptions.value = availablePharmacies.length > 0
      ? availablePharmacies
      : (await his.fetchMedicineStoreIds('')).map((idSto) => ({
          name: idSto,
          idDept: '',
          idSto,
        }));
    const activeStoreIds = pharmacyOptions.value
      .map((option) => (option.idSto || '').trim())
      .filter((value): value is string => Boolean(value));
    await medicalDataService.ensureMedicineCatalogForStoreIds(activeStoreIds, his);
    void hydrateMatchedMedicalItemDetails(treatments.value);
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load pharmacy options from HIS', error);
    pharmacyOptions.value = [];
    medicalDataService.setActivePharmacyStoreIds(null);
  }
}

function dedupeExecDeptOptions(items: DictionaryEntry[]): ExecDeptOption[] {
  const unique = new Map<string, ExecDeptOption>();

  items.forEach((item) => {
    const key = (item.key || item.text || '').trim();
    const text = (item.text || item.key || '').trim();
    if (!key || !text || unique.has(key)) {
      return;
    }

    unique.set(key, { key, text });
  });

  return Array.from(unique.values());
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

function isExecDeptRequired(rec: TreatmentRecommendation): boolean {
  return rec.type === 'exam' || rec.type === 'lab_test';
}

function getExecDeptDisplay(rec: TreatmentRecommendation): string {
  const currentValue = (rec.execDept || '').trim();
  if (!currentValue) {
    return '';
  }

  const matched = execDeptOptions.value.find((option) => option.key === currentValue || option.text === currentValue);
  return matched?.text || currentValue;
}

function hasRequiredExecDept(rec: TreatmentRecommendation): boolean {
  return !isExecDeptRequired(rec) || !!getExecDeptDisplay(rec);
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

// === 药品发药药房必填机制（复用检查/检验“医技科室”同样的门禁与 Chip 呈现方案） ===
function isPharmacyRequired(rec: TreatmentRecommendation): boolean {
  return rec.type === 'medicine';
}

function getPharmacyDisplay(rec: TreatmentRecommendation): string {
  const currentValue = (rec.pharmacy || '').trim();
  if (!currentValue) {
    return '';
  }

  // 只认“当前药品实际拥有”的药房（matchedItem.storeIds ∩ 有效发药药房）
  const allowed = isPharmacyRequired(rec)
    ? getCandidatePharmaciesForMedicine(rec)
    : pharmacyOptions.value;
  const matched = allowed.find((option) => option.name === currentValue || option.idSto === currentValue);
  return matched?.name || '';
}

function hasRequiredPharmacy(rec: TreatmentRecommendation): boolean {
  return !isPharmacyRequired(rec) || !!getPharmacyDisplay(rec);
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

async function fetchExecDeptOptions(): Promise<void> {
  const his = getHisAdapter();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, execution department options skipped');
    execDeptOptions.value = [];
    return;
  }

  try {
    const items = await his.fetchExecutionDepartments();
    execDeptOptions.value = dedupeExecDeptOptions(items);
    syncTreatmentExecDeptSelections();
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load execution department options from HIS', error);
    execDeptOptions.value = [];
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown);
  void Promise.all([fetchFrequencyOptions(), fetchRouteOptions(), fetchPharmacyOptions(), fetchExecDeptOptions()]);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown);
});
const pharmacyOptions = ref<PharmacyOption[]>([]);
const execDeptOptions = ref<ExecDeptOption[]>([]);
const insuranceOptions = ['医保使用', '自费'];
let pharmacyOptionsPromise: Promise<void> | null = null;

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

function toPositiveNumber(value: unknown, fallback = 1): number {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.idSrv || readFirstString(raw, ['idSrv', 'idCli', 'idMedPro', 'idMed', 'id']) || rec.matchedItem?.id || '').trim();
}

function getOrderServiceName(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.naSrv || readFirstString(raw, ['naSrv', 'naCli', 'naMedPro', 'naMed']) || rec.matchedItem?.name || rec.name || '').trim();
}

function getSelectedPharmacyOption(rec: TreatmentRecommendation): PharmacyOption | undefined {
  const pharmacyName = (rec.pharmacy || '').trim();
  if (!pharmacyName) {
    return getDefaultPharmacyOption(rec);
  }

  return pharmacyOptions.value.find((option) => option.name === pharmacyName) || getDefaultPharmacyOption(rec);
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
  const normalized = normalizeTreatmentRecommendation(rec);
  const orderServiceId = getOrderServiceId(rec);
  const execDeptId = getOrderExecDeptId(rec);
  const base: Record<string, string | number> = {
    amount: toPositiveNumber(normalized.totalQty, 1),
    fgCheckOrd: getOrderFgCheckOrd(rec),
    sdSrv: getOrderServiceCode(rec),
    naSrv: getOrderServiceName(rec),
    idDeptExec: execDeptId,
    ...(orderServiceId ? { idSrv: orderServiceId } : {}),
  };

  if (rec.type === 'medicine') {
    return {
      ...base,
      doseOnce: normalized.dosage || '',
      unitDose: normalized.dosageUnit || '',
      idFreq: getResolvedFrequencyKey(rec),
      idUsge: getResolvedRouteKey(rec),
      takeDays: toPositiveNumber(normalized.days, 1),
      fgSkintest: getOrderFgSkintest(rec),
    };
  }

  const partId = getOrderPartId(rec);
  const jsonField = getOrderJsonField(rec);

  return {
    ...base,
    ...(partId ? { idPart: partId } : {}),
    ...(jsonField ? { jsonField: jsonField } : { jsonField:"{}" }),
  };
}

function getDiagnosisCategoryCode(diag: Diagnosis): string {
  return diag.isTCM ? '2' : '1';
}

function getDiagnosisCategoryText(diag: Diagnosis): string {
  return diag.isTCM ? '中医诊断' : '西医诊断';
}

function buildDiagList(): Array<Record<string, string>> {
  const primaryKey = getDiagnosisKey(selectedDiagnosis.value);
  const orderedDiagnoses = [...selectedDiagnoses.value].sort((left, right) => {
    if (getDiagnosisKey(left) === primaryKey) return -1;
    if (getDiagnosisKey(right) === primaryKey) return 1;
    return 0;
  });

  return orderedDiagnoses.map((diag) => ({
    idTet: patientTetId.value,
    idDiag: diag.id || '',
    naDiag: diag.name,
    sdDiag: getDiagnosisCategoryCode(diag),
    cdIcd10: diag.code || '',
    naIcd10: diag.name,
    fgMain: getDiagnosisKey(diag) === primaryKey ? '1' : '0',
    sdDiagText: getDiagnosisCategoryText(diag),
  }));
}

function getTreatmentSpec(rec: TreatmentRecommendation): string {
  return rec.type === 'medicine' ? rec.spec || rec.matchedItem?.spec || '' : '';
}

function getTreatmentMatchLabel(rec: TreatmentRecommendation): string {
  if (rec.matchStatus === 'manual') return '已手动匹配';
  if (rec.matchStatus === 'confirmed') return '已确认匹配';
  if (rec.matchStatus === 'exact') return '匹配成功';
  if (rec.matchStatus === 'probable') return '待确认';
  if (!rec.matchedItem) return '';
  return '匹配成功';
}

function getTreatmentOriginalName(rec: TreatmentRecommendation): string {
  if (rec.matchStatus !== 'manual' && rec.matchStatus !== 'confirmed') {
    return '';
  }

  const originalName = (rec.originalName || '').trim();
  if (!originalName || originalName === rec.name) {
    return '';
  }

  return originalName;
}

function formatOptionLabel(option: UsageOption): string {
  const text = option.text.trim();
  const key = option.key.trim();
  if (!key || key === text) {
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

function getMedicineInlineSummary(rec: TreatmentRecommendation): string {
  const normalized = normalizeTreatmentRecommendation(rec);
  const parts = [
    normalized.dosage || normalized.dosageUnit ? `一次剂量 ${[normalized.dosage, normalized.dosageUnit].filter(Boolean).join(' ')}` : '',
    normalized.frequency ? `频次 ${getFrequencyDisplayValue(normalized.frequency)}` : '',
    normalized.route ? `用法 ${normalized.route}` : '',
    normalized.days ? `天数 ${normalized.days}天` : '',
    normalized.totalQty || normalized.totalUnit ? `总量 ${[normalized.totalQty, normalized.totalUnit].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean);

  return parts.join(' / ');
}

function isMedicineFieldEmpty(rec: TreatmentRecommendation, field: MedicinePrimaryField): boolean {
  const normalized = normalizeTreatmentRecommendation(rec);

  switch (field) {
    case 'dosage':
      return !normalized.dosage && !normalized.dosageUnit;
    case 'frequency':
      return !normalized.frequency;
    case 'route':
      return !normalized.route;
    case 'total':
      return !normalized.totalQty && !normalized.totalUnit && !normalized.days;
  }
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

function handleFrequencySearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setFrequencySearchKeyword(rec, target?.value || '');
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

function selectFrequencyOption(rec: TreatmentRecommendation, option: UsageOption): void {
  rec.frequency = option.text;
  rec.frequencyKey = option.key;
  setFrequencySearchKeyword(rec, option.text);
  activeEditableFieldKey.value = null;
}

function clearFrequencySelection(rec: TreatmentRecommendation): void {
  rec.frequency = '';
  rec.frequencyKey = '';
  setFrequencySearchKeyword(rec, '');
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

function handleRouteSearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setRouteSearchKeyword(rec, target?.value || '');
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

function selectRouteOption(rec: TreatmentRecommendation, option: UsageOption): void {
  rec.route = option.text;
  rec.routeKey = option.key;
  setRouteSearchKeyword(rec, option.text);
  activeEditableFieldKey.value = null;
}

function clearRouteSelection(rec: TreatmentRecommendation): void {
  rec.route = '';
  rec.routeKey = '';
  setRouteSearchKeyword(rec, '');
}

type SecondarySelectorField = 'pharmacy' | 'execDept' | 'insurance' | 'bodySite';

function getSecondarySelectorKey(rec: TreatmentRecommendation, field: SecondarySelectorField): string {
  return `${getTreatmentEditorKey(rec)}:${field}`;
}

function isSecondarySelectorOpen(rec: TreatmentRecommendation, field: SecondarySelectorField): boolean {
  return activeSecondarySelectorKey.value === getSecondarySelectorKey(rec, field);
}

function openSecondarySelector(rec: TreatmentRecommendation, field: SecondarySelectorField): void {
  activeSecondarySelectorKey.value = getSecondarySelectorKey(rec, field);
  if (field === 'pharmacy') {
    syncPharmacySearchKeyword(rec);
  } else if (field === 'execDept') {
    syncExecDeptSearchKeyword(rec);
  } else if (field === 'bodySite') {
    syncBodySiteSearchKeyword(rec);
  } else {
    syncInsuranceSearchKeyword(rec);
  }
}

function closeSecondarySelector(rec: TreatmentRecommendation, field: SecondarySelectorField, event: FocusEvent): void {
  const container = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (container && nextTarget && container.contains(nextTarget)) {
    return;
  }

  if (field === 'pharmacy') {
    syncPharmacySearchKeyword(rec);
  } else if (field === 'execDept') {
    syncExecDeptSearchKeyword(rec);
  } else if (field === 'bodySite') {
    syncBodySiteSearchKeyword(rec);
  } else {
    syncInsuranceSearchKeyword(rec);
  }

  if (isSecondarySelectorOpen(rec, field)) {
    activeSecondarySelectorKey.value = null;
  }
}

function getPharmacySearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:pharmacy-search`;
}

function getPharmacySearchKeyword(rec: TreatmentRecommendation): string {
  const cached = pharmacySearchKeywords.value[getPharmacySearchKey(rec)];
  return typeof cached === 'string' ? cached : (rec.pharmacy || '');
}

function setPharmacySearchKeyword(rec: TreatmentRecommendation, value: string): void {
  pharmacySearchKeywords.value = {
    ...pharmacySearchKeywords.value,
    [getPharmacySearchKey(rec)]: value,
  };
}

function syncPharmacySearchKeyword(rec: TreatmentRecommendation): void {
  setPharmacySearchKeyword(rec, rec.pharmacy || '');
}

function handlePharmacySearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setPharmacySearchKeyword(rec, target?.value || '');
}

function getFilteredPharmacyOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (rec.pharmacy || '').trim();
  const query = resolveSelectorFilterKeyword(getPharmacySearchKeyword(rec), currentValue);
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
  activeSecondarySelectorKey.value = null;
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

function getExecDeptSearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:execDept-search`;
}

function getExecDeptSearchKeyword(rec: TreatmentRecommendation): string {
  const cached = execDeptSearchKeywords.value[getExecDeptSearchKey(rec)];
  if (typeof cached === 'string') {
    return cached;
  }

  const currentValue = (rec.execDept || '').trim();
  const matched = execDeptOptions.value.find((option) => option.key === currentValue || option.text === currentValue);
  return matched?.text || currentValue;
}

function setExecDeptSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  execDeptSearchKeywords.value = {
    ...execDeptSearchKeywords.value,
    [getExecDeptSearchKey(rec)]: value,
  };
}

function syncExecDeptSearchKeyword(rec: TreatmentRecommendation): void {
  setExecDeptSearchKeyword(rec, getExecDeptSearchKeyword(rec));
}

function handleExecDeptSearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setExecDeptSearchKeyword(rec, target?.value || '');
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
  const query = resolveSelectorFilterKeyword(getExecDeptSearchKeyword(rec), currentValue);
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
  activeSecondarySelectorKey.value = null;
}

function clearExecDeptSelection(rec: TreatmentRecommendation): void {
  rec.execDept = '';
  setExecDeptSearchKeyword(rec, '');
  if (isExecDeptRequired(rec)) {
    rec.selected = false;
    showToast?.('执行科室已清空，请重新设置后再选中该项目', 'warning');
  }
}


function getBodySiteSearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:bodySite-search`;
}

function getBodySiteSearchKeyword(rec: TreatmentRecommendation): string {
  const cached = bodySiteSearchKeywords.value[getBodySiteSearchKey(rec)];
  return typeof cached === 'string' ? cached : (rec.bodySite || '');
}

function setBodySiteSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  bodySiteSearchKeywords.value = {
    ...bodySiteSearchKeywords.value,
    [getBodySiteSearchKey(rec)]: value,
  };
}

function syncBodySiteSearchKeyword(rec: TreatmentRecommendation): void {
  setBodySiteSearchKeyword(rec, rec.bodySite || '');
}

function handleBodySiteSearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setBodySiteSearchKeyword(rec, target?.value || '');
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
  const query = resolveSelectorFilterKeyword(getBodySiteSearchKeyword(rec), currentValue);
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
  activeSecondarySelectorKey.value = null;
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
}

function getInsuranceSearchKey(rec: TreatmentRecommendation): string {
  return `${getTreatmentEditorKey(rec)}:insurance-search`;
}

function getInsuranceSearchKeyword(rec: TreatmentRecommendation): string {
  const cached = insuranceSearchKeywords.value[getInsuranceSearchKey(rec)];
  return typeof cached === 'string' ? cached : (rec.insuranceType || '');
}

function setInsuranceSearchKeyword(rec: TreatmentRecommendation, value: string): void {
  insuranceSearchKeywords.value = {
    ...insuranceSearchKeywords.value,
    [getInsuranceSearchKey(rec)]: value,
  };
}

function syncInsuranceSearchKeyword(rec: TreatmentRecommendation): void {
  setInsuranceSearchKeyword(rec, rec.insuranceType || '');
}

function handleInsuranceSearchInput(rec: TreatmentRecommendation, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  setInsuranceSearchKeyword(rec, target?.value || '');
}

function getInsuranceUsageOptions(): UsageOption[] {
  return dedupeUsageOptions(
    insuranceOptions.map((option) => createUsageOption({ key: option, text: option })),
  );
}

function getFilteredInsuranceOptionsForRecord(rec: TreatmentRecommendation): UsageOption[] {
  const currentValue = (rec.insuranceType || '').trim();
  const query = resolveSelectorFilterKeyword(getInsuranceSearchKeyword(rec), currentValue);
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
  activeSecondarySelectorKey.value = null;
}

function clearInsuranceSelection(rec: TreatmentRecommendation): void {
  rec.insuranceType = '';
  setInsuranceSearchKeyword(rec, '');
}

async function handleBatchWriteBack(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;

  try {
    const selected = treatments.value.filter((item) => item.selected);
    const medicinesReady = await Promise.all(selected
      .filter((item) => item.type === 'medicine')
      .map((item) => ensureMedicineSelectable(item, true)));
    if (medicinesReady.some((ready) => !ready)) {
      showToast?.('存在当前药房无有效详情的药品，请取消选择后再提交', 'warning');
      return;
    }

    const medicineInventoriesReady = await Promise.all(selected
      .filter((item) => item.type === 'medicine')
      .map((item) => checkMedicineInventoryEnough(item, true)));
    if (medicineInventoriesReady.some((ready) => !ready)) {
      showToast?.('存在库存不足的药品，请调整用药数量或药房后再提交', 'warning');
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

    const result = {
      consultationId: resolveConsultationId(),
      timestamp: Date.now(),
      resultType: 'record-confirmed',
      requestId: `record-confirmed-${Date.now()}`,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
      pastMedicalHistory: pastMedicalHistory.value,
      diagList,
      orderList,
      treatmentPlan,
    };

    await invoke('complete_consultation', { result });
    submitVoiceFinalUserLog();
    clearVoiceConsultationCache(props.initialPatientData);
    showToast?.('病历已提交', 'success');
    showSessionFeedbackDialog.value = true;
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
    aiDiagnoses.value = [];
    selectedDiagnosisKeys.value = new Set();
    selectedDiagnosis.value = null;
    treatments.value = [];

    initialRecordSnapshot.value = {
      chiefComplaint: result.chiefComplaint || '',
      historyOfPresentIllness: result.historyOfPresentIllness || '',
      pastMedicalHistory: result.pastMedicalHistory || '',
    };
    chiefComplaint.value = result.chiefComplaint;
    historyOfPresentIllness.value = result.historyOfPresentIllness;
    pastMedicalHistory.value = result.pastMedicalHistory;

    if (result.diagnoses?.length) {
      aiDiagnoses.value = initDiagnosesFromIntent(result.diagnoses);
      const firstMatched = aiDiagnoses.value.find((diag) => diag.id || diag.code);
      replaceDiagnosisSelection(firstMatched ? [firstMatched] : aiDiagnoses.value.slice(0, 1), firstMatched || aiDiagnoses.value[0] || null);
      void registerCurrentRecommendations();
    }

    if (result.treatments.length > 0) {
      await fetchPharmacyOptions();
      treatments.value = initTreatmentsFromIntent(result.treatments);
      lastTreatmentDiagnosisKey.value = getDiagnosisIdentity(selectedDiagnosis.value);
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
</script>

<template>
  <div class="voice-consultation-new">
    <header class="voice-topbar pane-card">
      <div class="patient-summary">
        <div class="patient-avatar">
          <Icon icon="lucide:user" size="18" color="#fff" />
        </div>
        <div class="patient-summary-text">
          <div class="patient-summary-line">
            <span class="patient-name">{{ patientName || '未知患者' }}</span>
            <span v-if="patientGender" class="patient-chip">{{ patientGender }}</span>
            <span v-if="patientAge" class="patient-chip">{{ patientAge }}</span>
            <span v-if="patientIdCard" class="patient-chip patient-chip-wide">{{ patientIdCard }}</span>
          </div>
          <div class="patient-summary-subline">语音问诊结果已结构化，可直接核对后回写</div>
        </div>
      </div>
      <div class="voice-topbar-actions">
        <button class="back-btn topbar-btn" type="button" @click="handleCancelClick">放弃</button>
        <button class="writeback-btn topbar-btn" type="button" :disabled="!canSubmit" @click="handleBatchWriteBack">
          <template v-if="submitting">提交中...</template>
          <template v-else>一键回写</template>
        </button>
      </div>
    </header>

    <div v-if="!intentResult" class="loading-state pane-card">
      <div class="ai-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-core"></div>
      </div>
      <p class="loading-title">AI 正在识别语音意图...</p>
    </div>

    <div v-else class="medical-record-page">
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
          </div>
        </section>

        <section class="vcn-right-panel">
          <div class="decision-card pane-card">
            <div class="section-heading">
              <div>
                <h3 class="section-title">诊断建议</h3>
                <div v-if="selectedDiagnoses.length > 0" class="section-subtitle">
                  已纳入 {{ selectedDiagnoses.length }} 项诊断
                  <span v-if="selectedDiagnosis">，主诊断：{{ selectedDiagnosis.name }}</span>
                </div>
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
              <li
                v-for="diag in aiDiagnoses"
                :key="diag.code + diag.name"
                class="vcn-diagnosis-item"
                :class="{ selected: isDiagnosisSelected(diag), primary: isPrimaryDiagnosis(diag) }"
                @click="toggleDiagnosis(diag)"
              >
                <div v-if="isDiagnosisSelected(diag)" class="diag-selected-mark">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>

                <div class="card-row">
                  <div class="card-main">
                    <div class="card-title-line">
                      <div class="card-title-wrap">
                        <FactCheckHighlight :issue="getIssueForDiagnosis(diag.code)">
                          <span class="card-title">{{ diag.name }}</span>
                        </FactCheckHighlight>
                        <span
                          v-if="diag.rationale"
                          class="reason-tooltip-trigger"
                          :class="{ open: activeReasonTooltipKey === getReasonTooltipKey('diagnosis', diag.code, diag.name) }"
                          @click.stop
                        >
                          <button class="reason-icon-btn" type="button" aria-label="查看诊断依据" title="查看诊断依据" @click.stop="toggleReasonTooltip(getReasonTooltipKey('diagnosis', diag.code, diag.name), $event)">
                            <Icon icon="lucide:circle-help" size="14" />
                          </button>
                          <span class="hover-reason-tooltip">{{ diag.rationale }}</span>
                        </span>
                      </div>
                      <span v-if="diag.code" class="meta-token">编码 {{ diag.code }}</span>
                      <span v-if="isPrimaryDiagnosis(diag)" class="meta-token diag-role-token">主诊断</span>
                      <span v-else-if="isDiagnosisSelected(diag)" class="meta-token diag-role-token">已纳入</span>
                      <button
                        v-if="isDiagnosisSelected(diag) && !isPrimaryDiagnosis(diag)"
                        class="diag-action-btn"
                        type="button"
                        @click.stop="setPrimaryDiagnosis(diag, $event)"
                      >设为主诊</button>
                      <button
                        v-if="isDiagnosisSelected(diag) && selectedDiagnoses.length > 1"
                        class="diag-action-btn subtle"
                        type="button"
                        @click.stop="removeDiagnosis(diag, $event)"
                      >移除</button>
                      <button class="inline-arrow-btn" type="button" title="切换同类诊断" @click.stop="toggleRelatedDropdown(diag, $event)">
                        <span class="inline-arrow" :class="{ open: openRelatedId === (diag.id || diag.code) }"></span>
                      </button>
                    </div>
                  </div>

                  <div class="card-actions">
                    <div class="voice-feedback-anchor" @click.stop>
                      <button
                        class="voice-feedback-trigger"
                        :class="{ submitted: !!getRecommendationSubmittedLabel(getDiagnosisFeedbackKey(diag)) }"
                        type="button"
                        @click.stop="toggleRecommendationFeedback(getDiagnosisFeedbackKey(diag), $event)"
                      >反馈</button>
                      <div v-if="isRecommendationFeedbackOpen(getDiagnosisFeedbackKey(diag))" class="voice-feedback-panel">
                        <VoiceRecommendationFeedbackPopover
                          :visible="true"
                          :title="diag.name"
                          :draft="getRecommendationDraft(getDiagnosisFeedbackKey(diag))"
                          :submitting="recommendationSubmittingKey === getDiagnosisFeedbackKey(diag)"
                          :submitted-label="getRecommendationSubmittedLabel(getDiagnosisFeedbackKey(diag))"
                          @close="toggleRecommendationFeedback(getDiagnosisFeedbackKey(diag))"
                          @update:draft="updateRecommendationDraft(getDiagnosisFeedbackKey(diag), $event)"
                          @submit="handleDiagnosisFeedbackSubmit(diag, $event)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="openRelatedId === (diag.id || diag.code) && inlineRelatedDiagnoses.length > 0" class="related-section" @click.stop>
                  <div class="related-list">
                    <button v-for="item in inlineRelatedDiagnoses" :key="item.id" class="related-item" type="button" @click="swapDiagnosis(diag, item)">
                      <span class="related-code">{{ item.code }}</span>
                      <span class="related-name">{{ item.name }}</span>
                    </button>
                  </div>
                </div>
              </li>
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
                  <article
                    v-for="rec in section.items"
                    :key="`${rec.type}-${rec.name}`"
                    class="vcn-treatment-item"
                    :class="{ selected: rec.selected, locked: requiresManualMatchBeforeSelect(rec), matching: isManualMatchOpen(rec) }"
                    @click="toggleTreatment(rec)"
                  >
                    <div v-if="rec.selected" class="card-selected-mark">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>

                    <div class="card-row treatment-card-row">
                      <div class="card-main">
                        <div class="card-title-line">
                          <div class="card-title-wrap">
                            <FactCheckHighlight :issue="getIssueForTreatment(rec.name)">
                              <span class="card-title">{{ rec.name }}</span>
                            </FactCheckHighlight>
                            <span v-if="getTreatmentSpec(rec)" class="meta-token">{{ getTreatmentSpec(rec) }}</span>
                            <span
                              v-if="rec.reason"
                              class="reason-tooltip-trigger"
                              :class="{ open: activeReasonTooltipKey === getReasonTooltipKey('treatment', rec.type, rec.name) }"
                              @click.stop
                            >
                              <button class="reason-icon-btn" type="button" aria-label="查看推荐依据" title="查看推荐依据" @click.stop="toggleReasonTooltip(getReasonTooltipKey('treatment', rec.type, rec.name), $event)">
                                <Icon icon="lucide:circle-help" size="14" />
                              </button>
                              <span class="hover-reason-tooltip">{{ rec.reason }}</span>
                            </span>
                          </div>
                          <span class="meta-token" :class="{ warning: rec.matchStatus === 'probable' || rec.matchStatus === 'unmatched', success: rec.matchStatus === 'manual' || rec.matchStatus === 'confirmed' }">
                            {{ rec.matchedItem || rec.matchStatus === 'probable' ? getTreatmentMatchLabel(rec) : '未匹配标准库' }}
                          </span>
                          <button
                            v-if="isExecDeptRequired(rec)"
                            class="exec-dept-chip"
                            :class="{ missing: !hasRequiredExecDept(rec) }"
                            type="button"
                            :title="hasRequiredExecDept(rec) ? '点击调整执行科室' : '执行科室为空，点击设置后才能选中'"
                            @click.stop="openExecDeptQuickSelector(rec, $event)"
                          >
                            <span v-if="!hasRequiredExecDept(rec)" class="exec-dept-chip-label">执行科室</span>
                            <span class="exec-dept-chip-value">{{ getExecDeptDisplay(rec) || '待设置' }}</span>
                          </button>
                          <button
                            v-if="isPharmacyRequired(rec)"
                            class="exec-dept-chip pharmacy-chip"
                            :class="{ missing: !hasRequiredPharmacy(rec) }"
                            type="button"
                            :title="hasRequiredPharmacy(rec) ? '点击调整发药药房' : '发药药房未设置或不在当前药品可用药房列表，点击选择'"
                            @click.stop="openPharmacyQuickSelector(rec, $event)"
                          >
                            <span v-if="!hasRequiredPharmacy(rec)" class="exec-dept-chip-label">发药药房</span>
                            <span class="exec-dept-chip-value">{{ getPharmacyDisplay(rec) || '待设置' }}</span>
                          </button>
                          <span v-if="rec.type !== 'medicine' && rec.usage" class="meta-token">建议 {{ rec.usage }}</span>
                        </div>

                        <div v-if="hasProbableMatch(rec)" class="manual-match-origin-note probable-match-note">
                          <span class="probable-match-copy">
                            <span class="probable-match-label">候选标准项</span>
                            <span class="probable-match-name">{{ getSuggestedMatchName(rec) }}</span>
                          </span>
                          <button
                            class="confirm-match-btn inline"
                            type="button"
                            title="确认采用该标准库候选"
                            @click.stop="confirmSuggestedMatch(rec, $event)"
                          >
                            确认匹配
                          </button>
                        </div>

                        <div v-if="getTreatmentOriginalName(rec)" class="manual-match-origin-note">
                          AI 原建议：{{ getTreatmentOriginalName(rec) }}
                        </div>

                        <div
                          v-if="rec.type === 'medicine' && getMedicineInlineSummary(rec) && !rec.selected && !isTreatmentEditorExpanded(rec)"
                          class="medicine-inline-summary"
                        >
                          {{ getMedicineInlineSummary(rec) }}
                        </div>
                      </div>

                      <div class="card-actions treatment-card-actions">
                        <div class="voice-feedback-anchor" @click.stop>
                          <button
                            class="voice-feedback-trigger"
                            :class="{ submitted: !!getRecommendationSubmittedLabel(getTreatmentFeedbackKey(rec)) }"
                            type="button"
                            @click.stop="toggleRecommendationFeedback(getTreatmentFeedbackKey(rec), $event)"
                          >反馈</button>
                          <div v-if="isRecommendationFeedbackOpen(getTreatmentFeedbackKey(rec))" class="voice-feedback-panel">
                            <VoiceRecommendationFeedbackPopover
                              :visible="true"
                              :title="rec.name"
                              :draft="getRecommendationDraft(getTreatmentFeedbackKey(rec))"
                              :submitting="recommendationSubmittingKey === getTreatmentFeedbackKey(rec)"
                              :submitted-label="getRecommendationSubmittedLabel(getTreatmentFeedbackKey(rec))"
                              @close="toggleRecommendationFeedback(getTreatmentFeedbackKey(rec))"
                              @update:draft="updateRecommendationDraft(getTreatmentFeedbackKey(rec), $event)"
                              @submit="handleTreatmentFeedbackSubmit(rec, $event)"
                            />
                          </div>
                        </div>
                        <button
                          v-if="!rec.matchedItem"
                          class="manual-match-btn"
                          type="button"
                          :title="isManualMatchOpen(rec) ? '收起手动匹配' : '手动匹配标准库项目'"
                          @click.stop="toggleManualMatch(rec, $event)"
                        >
                          {{ isManualMatchOpen(rec) ? '收起匹配' : '手动匹配' }}
                        </button>
                        <button
                          v-if="rec.selected"
                          class="inline-arrow-btn action-arrow"
                          type="button"
                          :title="isTreatmentEditorExpanded(rec) ? '收起更多编辑' : '展开更多编辑'"
                          :aria-label="isTreatmentEditorExpanded(rec) ? '收起更多编辑' : '展开更多编辑'"
                          @click.stop="toggleTreatmentEditor(rec, $event)"
                        >
                          <span class="inline-arrow" :class="{ open: isTreatmentEditorExpanded(rec) }"></span>
                        </button>
                      </div>
                    </div>

                    <div v-if="!rec.matchedItem && isManualMatchOpen(rec)" class="manual-match-shell" @click.stop>
                      <div class="manual-match-header">
                        <div class="manual-match-title">从标准库选择{{ section.title.replace('项目', '') }}</div>
                        <div class="manual-match-desc">匹配成功后才可纳入本次回写</div>
                      </div>

                      <input
                        :value="getManualMatchKeyword(rec)"
                        type="text"
                        class="edit-input"
                        placeholder="输入名称筛选标准库"
                        @input="handleManualMatchInput(rec, $event)"
                      />

                      <div class="manual-match-list">
                        <button
                          v-for="candidate in getManualMatchCandidates(rec)"
                          :key="candidate.id"
                          class="manual-match-option"
                          type="button"
                          @click.stop="applyManualMatch(rec, candidate, $event)"
                        >
                          <span class="manual-match-option-name">{{ candidate.name }}</span>
                          <span v-if="isMedicineSearchCandidate(candidate) && candidate.spec" class="manual-match-option-meta">{{ candidate.spec }}</span>
                          <span v-else-if="!isMedicineSearchCandidate(candidate) && candidate.code" class="manual-match-option-meta">{{ candidate.code }}</span>
                        </button>

                        <div v-if="getManualMatchCandidates(rec).length === 0" class="manual-match-empty">
                          未找到可用的标准库项目，请修改关键字后重试
                        </div>
                      </div>
                    </div>

                    <div v-if="shouldShowTreatmentEditor(rec)" class="editor-shell" @click.stop>
                      <template v-if="rec.type === 'medicine'">
                        <div class="medicine-primary-fields">
                          <div class="primary-field" :class="{ editing: isEditableFieldActive(rec, 'dosage') }">
                            <label>一次剂量</label>
                            <div v-if="isEditableFieldActive(rec, 'dosage')" class="field-editor edit-field-row" @focusout="handleEditableFieldBlur(rec, 'dosage', $event)">
                              <input :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'dosage'), el)" v-model="rec.dosage" type="text" placeholder="剂量" class="edit-input small" />
                              <span class="edit-unit static-unit" :class="{ placeholder: !rec.dosageUnit }">{{ rec.dosageUnit || '单位待识别' }}</span>
                            </div>
                            <button v-else class="field-read-btn" :class="{ placeholder: isMedicineFieldEmpty(rec, 'dosage') }" type="button" @click.stop="activateEditableField(rec, 'dosage', $event)">
                              {{ getMedicineFieldDisplay(rec, 'dosage') }}
                            </button>
                          </div>

                          <div class="primary-field" :class="{ editing: isEditableFieldActive(rec, 'frequency') }">
                            <label>频次</label>
                            <div v-if="isEditableFieldActive(rec, 'frequency')" class="field-editor route-field-editor" @focusout="handleEditableFieldBlur(rec, 'frequency', $event)">
                              <input
                                :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'frequency'), el)"
                                :value="getFrequencySearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称筛选频次"
                                class="edit-input"
                                @input="handleFrequencySearchInput(rec, $event)"
                              />
                              <div class="route-option-list" role="listbox" aria-label="药品频次候选项">
                                <button
                                  v-if="normalizeTreatmentRecommendation(rec).frequency"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearFrequencySelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredFrequencyOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectFrequencyOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ formatOptionLabel(option) }}</span>
                                </button>
                                <div v-if="getFilteredFrequencyOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配频次</div>
                              </div>
                            </div>
                            <button v-else class="field-read-btn" :class="{ placeholder: isMedicineFieldEmpty(rec, 'frequency') }" type="button" @click.stop="activateEditableField(rec, 'frequency', $event)">
                              {{ getMedicineFieldDisplay(rec, 'frequency') }}
                            </button>
                          </div>

                          <div class="primary-field" :class="{ editing: isEditableFieldActive(rec, 'route') }">
                            <label>用法</label>
                            <div v-if="isEditableFieldActive(rec, 'route')" class="field-editor route-field-editor" @focusout="handleEditableFieldBlur(rec, 'route', $event)">
                              <input
                                :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'route'), el)"
                                :value="getRouteSearchKeyword(rec)"
                                type="text"
                                placeholder="输入名称/拼音筛选用法"
                                class="edit-input"
                                @input="handleRouteSearchInput(rec, $event)"
                              />
                              <div class="route-option-list" role="listbox" aria-label="药品用法候选项">
                                <button
                                  v-if="normalizeTreatmentRecommendation(rec).route"
                                  class="route-option-item route-option-clear"
                                  type="button"
                                  @mousedown.prevent.stop="clearRouteSelection(rec)"
                                >
                                  <span class="route-option-text">清空当前值</span>
                                </button>
                                <button
                                  v-for="option in getFilteredRouteOptionsForRecord(rec).slice(0, 8)"
                                  :key="option.key"
                                  class="route-option-item"
                                  type="button"
                                  @mousedown.prevent.stop="selectRouteOption(rec, option)"
                                >
                                  <span class="route-option-text">{{ option.text }}</span>
                                  <span v-if="option.py || option.mcode" class="route-option-meta">{{ [option.py, option.mcode].filter(Boolean).join(' / ') }}</span>
                                </button>
                                <div v-if="getFilteredRouteOptionsForRecord(rec).length === 0" class="route-option-empty">未找到匹配用法</div>
                              </div>
                            </div>
                            <button v-else class="field-read-btn" :class="{ placeholder: isMedicineFieldEmpty(rec, 'route') }" type="button" @click.stop="activateEditableField(rec, 'route', $event)">
                              {{ getMedicineFieldDisplay(rec, 'route') }}
                            </button>
                          </div>

                          <div class="primary-field" :class="{ editing: isEditableFieldActive(rec, 'total') }">
                            <label>总量</label>
                            <div v-if="isEditableFieldActive(rec, 'total')" class="field-editor edit-field-row" @focusout="handleEditableFieldBlur(rec, 'total', $event)">
                              <input
                                :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'total'), el)"
                                :value="rec.totalQty"
                                type="text"
                                placeholder="数量"
                                class="edit-input small"
                                @input="handleTotalQtyInput(rec, $event)"
                              />
                              <span class="edit-unit static-unit" :class="{ placeholder: !rec.totalUnit }">{{ rec.totalUnit || '单位待识别' }}</span>
                            </div>
                            <button v-else class="field-read-btn" :class="{ placeholder: isMedicineFieldEmpty(rec, 'total') }" type="button" @click.stop="activateEditableField(rec, 'total', $event)">
                              {{ getMedicineFieldDisplay(rec, 'total') }}
                            </button>
                          </div>
                        </div>

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
                  </article>
                </div>
              </section>
            </template>

            <div v-else class="empty-text">{{ treatmentEmptyText }}</div>
          </div>
        </section>
      </div>

    </div>

    <div v-if="showCancelConfirm" class="confirm-overlay" @click.self="closeCancelConfirm">
      <div class="confirm-dialog pane-card" role="dialog" aria-modal="true" aria-labelledby="voice-cancel-title">
        <div class="confirm-dialog-body">
          <p id="voice-cancel-title" class="confirm-dialog-title">确认放弃当前语音结果？</p>
          <p class="confirm-dialog-text">放弃后将清空当前未提交的语音结果，并退回小球状态。</p>
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
  --voice-text: var(--color-text-strong, #1f2937);
  --voice-text-muted: var(--color-text-muted, #66758a);
  --voice-text-disabled: var(--color-text-disabled, #98a6b9);
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
  height: 100%;
  min-height: 0;
  padding: 20px 20px 28px;
  background:
    radial-gradient(960px 300px at 82% -6%, var(--color-primary-100, rgba(59, 130, 246, 0.1)) 0%, transparent 60%),
    radial-gradient(720px 220px at 18% 0%, var(--color-cta-50, rgba(43, 127, 227, 0.06)) 0%, transparent 58%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, var(--color-background-gray, #f8fafc) 18%, var(--color-background, #f5f7fb) 100%);
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.pane-card {
  background: var(--voice-surface-glass);
  border: 1px solid var(--voice-border);
  border-radius: 18px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.72) inset,
    0 10px 24px rgba(15, 23, 42, 0.035),
    0 2px 6px rgba(15, 23, 42, 0.02);
}

.voice-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  position: sticky;
  top: 0;
  z-index: 6;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.voice-topbar-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-left: auto;
  flex-shrink: 0;
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

.topbar-btn {
  min-width: 96px;
}

.patient-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.patient-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--voice-accent), var(--color-primary-light, #3fa2ff));
  flex-shrink: 0;
}

.patient-summary-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.patient-summary-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.patient-name {
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
}

.patient-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--voice-surface-muted);
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
}

.patient-chip-wide {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patient-summary-subline {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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
  color: var(--voice-text-muted);
}

.section-title {
  margin: 0;
  font-size: var(--voice-font-strong);
  font-weight: 700;
  color: var(--voice-text);
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
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
  font-weight: 500;
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

.manual-match-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--voice-border);
}

.manual-match-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manual-match-title {
  font-size: var(--voice-font-main);
  font-weight: 700;
  color: var(--voice-text);
}

.manual-match-desc {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.manual-match-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.manual-match-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--voice-border);
  border-radius: 12px;
  background: var(--voice-surface-soft);
  color: var(--voice-text);
  cursor: pointer;
  text-align: left;
}

.manual-match-option:hover {
  border-color: var(--voice-accent);
  background: var(--voice-accent-softer);
}

.manual-match-option-name {
  flex: 1;
  min-width: 0;
  font-size: var(--voice-font-main);
  font-weight: 600;
  color: var(--voice-text);
}

.manual-match-option-meta,
.manual-match-empty {
  font-size: var(--voice-font-min);
  color: var(--voice-text-muted);
}

.manual-match-option-meta {
  flex-shrink: 0;
  white-space: nowrap;
}

.manual-match-empty {
  padding: 8px 2px 0;
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
  .voice-consultation-new {
    padding: 16px 16px 24px;
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

  .voice-topbar-actions {
    width: 100%;
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
