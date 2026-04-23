<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { getHisService, type PharmacyOption } from '../services/hisService';
import { medicalDataService, type DiagnosisItem } from '../services/medicalData';
import { clearVoiceConsultationCache } from '../composables/useVoiceConsultation';
import {
  checkDiagnosis,
  checkMedicine,
  checkExamination,
  isReviewerEnabled,
  type FactCheckIssue,
  type FactCheckResult,
} from '../services/factChecker';
import type { TreatmentRecommendation, Diagnosis } from '../types/consultation';
import type { AppPatient } from '../types/appState';
import type { VoiceIntentResult, MatchedTreatment, MatchedDiagnosis } from '../composables/useVoiceIntentRecognition';

interface UsageOption {
  key: string;
  text: string;
  py: string;
  wb: string;
  mcode: string;
  normalizedTokens: string[];
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

const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const selectedDiagnosisKeys = ref<Set<string>>(new Set());
const diagnosisLoading = ref(false);

const treatments = ref<TreatmentRecommendation[]>([]);
const treatmentLoading = ref(false);

const submitting = ref(false);
const showCancelConfirm = ref(false);

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const patientName = computed((): string => s(props.initialPatientData?.naPi));
const patientGender = computed((): string => s(props.initialPatientData?.sdSexText) || s(props.initialPatientData?.sdSex));
const patientAge = computed((): string => s(props.initialPatientData?.ageText) || (props.initialPatientData?.ageNum != null ? `${props.initialPatientData.ageNum}${s(props.initialPatientData.ageUnit) || '岁'}` : ''));
const patientIdCard = computed((): string => s(props.initialPatientData?.idCard));
const patientTetId = computed((): string => s(props.initialPatientData?.idTet));

function getDiagnosisKey(diag: Diagnosis | null | undefined): string {
  if (!diag) return '';
  return `${diag.id || ''}|${diag.code || ''}|${diag.name || ''}`;
}

const selectedDiagnoses = computed(() => aiDiagnoses.value.filter((diag) => selectedDiagnosisKeys.value.has(getDiagnosisKey(diag))));

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
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
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
    activeEditableFieldKey.value = null;
  }
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
    days: rec.days || inferDaysFromText(usageText),
  };
}

function normalizeTreatmentRecommendation(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  const base: TreatmentRecommendation = {
    type: rec.type || 'medicine',
    name: rec.name || '',
    reason: rec.reason || '',
    spec: rec.spec || '',
    usage: rec.usage || '',
    matchedItem: rec.matchedItem,
    selected: !!rec.selected,
    dosage: rec.dosage || '',
    dosageUnit: rec.dosageUnit || '',
    totalQty: rec.totalQty || '',
    totalUnit: rec.totalUnit || '',
    frequency: rec.frequency || '',
    frequencyKey: rec.frequencyKey || '',
    route: rec.route || '',
    routeKey: rec.routeKey || '',
    days: rec.days || '',
    pharmacy: rec.pharmacy || '',
    remark: rec.remark || '',
    regulatedDisease: rec.regulatedDisease || '',
    bodySite: rec.bodySite || '',
    execDept: rec.execDept || '',
    insuranceType: rec.insuranceType || '医保使用',
  };

  if (base.type !== 'medicine') {
    return base;
  }

  const defaults = inferMedicineDefaults(base);
  return {
    ...base,
    dosage: base.dosage || defaults.dosage,
    dosageUnit: base.dosageUnit || defaults.dosageUnit,
    frequency: base.frequency || defaults.frequency,
    frequencyKey: base.frequencyKey || findFrequencyOptionByValue(base.frequency || defaults.frequency)?.key || '',
    route: base.route || defaults.route,
    routeKey: base.routeKey || findRouteOptionByValue(base.route || defaults.route)?.key || '',
    totalQty: base.totalQty || defaults.totalQty,
    totalUnit: base.totalUnit || defaults.totalUnit,
    days: base.days || defaults.days,
  };
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
    const name = item.matchedItem?.name || item.name;
    const dosagePair = splitDosageAndUnit(item.dosage);
    const normalized = normalizeTreatmentRecommendation({
      type: mapTreatmentType(item.type),
      name,
      reason: buildTreatmentReason(item, name),
      spec: item.spec || item.matchedItem?.spec || '',
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
      matchedItem: item.matchedItem || undefined,
      selected: shouldAutoSelectTreatment(item),
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

function toggleTreatment(item: TreatmentRecommendation): void {
  activeReasonTooltipKey.value = null;
  item.selected = !item.selected;

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

    type CatalogMatch = TreatmentRecommendation['matchedItem'] | null;

    const parseAndMatch = (
      response: PromiseSettledResult<string>,
      matchFn: (name: string, aliases?: string[]) => CatalogMatch,
    ): TreatmentRecommendation[] => {
      if (response.status !== 'fulfilled') return [];

      try {
        const clean = response.value.replace(/```json\n?|\n?```/g, '').trim();
        const jsonMatch = clean.match(/\[[\s\S]*\]/);
        const parsed: TreatmentRecommendation[] = JSON.parse(jsonMatch ? jsonMatch[0] : clean);

        return parsed.map((rec) => {
          const matched = matchFn(rec.name, Array.isArray(rec.aliases) ? rec.aliases : undefined);
          return normalizeTreatmentRecommendation({
            ...rec,
            matchedItem: matched ? ({ ...matched } as TreatmentRecommendation['matchedItem']) : rec.matchedItem,
            selected: !!matched || !!rec.matchedItem,
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
    nextTreatments.push(...parseAndMatch(medResponse, (name, aliases) => medicalDataService.matchMedicine(name, aliases)));
    nextTreatments.push(...parseAndMatch(examResponse, (name, aliases) => medicalDataService.matchExamItem(name, aliases)));
    nextTreatments.push(...parseAndMatch(labResponse, (name, aliases) => medicalDataService.matchLabTestItem(name, aliases)));
    nextTreatments.push(...parseAndMatch(procResponse, (name, aliases) => medicalDataService.matchProcedureItem(name, aliases)));

    console.info('[VoiceConsultationNew] Treatment recommendations loaded', {
      diagnosisIdentity,
      totalCount: nextTreatments.length,
      medicineCount: nextTreatments.filter((item) => item.type === 'medicine').length,
      medicineWithDosageCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.dosage).length,
      medicineWithTotalQtyCount: nextTreatments.filter((item) => item.type === 'medicine' && !!item.totalQty).length,
    });

    if (diagnosisIdentity !== getDiagnosisIdentity(selectedDiagnosis.value)) {
      return;
    }

    treatments.value = nextTreatments;
    lastTreatmentDiagnosisKey.value = diagnosisIdentity;
    void performTreatmentFactCheck(nextTreatments);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    showToast?.(`方案推荐失败: ${msg}`, 'error');
  } finally {
    treatmentLoading.value = false;
  }
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

    if (currentIdentity !== lastTreatmentDiagnosisKey.value) {
      treatments.value = [];
      void fetchAITreatment();
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
  createUsageOption({ key: '每天一次', text: '每天一次' }),
  createUsageOption({ key: '每天两次', text: '每天两次' }),
  createUsageOption({ key: '每天三次', text: '每天三次' }),
  createUsageOption({ key: '隔日一次', text: '隔日一次' }),
  createUsageOption({ key: '每周一次', text: '每周一次' }),
  createUsageOption({ key: '每周两次', text: '每周两次' }),
  createUsageOption({ key: '必要时', text: '必要时' }),
  createUsageOption({ key: '立即', text: '立即' }),
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
}): UsageOption {
  const text = (item.text || '').trim();
  const py = (item.py || '').trim();
  const wb = (item.wb || '').trim();
  const mcode = (item.mcode || '').trim();
  const key = (item.key || text).trim();

  return {
    key,
    text,
    py,
    wb,
    mcode,
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
  const his = getHisService();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, using default frequency options');
    return;
  }

  try {
    const response = await his.post<{ items: Array<{ key?: string; text?: string; py?: string; wb?: string; mcode?: string }> }>('api/base.tenantDicService/frequency', {});
    if (response?.body?.items?.length) {
      frequencyOptions.value = dedupeUsageOptions(response.body.items.map((item) => createUsageOption(item)));
    }
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load frequency options from HIS', error);
  }
}

async function fetchRouteOptions(): Promise<void> {
  const his = getHisService();
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

async function fetchPharmacyOptions(): Promise<void> {
  const his = getHisService();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, pharmacy options skipped');
    pharmacyOptions.value = [];
    return;
  }

  try {
    pharmacyOptions.value = await his.fetchAvailablePharmacies();
  } catch (error) {
    console.error('[VoiceConsultationNew] Failed to load pharmacy options from HIS', error);
    pharmacyOptions.value = [];
  }
}

onMounted(() => {
  void Promise.all([fetchFrequencyOptions(), fetchRouteOptions(), fetchPharmacyOptions()]);
});
const pharmacyOptions = ref<PharmacyOption[]>([]);
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
    return pharmacyOptions.value[0];
  }

  return pharmacyOptions.value.find((option) => option.name === pharmacyName) || pharmacyOptions.value[0];
}

function getOrderExecDeptId(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  const pharmacyOption = rec.type === 'medicine' ? getSelectedPharmacyOption(rec) : undefined;
  return (
    pharmacyOption?.idSto ||
    rec.matchedItem?.idDeptExec ||
    readFirstString(raw, ['idDeptExec', 'idDept']) ||
    getHisService()?.getDefaultExecDeptId() ||
    ''
  ).trim();
}

function getOrderPartId(rec: TreatmentRecommendation): string {
  const raw = getMatchedItemRaw(rec);
  return (rec.matchedItem?.idPart || readFirstString(raw, ['idPart'])).trim();
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

function buildOrderListItem(rec: TreatmentRecommendation): Record<string, string | number> {
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
    ...(jsonField ? { jsonField } : {}),
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
  if (!rec.matchedItem) return '';
  return rec.matchedItem.name === rec.name ? '标准库已匹配' : rec.matchedItem.name;
}

function formatOptionLabel(option: UsageOption): string {
  const text = option.text.trim();
  const key = option.key.trim();
  if (!key || key === text) {
    return text;
  }
  return `${text}(${key})`;
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
  const query = normalizeUsageKeyword(getFrequencySearchKeyword(rec));
  const matchedOptions = !query
    ? frequencyOptions.value
    : frequencyOptions.value.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  const currentValue = (normalizeTreatmentRecommendation(rec).frequency || '').trim();
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
  const query = normalizeUsageKeyword(getRouteSearchKeyword(rec));
  const matchedOptions = !query
    ? routeOptions.value
    : routeOptions.value.filter((option) => option.normalizedTokens.some((token) => token.includes(query)));

  const currentValue = (normalizeTreatmentRecommendation(rec).route || '').trim();
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

async function handleBatchWriteBack(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;

  try {
    const selected = treatments.value.filter((item) => item.selected);
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
    clearVoiceConsultationCache(props.initialPatientData);
    showToast?.('病历已提交', 'success');
    emit('close');
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
    aiDiagnoses.value = [];
    selectedDiagnosisKeys.value = new Set();
    selectedDiagnosis.value = null;
    treatments.value = [];

    chiefComplaint.value = result.chiefComplaint;
    historyOfPresentIllness.value = result.historyOfPresentIllness;
    pastMedicalHistory.value = result.pastMedicalHistory;

    if (result.diagnoses?.length) {
      aiDiagnoses.value = initDiagnosesFromIntent(result.diagnoses);
      const firstMatched = aiDiagnoses.value.find((diag) => diag.id || diag.code);
      replaceDiagnosisSelection(firstMatched ? [firstMatched] : aiDiagnoses.value.slice(0, 1), firstMatched || aiDiagnoses.value[0] || null);
    }

    if (result.treatments.length > 0) {
      treatments.value = initTreatmentsFromIntent(result.treatments);
      lastTreatmentDiagnosisKey.value = getDiagnosisIdentity(selectedDiagnosis.value);
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
              <h3 class="section-title">病历详情</h3>
            </div>
          </div>

          <div class="record-fields">
            <div class="record-field">
              <label>主诉</label>
              <textarea v-model="chiefComplaint" rows="3" placeholder="请输入主诉..."></textarea>
            </div>
            <div class="record-field field-grow">
              <label>现病史</label>
              <textarea v-model="historyOfPresentIllness" rows="13" placeholder="请输入现病史..."></textarea>
            </div>
            <div class="record-field">
              <label>既往史</label>
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
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
              <div>
                <h3 class="section-title">治疗方案</h3>
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
                    :class="{ selected: rec.selected }"
                    @click="toggleTreatment(rec)"
                  >
                    <div v-if="rec.selected" class="card-selected-mark">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>

                    <div class="card-row">
                      <div class="card-main">
                        <div class="card-title-line">
                          <div class="card-title-wrap">
                            <FactCheckHighlight :issue="getIssueForTreatment(rec.name)">
                              <span class="card-title">{{ rec.name }}</span>
                            </FactCheckHighlight>
                            <span v-if="getTreatmentSpec(rec)" class="meta-token">规格 {{ getTreatmentSpec(rec) }}</span>
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
                          <span class="meta-token" :class="{ warning: !rec.matchedItem }">{{ rec.matchedItem ? getTreatmentMatchLabel(rec) : '待人工确认' }}</span>
                          <span v-if="rec.type !== 'medicine' && rec.usage" class="meta-token">建议 {{ rec.usage }}</span>
                        </div>

                        <div
                          v-if="rec.type === 'medicine' && getMedicineInlineSummary(rec) && !isTreatmentEditorExpanded(rec)"
                          class="medicine-inline-summary"
                        >
                          {{ getMedicineInlineSummary(rec) }}
                        </div>
                      </div>

                      <div class="card-actions">
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

                    <div v-if="rec.selected && (rec.type === 'medicine' || isTreatmentEditorExpanded(rec))" class="editor-shell" @click.stop>
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
                              <input :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'total'), el)" v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input small" />
                              <span class="edit-unit static-unit" :class="{ placeholder: !rec.totalUnit }">{{ rec.totalUnit || '单位待识别' }}</span>
                            </div>
                            <button v-else class="field-read-btn" :class="{ placeholder: isMedicineFieldEmpty(rec, 'total') }" type="button" @click.stop="activateEditableField(rec, 'total', $event)">
                              {{ getMedicineFieldDisplay(rec, 'total') }}
                            </button>
                          </div>
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
                            <select v-model="rec.pharmacy" class="edit-select">
                              <option value="">请选择</option>
                              <option v-for="option in pharmacyOptions" :key="`${option.name}-${option.idDept}`" :value="option.name">{{ option.name }}</option>
                            </select>
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="option in insuranceOptions" :key="option" :value="option">{{ option }}</option>
                            </select>
                          </div>
                        </div>
                      </template>

                      <template v-if="rec.type === 'exam' && isTreatmentEditorExpanded(rec)">
                        <div class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>部位方式</label>
                            <input v-model="rec.bodySite" type="text" placeholder="请输入部位" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>总量</label>
                            <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input mini" />
                          </div>
                          <div class="secondary-field">
                            <label>执行科室</label>
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="option in insuranceOptions" :key="option" :value="option">{{ option }}</option>
                            </select>
                          </div>
                        </div>
                      </template>

                      <template v-if="rec.type === 'lab_test' && isTreatmentEditorExpanded(rec)">
                        <div class="secondary-field-grid">
                          <div class="secondary-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>部位方式</label>
                            <input v-model="rec.bodySite" type="text" placeholder="部位" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>总量</label>
                            <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input mini" />
                          </div>
                          <div class="secondary-field">
                            <label>执行科室</label>
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="option in insuranceOptions" :key="option" :value="option">{{ option }}</option>
                            </select>
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
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="secondary-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="option in insuranceOptions" :key="option" :value="option">{{ option }}</option>
                            </select>
                          </div>
                        </div>
                      </template>
                    </div>
                  </article>
                </div>
              </section>
            </template>

            <div v-else class="empty-text">
              <template v-if="selectedDiagnosis">暂无治疗建议</template>
              <template v-else>请先选择诊断</template>
            </div>
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
  --voice-border: #dbe4ef;
  --voice-border-strong: #cbd7e6;
  --voice-text: #1f2937;
  --voice-text-muted: #66758a;
  --voice-accent: #2b7fe3;
  --voice-warning: #c97a11;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding: 20px 20px 28px;
  background: linear-gradient(180deg, #f8fafc 0%, #f5f7fb 100%);
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.pane-card {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--voice-border);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
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
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  width: min(420px, 100%);
  padding: 22px;
  border-radius: 20px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
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
  background: #fff;
  color: var(--voice-text);
}

.confirm-btn.danger {
  background: #cf4a3c;
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
  background: linear-gradient(135deg, #2b7fe3, #3fa2ff);
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
  background: #eef3f8;
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

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-heading-split {
  margin-bottom: 12px;
}

.treatment-heading {
  margin-bottom: 12px;
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

.record-field textarea,
.edit-input,
.edit-select {
  width: 100%;
  border: 1px solid var(--voice-border);
  border-radius: 12px;
  background: #fff;
  color: var(--voice-text);
  font-size: var(--voice-font-main);
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.record-field textarea {
  padding: 12px 14px;
  line-height: 1.7;
  resize: vertical;
}

.record-field textarea:focus,
.edit-input:focus,
.edit-select:focus {
  border-color: rgba(43, 127, 227, 0.5);
  box-shadow: 0 0 0 3px rgba(43, 127, 227, 0.1);
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
  background: #f7f9fc;
  border: 1px solid #e7edf5;
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
  background: #fff;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.vcn-diagnosis-item:hover,
.vcn-treatment-item:hover {
  border-color: var(--voice-border-strong);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
}

.vcn-diagnosis-item.selected,
.vcn-treatment-item.selected {
  background: #fff;
  border-color: var(--voice-border);
  box-shadow: none;
}

.vcn-diagnosis-item.primary {
  border-color: rgba(43, 127, 227, 0.38);
  box-shadow: 0 10px 24px rgba(43, 127, 227, 0.08);
}

.diag-selected-mark,
.card-selected-mark {
  position: absolute;
  top: 14px;
  left: 14px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--voice-accent);
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
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
  align-items: center;
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
  color: #8a98aa;
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
  border: 1px solid #d7e3f0;
  background: rgba(255, 255, 255, 0.98);
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

.diag-role-token {
  color: var(--voice-accent);
}

.diag-action-btn {
  flex-shrink: 0;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid #cfe0f2;
  border-radius: 999px;
  background: #f8fbff;
  color: var(--voice-accent);
  font-size: var(--voice-font-min);
  cursor: pointer;
}

.diag-action-btn.subtle {
  border-color: #e2e8f0;
  background: #fff;
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
  background: #f1f5f9;
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
  background: #f7f9fc;
  border: 1px solid #ebf0f6;
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
  background: #fff;
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
  border-top: 1px solid #ebf0f6;
}

.medicine-primary-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.primary-field,
.secondary-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #e7edf5;
  background: #fafbfd;
}

.primary-field {
  min-height: 44px;
}

.primary-field.editing {
  border-color: rgba(43, 127, 227, 0.36);
  background: #fff;
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
  color: #98a6b9;
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
  border: 1px solid #d7e3f0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
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
  background: #f3f7fc;
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
  background: rgba(255, 255, 255, 0.96);
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
  border: 2px solid rgba(43, 127, 227, 0.18);
  border-top-color: var(--voice-accent);
  border-radius: 50%;
}

.spinner-core {
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: rgba(43, 127, 227, 0.14);
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

  .medicine-primary-fields,
  .secondary-field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
