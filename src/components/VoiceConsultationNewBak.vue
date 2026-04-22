<script setup lang="ts">
import { ref, computed, watch, inject, onMounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { getHisService } from '../services/hisService';
import { medicalDataService, type DiagnosisItem } from '../services/medicalData';
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

// ── Props & Emits ──────────────────────────────────────────────────────
const props = defineProps<{
  initialPatientData?: AppPatient;
  intentResult: VoiceIntentResult | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

// ── Toast ──────────────────────────────────────────────────────────────
const showToast = inject<(msg: string, type?: string) => void>('showToast');

// ── Medical Record (editable) ──────────────────────────────────────────
const chiefComplaint = ref('');
const historyOfPresentIllness = ref('');
const pastMedicalHistory = ref('');

// ── Diagnosis ──────────────────────────────────────────────────────────
const aiDiagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const diagnosisLoading = ref(false);

// ── Treatments ─────────────────────────────────────────────────────────
const treatments = ref<TreatmentRecommendation[]>([]);
const treatmentLoading = ref(false);

// ── Submitting ─────────────────────────────────────────────────────────
const submitting = ref(false);

// ── Patient helpers ────────────────────────────────────────────────────
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const patientName = computed((): string => s(props.initialPatientData?.naPi));
const patientGender = computed((): string => s(props.initialPatientData?.sdSexText) || s(props.initialPatientData?.sdSex));
const patientAge = computed((): string => s(props.initialPatientData?.ageText) || (props.initialPatientData?.ageNum != null ? `${props.initialPatientData.ageNum}${s(props.initialPatientData.ageUnit) || '岁'}` : ''));
const patientIdCard = computed((): string => s(props.initialPatientData?.idCard));

const getPatientAnchorId = (): string => {
  const p = props.initialPatientData;
  return String(p?.idPi || p?.idTet || p?.idMpi || '');
};

const resolveConsultationId = (): string => getPatientAnchorId() || 'unknown';

// ── canSubmit ──────────────────────────────────────────────────────────
const canSubmit = computed(() =>
  chiefComplaint.value.trim().length > 0 &&
  selectedDiagnosis.value !== null &&
  !submitting.value
);
const selectedTreatmentCount = computed(() => treatments.value.filter((item) => item.selected).length);
const overviewChiefComplaint = computed(() => {
  const value = truncateAnalysisText(normalizeAnalysisText(chiefComplaint.value), 28);
  return value || '待补充';
});
const overviewDiagnosis = computed(() => selectedDiagnosis.value?.name || '待选择');
const activeInsightKey = ref<string | null>(null);
const expandedTreatmentEditors = ref<Set<string>>(new Set());
const lastTreatmentDiagnosisKey = ref('');
const activeEditableFieldKey = ref<string | null>(null);
const editableFieldElements = new Map<string, HTMLInputElement | HTMLSelectElement>();

type MedicinePrimaryField = 'dosage' | 'frequency' | 'route' | 'total';

function getDiagnosisInsightKey(diag: Diagnosis): string {
  return `diag:${diag.id || diag.code || diag.name}`;
}

function getTreatmentInsightKey(rec: TreatmentRecommendation): string {
  return `treatment:${rec.type}:${rec.name}`;
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

function isInsightExpanded(key: string): boolean {
  return activeInsightKey.value === key;
}

function toggleInsight(key: string, event?: Event): void {
  event?.stopPropagation();
  activeInsightKey.value = activeInsightKey.value === key ? null : key;
}

function resetTreatmentEditorState(): void {
  expandedTreatmentEditors.value = new Set();
  activeEditableFieldKey.value = null;
}

function isTreatmentEditorExpanded(rec: TreatmentRecommendation): boolean {
  return expandedTreatmentEditors.value.has(getTreatmentEditorKey(rec));
}

function toggleTreatmentEditor(rec: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  const key = getTreatmentEditorKey(rec);
  const next = new Set(expandedTreatmentEditors.value);

  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }

  expandedTreatmentEditors.value = next;
}

function registerEditableFieldElement(key: string, element: unknown): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    editableFieldElements.set(key, element);
  } else {
    editableFieldElements.delete(key);
  }
}

function isEditableFieldActive(rec: TreatmentRecommendation, field: MedicinePrimaryField): boolean {
  return activeEditableFieldKey.value === getEditableFieldKey(rec, field);
}

function activateEditableField(rec: TreatmentRecommendation, field: MedicinePrimaryField, event?: Event): void {
  event?.stopPropagation();

  if (rec.type === 'medicine') {
    Object.assign(rec, normalizeTreatmentRecommendation(rec));
  }

  const key = getEditableFieldKey(rec, field);
  activeEditableFieldKey.value = key;
  void nextTick(() => {
    editableFieldElements.get(key)?.focus();
  });
}

function handleEditableFieldBlur(rec: TreatmentRecommendation, field: MedicinePrimaryField, event: FocusEvent): void {
  const container = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;

  if (container && nextTarget && container.contains(nextTarget)) {
    return;
  }

  if (activeEditableFieldKey.value === getEditableFieldKey(rec, field)) {
    activeEditableFieldKey.value = null;
  }
}

// ── Map MatchedDiagnosis -> Diagnosis ─────────────────────────────────
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

function buildEncounterSummary(): string {
  const complaint = truncateAnalysisText(normalizeAnalysisText(chiefComplaint.value), 24);
  const history = truncateAnalysisText(normalizeAnalysisText(historyOfPresentIllness.value), 32);

  if (complaint && history) {
    return `结合主诉“${complaint}”及现病史“${history}”`;
  }
  if (complaint) {
    return `结合主诉“${complaint}”`;
  }
  if (history) {
    return `结合现病史“${history}”`;
  }
  return '结合当前问诊信息';
}

function buildDiagnosisRationale(matchedDiagnosis: MatchedDiagnosis, displayName: string): string {
  const summary = buildEncounterSummary();
  const matchNote = matchedDiagnosis.matchedItem
    ? ''
    : '当前标准库中暂未匹配到完全一致的诊断条目，需人工确认。';
  return `${summary}，模型初步考虑${displayName}，建议结合查体和必要检查进一步确认。${matchNote}`;
}

function buildTreatmentReason(name: string, basisText?: string): string {
  const summary = buildEncounterSummary();
  const normalizedBasis = normalizeAnalysisText(basisText || '').replace(/[。；;，,]+$/u, '');
  if (normalizedBasis) {
    return `${summary}，模型建议将${name}纳入当前处理方案，主要依据是${normalizedBasis}。`;
  }
  return `${summary}，模型建议将${name}纳入当前处理方案。`;
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

function inferFrequencyFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';

  const exactOption = frequencyOptions.value.find((option) => normalizedText.includes(option));
  if (exactOption) return exactOption;

  const matched = normalizedText.match(/(每日[^，,；;。\s]*次?|每天[^，,；;。\s]*次?|每周[^，,；;。\s]*次?|隔日一次|必要时|立即|间隔\d+小时[^，,；;。\s]*|qd|bid|tid|qid|qn|prn|q\d+h)/i);
  return matched?.[0]?.trim() || '';
}

function inferRouteFromText(text: string): string {
  const normalizedText = text.trim();
  if (!normalizedText) return '';
  return routeOptions.find((option) => normalizedText.includes(option)) || '';
}

function inferMedicineDefaults(rec: Partial<TreatmentRecommendation>): {
  dosage: string;
  dosageUnit: string;
  frequency: string;
  route: string;
} {
  let dosage = (rec.dosage || '').trim();
  let dosageUnit = (rec.dosageUnit || '').trim();
  let frequency = (rec.frequency || '').trim();
  let route = (rec.route || '').trim();
  const usageText = (rec.usage || '').trim();

  if (dosage && !dosageUnit) {
    const splitResult = splitDosageAndUnit(dosage);
    dosage = splitResult.dosage;
    dosageUnit = splitResult.dosageUnit;
  }

  if (!usageText) {
    return { dosage, dosageUnit, frequency, route };
  }

  const segments = usageText
    .split(/[，,；;。]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (!route) {
      route = inferRouteFromText(segment);
    }

    if (!frequency) {
      frequency = inferFrequencyFromText(segment);
    }

    if (!dosage && /\d/.test(segment) && !inferRouteFromText(segment) && !inferFrequencyFromText(segment)) {
      const splitResult = splitDosageAndUnit(segment);
      dosage = splitResult.dosage;
      dosageUnit = splitResult.dosageUnit;
    }
  }

  return { dosage, dosageUnit, frequency, route };
}

function normalizeTreatmentRecommendation(rec: TreatmentRecommendation): TreatmentRecommendation {
  if (rec.type !== 'medicine') {
    return { ...rec };
  }

  const defaults = inferMedicineDefaults(rec);

  return {
    ...rec,
    dosage: (rec.dosage || defaults.dosage || '').trim(),
    dosageUnit: (rec.dosageUnit || defaults.dosageUnit || '').trim(),
    frequency: (rec.frequency || defaults.frequency || '').trim(),
    route: (rec.route || defaults.route || '').trim(),
  };
}

function initDiagnosesFromIntent(matched: MatchedDiagnosis[]): Diagnosis[] {
  return matched.map((m) => {
    const name = m.matchedItem?.name || m.name;
    return {
      id: m.matchedItem?.id,
      name,
      code: m.matchedItem?.code || m.code || '',
      rate: 'AI分析',
      rationale: buildDiagnosisRationale(m, name),
    };
  });
}

// ── Map MatchedTreatment -> TreatmentRecommendation ────────────────────
function mapTreatmentType(t: MatchedTreatment['type']): TreatmentRecommendation['type'] {
  if (t === 'examination') return 'exam';
  if (t === 'labTest') return 'lab_test';
  return t; // 'medicine' | 'procedure' stay the same
}

function initTreatmentsFromIntent(matched: MatchedTreatment[]): TreatmentRecommendation[] {
  return matched.map((m) => {
    const name = m.matchedItem?.name || m.name;
    const usageParts = [m.dosage, m.frequency, m.usage].filter(Boolean);
    const usage = usageParts.length > 0 ? usageParts.join(', ') : undefined;
    return normalizeTreatmentRecommendation({
      type: mapTreatmentType(m.type),
      name,
      reason: buildTreatmentReason(name, m.text),
      usage,
      dosage: m.dosage,
      frequency: m.frequency,
      route: m.usage,
      matchedItem: m.matchedItem || undefined,
      selected: !!m.matchedItem,
    });
  });
}

// ── Treatment display sections ─────────────────────────────────────────
interface TreatmentSection {
  type: string;
  title: string;
  items: TreatmentRecommendation[];
}

const treatmentSections = computed<TreatmentSection[]>(() => {
  const sections: { type: TreatmentRecommendation['type']; title: string }[] = [
    { type: 'medicine', title: '药品' },
    { type: 'exam', title: '检查项目' },
    { type: 'lab_test', title: '检验项目' },
    { type: 'procedure', title: '处置项目' },
  ];
  return sections
    .map((s) => ({
      ...s,
      items: treatments.value.filter((t) => t.type === s.type),
    }))
    .filter((s) => s.items.length > 0);
});

const hasTreatments = computed(() => treatments.value.length > 0);

// ── Toggle treatment selection ─────────────────────────────────────────
function toggleTreatment(item: TreatmentRecommendation) {
  item.selected = !item.selected;

  if (activeEditableFieldKey.value?.startsWith(`${getTreatmentEditorKey(item)}:`) && !item.selected) {
    activeEditableFieldKey.value = null;
  }

  if (!item.selected) {
    const key = getTreatmentEditorKey(item);
    if (expandedTreatmentEditors.value.has(key)) {
      const next = new Set(expandedTreatmentEditors.value);
      next.delete(key);
      expandedTreatmentEditors.value = next;
    }
  }
}

// ── Toggle diagnosis selection ─────────────────────────────────────────
function toggleDiagnosis(diag: Diagnosis) {
  if (selectedDiagnosis.value?.code === diag.code && selectedDiagnosis.value?.name === diag.name) {
    selectedDiagnosis.value = null;
  } else {
    selectedDiagnosis.value = diag;
  }
}

// ── AI Diagnosis ───────────────────────────────────────────────────────
async function fetchAIDiagnosis() {
  if (diagnosisLoading.value) return;
  if (!chiefComplaint.value.trim()) {
    showToast?.('请先填写主诉', 'warning');
    return;
  }
  diagnosisLoading.value = true;
  activeInsightKey.value = null;
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
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;
    const parsed: Diagnosis[] = JSON.parse(targetJson);

    // Match each against local catalog
    aiDiagnoses.value = parsed.map((d) => {
      const matched = medicalDataService.matchDiagnosis(d.name) || medicalDataService.matchDiagnosis(d.code);
      if (matched) {
        return { ...d, code: matched.code, name: matched.name, id: matched.id };
      }
      return d;
    });

    // Auto-select first if none selected
    if (!selectedDiagnosis.value && aiDiagnoses.value.length > 0) {
      selectedDiagnosis.value = aiDiagnoses.value[0];
    }

    // Trigger fact check
    performDiagnosisFactCheck(aiDiagnoses.value);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast?.(`诊断推荐失败: ${msg}`, 'error');
  } finally {
    diagnosisLoading.value = false;
  }
}

// ── AI Treatment (calls 4 prompts in parallel: medicine + exam + labTest + procedure) ──
async function fetchAITreatment() {
  if (treatmentLoading.value || !selectedDiagnosis.value) return;
  treatmentLoading.value = true;
  activeInsightKey.value = null;
  const diagnosisIdentity = getDiagnosisIdentity(selectedDiagnosis.value);

  const baseParams = {
    patientName: patientName.value,
    gender: patientGender.value,
    age: patientAge.value,
    diagnosisName: selectedDiagnosis.value.name,
    diagnosisCode: selectedDiagnosis.value.code,
    chiefComplaint: chiefComplaint.value,
  };

  try {
    // Call all 4 recommendation prompts in parallel
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

    const allRecs: TreatmentRecommendation[] = [];

    // Parse each response and match against local catalog
    const parseAndMatch = (
      response: PromiseSettledResult<string>,
      matchFn: (name: string) => { id: string; name: string; spec?: string } | null,
    ): TreatmentRecommendation[] => {
      if (response.status !== 'fulfilled') return [];
      try {
        const clean = response.value.replace(/```json\n?|\n?```/g, '').trim();
        const match = clean.match(/\[[\s\S]*\]/);
        const parsed: TreatmentRecommendation[] = JSON.parse(match ? match[0] : clean);
        return parsed.map((rec) => {
          const matched = matchFn(rec.name);
          return normalizeTreatmentRecommendation({
            ...rec,
            matchedItem: matched ? { id: matched.id, name: matched.name, spec: matched.spec } : undefined,
            selected: !!matched,
          });
        });
      } catch { return []; }
    };

    allRecs.push(...parseAndMatch(medResponse, (n) => medicalDataService.matchMedicine(n)));
    allRecs.push(...parseAndMatch(examResponse, (n) => medicalDataService.matchExamItem(n)));
    allRecs.push(...parseAndMatch(labResponse, (n) => medicalDataService.matchLabTestItem(n)));
    allRecs.push(...parseAndMatch(procResponse, (n) => medicalDataService.matchProcedureItem(n)));

    if (diagnosisIdentity !== getDiagnosisIdentity(selectedDiagnosis.value)) {
      return;
    }

    treatments.value = allRecs;
    lastTreatmentDiagnosisKey.value = diagnosisIdentity;
    resetTreatmentEditorState();

    // Trigger fact check
    performTreatmentFactCheck(allRecs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast?.(`方案推荐失败: ${msg}`, 'error');
  } finally {
    treatmentLoading.value = false;
  }
}

// ── Related Diagnosis Dropdown ─────────────────────────────────────────
const openRelatedId = ref<string | null>(null);
const inlineRelatedDiagnoses = ref<DiagnosisItem[]>([]);

function toggleRelatedDropdown(diag: Diagnosis, event: Event) {
  event.stopPropagation();
  if (openRelatedId.value === (diag.id || diag.code)) {
    openRelatedId.value = null;
  } else {
    openRelatedId.value = diag.id || diag.code;
    const related = medicalDataService.getRelatedDiagnoses(diag.code);
    inlineRelatedDiagnoses.value = related.filter((d) => d.code !== diag.code);
  }
}

function swapDiagnosis(originalDiag: Diagnosis, newItem: DiagnosisItem) {
  const index = aiDiagnoses.value.findIndex(
    (d) => (d.id || d.code) === (originalDiag.id || originalDiag.code),
  );
  if (index !== -1) {
    const updatedDiag: Diagnosis = {
      ...aiDiagnoses.value[index],
      id: newItem.id,
      code: newItem.code,
      name: newItem.name,
    };
    aiDiagnoses.value[index] = updatedDiag;
    if (
      selectedDiagnosis.value &&
      (selectedDiagnosis.value.id || selectedDiagnosis.value.code) ===
        (originalDiag.id || originalDiag.code)
    ) {
      selectedDiagnosis.value = updatedDiag;
    }
  }
  openRelatedId.value = null;
}

// ── Diagnosis Checklist (Anti-misdiagnosis) ───────────────────────────
const isChecklistLoading = ref(false);
const showChecklistModal = ref(false);
const checklistItems = ref<{ question: string; recordText: string; checked: boolean }[]>([]);
const checklistNotes = ref('');

async function fetchDiagnosisChecklist(diag: Diagnosis) {
  isChecklistLoading.value = true;
  checklistItems.value = [];
  checklistNotes.value = '';

  try {
    const userPrompt = PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
      diagnosisName: diag.name,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
    });

    const response = await chat([
      { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
      { role: 'user', content: userPrompt },
    ]);

    const clean = response.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : clean);

    if (result && result.isNeeded && Array.isArray(result.items) && result.items.length > 0) {
      checklistItems.value = result.items.map((item: { question: string; recordText: string }) => ({
        question: item.question,
        recordText: item.recordText,
        checked: false,
      }));
    }
  } catch (error) {
    console.error('Failed to fetch diagnosis checklist:', error);
  } finally {
    isChecklistLoading.value = false;
  }
}

function handleChecklistConfirm() {
  showChecklistModal.value = false;
}

watch(
  () => getDiagnosisIdentity(selectedDiagnosis.value),
  (currentIdentity, previousIdentity) => {
    activeInsightKey.value = null;
    openRelatedId.value = null;

    if (!currentIdentity || !selectedDiagnosis.value) {
      treatments.value = [];
      checklistItems.value = [];
      checklistNotes.value = '';
      lastTreatmentDiagnosisKey.value = '';
      resetTreatmentEditorState();
      return;
    }

    if (currentIdentity !== previousIdentity) {
      resetTreatmentEditorState();
    }

    void fetchDiagnosisChecklist(selectedDiagnosis.value);

    if (currentIdentity !== lastTreatmentDiagnosisKey.value) {
      treatments.value = [];
      void fetchAITreatment();
    }
  }
);

// ── Fact Check (AI Independent Verification) ──────────────────────────
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

async function performDiagnosisFactCheck(diagnoses: Diagnosis[]) {
  if (!diagnoses || diagnoses.length === 0) return;
  if (!isReviewerEnabled()) return;

  diagnosisFactChecks.value.clear();

  for (const diagnosis of diagnoses) {
    try {
      const result = await checkDiagnosis({
        diagnosis: diagnosis.name,
        chiefComplaint: chiefComplaint.value,
        historyOfPresentIllness: historyOfPresentIllness.value,
      });
      diagnosisFactChecks.value.set(diagnosis.code, result);
    } catch (e) {
      console.error(`Failed to fact check diagnosis: ${diagnosis.name}`, e);
    }
  }
}

async function performTreatmentFactCheck(treatments: TreatmentRecommendation[]) {
  if (!treatments || treatments.length === 0) return;
  if (!isReviewerEnabled()) return;

  treatmentFactChecks.value.clear();

  for (const treatment of treatments) {
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
    } catch (e) {
      console.error(`Failed to fact check treatment: ${treatment.name}`, e);
    }
  }
}

// ── Diagnosis rate class ──────────────────────────────────────────────
function getDiagRateClass(rate?: string): string {
  if (!rate) return '';
  if (rate.includes('高') || rate.includes('分析')) return 'rate-high';
  if (rate.includes('中')) return 'rate-medium';
  if (rate.includes('低') || rate === '未匹配') return 'rate-low';
  return '';
}

// ── Editable field options ─────────────────────────────────────────────
const frequencyOptions = ref<string[]>([
  '每天一次', '每天两次', '每天三次', '隔日一次',
  '每周一次', '每周两次', '必要时', '立即',
]); // 保留默认值，以免 HIS 请求失败时没有选项

async function fetchFrequencyOptions() {
  const his = getHisService();
  if (!his) {
    console.warn('[VoiceConsultationNew] HisService not initialized, using default frequency options');
    return;
  }
  try {
    const res = await his.post<{ items: Array<{ key: string; text: string }> }>('api/base.tenantDicService/frequency', {});
    if (res && res.body && res.body.items && res.body.items.length > 0) {
      frequencyOptions.value = res.body.items.map(item => item.text);
      console.log('[VoiceConsultationNew] Loaded frequency options from HIS:', frequencyOptions.value);
    }
  } catch (e) {
    console.error('[VoiceConsultationNew] Failed to load frequency options from HIS', e);
  }
}

onMounted(() => {
  fetchFrequencyOptions();
});
const routeOptions = [
  '口服', '静脉注射', '肌肉注射', '皮下注射',
  '外用', '雾化吸入', '舌下含服', '直肠给药', '滴眼',
];
const dosageUnits = ['mg', 'g', 'ml', 'ug', '片', '粒', '支', '袋'];
const medicineTotalUnits = ['盒', '瓶', '袋', '支', '片', '粒'];
const pharmacyOptions = ['西药房', '中药房', '急诊药房', '住院药房'];
const insuranceOptions = ['医保使用', '自费'];

// ── Treatment tag label ────────────────────────────────────────────────
function getTreatmentTagLabel(type: string): string {
  const map: Record<string, string> = {
    medicine: '药品',
    exam: '检查',
    lab_test: '检验',
    procedure: '处置',
  };
  return map[type] || type;
}

function getTreatmentSpec(rec: TreatmentRecommendation): string {
  return rec.type === 'medicine' ? rec.matchedItem?.spec || '' : '';
}

function getTreatmentMatchLabel(rec: TreatmentRecommendation): string {
  if (!rec.matchedItem) return '';
  return rec.matchedItem.name === rec.name ? '标准库已匹配' : rec.matchedItem.name;
}

function getMedicineFieldDisplay(rec: TreatmentRecommendation, field: MedicinePrimaryField): string {
  const normalized = normalizeTreatmentRecommendation(rec);

  switch (field) {
    case 'dosage':
      return [normalized.dosage, normalized.dosageUnit].filter(Boolean).join(' ') || '点击填写';
    case 'frequency':
      return normalized.frequency || '点击选择';
    case 'route':
      return normalized.route || '点击选择';
    case 'total':
      return [normalized.totalQty, normalized.totalUnit].filter(Boolean).join(' ') || '点击填写';
  }
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
      return !normalized.totalQty && !normalized.totalUnit;
  }
}

function getFrequencyOptionsForRecord(rec: TreatmentRecommendation): string[] {
  const currentValue = normalizeTreatmentRecommendation(rec).frequency;
  return currentValue && !frequencyOptions.value.includes(currentValue)
    ? [currentValue, ...frequencyOptions.value]
    : frequencyOptions.value;
}

function getRouteOptionsForRecord(rec: TreatmentRecommendation): string[] {
  const currentValue = normalizeTreatmentRecommendation(rec).route;
  return currentValue && !routeOptions.includes(currentValue)
    ? [currentValue, ...routeOptions]
    : routeOptions;
}

// ── Submit ─────────────────────────────────────────────────────────────
async function handleBatchWriteBack() {
  if (!canSubmit.value) return;
  submitting.value = true;

  try {
    const selected = treatments.value.filter((t) => t.selected);
    const meds = selected.filter((t) => t.type === 'medicine');
    const exams = selected.filter((t) => t.type === 'exam');
    const labs = selected.filter((t) => t.type === 'lab_test');
    const procs = selected.filter((t) => t.type === 'procedure');

    const treatmentPlanParts = [
      meds.length ? `用药：${meds.map((m) => m.name).join('；')}` : '',
      exams.length ? `检查：${exams.map((e) => e.name).join('；')}` : '',
      labs.length ? `检验：${labs.map((l) => l.name).join('；')}` : '',
      procs.length ? `处置：${procs.map((p) => p.name).join('；')}` : '',
    ].filter(Boolean).join('。');

    const result = {
      consultationId: resolveConsultationId(),
      timestamp: Date.now(),
      resultType: 'record-confirmed',
      requestId: `record-confirmed-${Date.now()}`,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
      pastMedicalHistory: pastMedicalHistory.value,
      diagnosisList: selectedDiagnosis.value
        ? [{ name: selectedDiagnosis.value.name, code: selectedDiagnosis.value.code }]
        : [],
      medications: meds.map((m) => ({
        name: m.matchedItem?.name || m.name,
        spec: m.matchedItem?.spec || '',
        usage: m.usage || '',
        idMedPro: m.matchedItem?.id || '',
        dosage: m.dosage || '',
        dosageUnit: m.dosageUnit || '',
        totalQty: m.totalQty || '',
        totalUnit: m.totalUnit || '',
        frequency: m.frequency || '',
        route: m.route || '',
        days: m.days || '',
        pharmacy: m.pharmacy || '',
        remark: m.remark || '',
        regulatedDisease: m.regulatedDisease || '',
        insuranceType: m.insuranceType || '医保使用',
      })),
      examinations: exams.map((e) => ({
        name: e.matchedItem?.name || e.name,
        idCli: e.matchedItem?.id || '',
        regulatedDisease: e.regulatedDisease || '',
        bodySite: e.bodySite || '',
        totalQty: e.totalQty || '',
        execDept: e.execDept || '',
        remark: e.remark || '',
        insuranceType: e.insuranceType || '医保使用',
      })),
      labTests: labs.map((l) => ({
        name: l.matchedItem?.name || l.name,
        idCli: l.matchedItem?.id || '',
        regulatedDisease: l.regulatedDisease || '',
        bodySite: l.bodySite || '',
        totalQty: l.totalQty || '',
        execDept: l.execDept || '',
        remark: l.remark || '',
        insuranceType: l.insuranceType || '医保使用',
      })),
      procedures: procs.map((p) => ({
        name: p.matchedItem?.name || p.name,
        idCli: p.matchedItem?.id || '',
        regulatedDisease: p.regulatedDisease || '',
        totalQty: p.totalQty || '',
        execDept: p.execDept || '',
        insuranceType: p.insuranceType || '医保使用',
      })),
      treatmentPlan: treatmentPlanParts,
    };

    await invoke('complete_consultation', { result });
    showToast?.('病历已提交', 'success');
    emit('close');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast?.(`提交失败: ${msg}`, 'error');
  } finally {
    submitting.value = false;
  }
}
// ── Initialize from intentResult ───────────────────────────────────────
watch(
  () => props.intentResult,
  (result) => {
    if (!result) return;
    activeInsightKey.value = null;
    resetTreatmentEditorState();
    lastTreatmentDiagnosisKey.value = '';
    aiDiagnoses.value = [];
    selectedDiagnosis.value = null;
    treatments.value = [];
    chiefComplaint.value = result.chiefComplaint;
    historyOfPresentIllness.value = result.historyOfPresentIllness;
    pastMedicalHistory.value = result.pastMedicalHistory;
    // Initialize diagnoses from voice
    if (result.diagnoses && result.diagnoses.length > 0) {
      aiDiagnoses.value = initDiagnosesFromIntent(result.diagnoses);
      // Auto-select first matched diagnosis
      const firstMatched = aiDiagnoses.value.find((d) => d.id || d.code);
      if (firstMatched) {
        selectedDiagnosis.value = firstMatched;
      }
    }
    // Initialize treatments from voice
    if (result.treatments.length > 0) {
      treatments.value = initTreatmentsFromIntent(result.treatments);
      lastTreatmentDiagnosisKey.value = getDiagnosisIdentity(selectedDiagnosis.value);
    } else {
      treatments.value = [];
    }

    // Trigger fact checks (async, non-blocking)
    if (aiDiagnoses.value.length > 0) {
      performDiagnosisFactCheck(aiDiagnoses.value);
    } else if (chiefComplaint.value.trim()) {
      void fetchAIDiagnosis();
    }

    if (treatments.value.length > 0) {
      performTreatmentFactCheck(treatments.value);
    }
  },
  { immediate: true }
);

</script>

<template>
  <div class="voice-consultation-new">
    <!-- Patient Header -->
    <div class="patient-header">
      <div class="patient-card">
        <div class="avatar">
          <Icon icon="lucide:user" size="20" color="#fff" />
        </div>
        <span class="patient-name">{{ patientName || '未知患者' }}</span>
        <span v-if="patientGender" class="patient-tag">{{ patientGender }}</span>
        <span v-if="patientAge" class="patient-tag">{{ patientAge }}</span>
        <span v-if="patientIdCard" class="patient-tag id-tag">{{ patientIdCard }}</span>
      </div>
      <div class="header-actions">
        <button class="btn-cancel" @click="emit('close')">取消</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="handleBatchWriteBack">
          <template v-if="submitting">提交中...</template>
          <template v-else>确认提交</template>
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="!intentResult" class="loading-state">
      <div class="ai-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-core"></div>
      </div>
      <p class="loading-title">AI 正在识别语音意图...</p>
    </div>

    <!-- Main content -->
    <div v-else class="medical-record-page">
      <div class="record-content">
      <!-- Left: Medical Record -->
      <div class="record-panel left-panel">
        <div class="panel-header">
          <h3>病历详情</h3>
        </div>
        <div class="panel-body">
          <div class="record-field">
            <label>主诉</label>
            <textarea v-model="chiefComplaint" rows="2" placeholder="请输入主诉..."></textarea>
          </div>
          <div class="record-field">
            <label>现病史</label>
            <textarea v-model="historyOfPresentIllness" rows="10" placeholder="请输入现病史..."></textarea>
          </div>
          <div class="record-field">
            <label>既往史</label>
            <textarea v-model="pastMedicalHistory" rows="2" placeholder="请输入既往史..."></textarea>
          </div>
        </div>
      </div>

      <!-- Right: Diagnosis & Treatment -->
      <div class="record-panel right-panel">
        <div class="panel-header">
          <h3>诊断与治疗方案</h3>
        </div>
        <div class="panel-body">
          <div class="recommendation-overview">
            <div class="overview-item">
              <span class="overview-label">主诉</span>
              <strong class="overview-value">{{ overviewChiefComplaint }}</strong>
            </div>
            <div class="overview-item">
              <span class="overview-label">当前诊断</span>
              <strong class="overview-value">{{ overviewDiagnosis }}</strong>
            </div>
            <div class="overview-item compact">
              <span class="overview-label">已选方案</span>
              <strong class="overview-value">{{ selectedTreatmentCount }} 项</strong>
            </div>
          </div>

          <!-- Diagnosis Section -->
          <div class="ai-card">
            <div class="ai-card-title-row">
              <div class="ai-card-heading">
                <h4>初步诊断 (Diagnosis)</h4>
                <span class="ai-card-caption">根据语音病历自动生成</span>
              </div>
            </div>

            <div v-if="diagnosisLoading" class="loading-inline">
              <div class="ai-spinner small">
                <div class="spinner-ring"></div>
                <div class="spinner-core"></div>
              </div>
              <span>AI 正在分析...</span>
            </div>

            <ul v-else-if="aiDiagnoses.length > 0" class="diagnosis-list">
              <li
                v-for="diag in aiDiagnoses"
                :key="diag.code + diag.name"
                class="diagnosis-item"
                :class="{ active: selectedDiagnosis?.code === diag.code && selectedDiagnosis?.name === diag.name }"
                @click="toggleDiagnosis(diag)"
              >
                <div
                  v-if="selectedDiagnosis?.code === diag.code && selectedDiagnosis?.name === diag.name"
                  class="diag-selected-mark"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="diag-header">
                  <div class="diag-title-block">
                    <div class="diag-name-row">
                      <FactCheckHighlight :issue="getIssueForDiagnosis(diag.code)">
                        <span class="diag-name">{{ diag.name }}</span>
                      </FactCheckHighlight>
                      <div class="inline-related-trigger" @click="toggleRelatedDropdown(diag, $event)" title="切换同类诊断">
                        <span class="arrow" :class="{ open: openRelatedId === (diag.id || diag.code) }">&#9660;</span>
                      </div>
                    </div>
                    <div class="diag-secondary-meta">
                      <span v-if="diag.code" class="diag-secondary-text">编码 {{ diag.code }}</span>
                      <span class="diag-secondary-text" :class="getDiagRateClass(diag.rate)">{{ diag.rate }}</span>
                    </div>
                  </div>
                  <div class="diag-header-actions">
                    <button
                      v-if="diag.rationale"
                      class="insight-toggle-btn"
                      type="button"
                      @click.stop="toggleInsight(getDiagnosisInsightKey(diag), $event)"
                    >
                      {{ isInsightExpanded(getDiagnosisInsightKey(diag)) ? '收起依据' : '查看依据' }}
                    </button>
                  </div>
                </div>
                <div v-if="diag.rationale && isInsightExpanded(getDiagnosisInsightKey(diag))" class="diag-rationale">{{ diag.rationale }}</div>

                <!-- Anti-Misdiagnosis Checklist -->
                <div class="diag-checklist-wrapper">
                  <div v-if="selectedDiagnosis?.code === diag.code && selectedDiagnosis?.name === diag.name && !isChecklistLoading && checklistItems.length > 0" class="checklist-indicator" @click.stop="showChecklistModal = true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>鉴别排查 (待确认)</span>
                  </div>
                  <div v-if="selectedDiagnosis?.code === diag.code && selectedDiagnosis?.name === diag.name && isChecklistLoading" class="checklist-indicator loading">
                    <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span>安全分析中...</span>
                  </div>
                </div>

                <!-- Related Diagnoses Dropdown -->
                <div v-if="openRelatedId === (diag.id || diag.code) && inlineRelatedDiagnoses.length > 0" class="related-section" @click.stop>
                  <div class="related-list">
                    <div
                      v-for="item in inlineRelatedDiagnoses"
                      :key="item.id"
                      class="related-item"
                      @click="swapDiagnosis(diag, item)"
                    >
                      <span class="related-code">{{ item.code }}</span>
                      <span class="related-name">{{ item.name }}</span>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="empty-text">暂无诊断建议</div>
          </div>

          <!-- Treatment Section -->
          <div class="ai-card">
            <div class="ai-card-title-row">
              <div class="ai-card-heading">
                <h4>治疗方案 (Treatment)</h4>
                <span class="ai-card-caption">随当前诊断自动刷新</span>
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
              <section
                v-for="section in treatmentSections"
                :key="section.type"
                class="treatment-section"
              >
                <div class="treatment-section-header">
                  <h5>{{ section.title }}</h5>
                  <div class="treatment-section-header-right">
                    <span class="treatment-section-summary">{{ section.items.length }} 项推荐 / {{ section.items.filter(i => i.selected).length }} 项已选</span>
                  </div>
                </div>
                <div class="treatment-list">
                  <div
                    v-for="rec in section.items"
                    :key="`${rec.type}-${rec.name}`"
                    class="treatment-item"
                    :class="{ active: rec.selected }"
                    @click="toggleTreatment(rec)"
                  >
                    <div class="selected-mark" v-if="rec.selected">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div class="rec-content">
                      <div class="rec-header">
                        <div class="rec-title-block">
                          <div class="rec-title-inline">
                            <div class="rec-name-wrap">
                              <FactCheckHighlight :issue="getIssueForTreatment(rec.name)">
                                <span class="rec-name">{{ rec.name }}</span>
                              </FactCheckHighlight>
                            </div>
                            <div class="rec-secondary-meta">
                              <span class="rec-kind">{{ getTreatmentTagLabel(rec.type) }}</span>
                              <span v-if="getTreatmentSpec(rec)" class="rec-secondary-text">规格 {{ getTreatmentSpec(rec) }}</span>
                              <span class="rec-secondary-text" :class="{ warning: !rec.matchedItem }">{{ rec.matchedItem ? getTreatmentMatchLabel(rec) : '待人工确认' }}</span>
                            </div>
                          </div>
                        </div>
                        <div class="rec-header-actions">
                          <button
                            v-if="rec.reason"
                            class="insight-toggle-btn"
                            type="button"
                            @click.stop="toggleInsight(getTreatmentInsightKey(rec), $event)"
                          >
                            {{ isInsightExpanded(getTreatmentInsightKey(rec)) ? '收起依据' : '查看依据' }}
                          </button>
                          <button
                            v-if="rec.selected"
                            class="edit-chevron-btn"
                            type="button"
                            :title="isTreatmentEditorExpanded(rec) ? '收起更多编辑' : '展开更多编辑'"
                            :aria-label="isTreatmentEditorExpanded(rec) ? '收起更多编辑' : '展开更多编辑'"
                            @click.stop="toggleTreatmentEditor(rec, $event)"
                          >
                            <span class="edit-chevron" :class="{ expanded: isTreatmentEditorExpanded(rec) }"></span>
                          </button>
                        </div>
                      </div>
                      <div v-if="rec.type !== 'medicine' && rec.usage" class="rec-meta-row">
                        <span v-if="rec.usage" class="usage-pill">建议：{{ rec.usage }}</span>
                      </div>
                      <div v-if="rec.reason && isInsightExpanded(getTreatmentInsightKey(rec))" class="rec-reason">{{ rec.reason }}</div>

                      <!-- Inline editable fields (shown when selected) -->
                      <div
                        v-if="rec.selected && (rec.type === 'medicine' || isTreatmentEditorExpanded(rec))"
                        class="rec-edit-shell"
                        :class="{ compact: rec.type !== 'medicine' && !isTreatmentEditorExpanded(rec) }"
                        @click.stop
                      >
                        <template v-if="rec.type === 'medicine'">
                          <div class="rec-edit-fields primary medicine-primary-fields">
                            <div class="edit-field field-card" :class="{ editing: isEditableFieldActive(rec, 'dosage') }">
                              <label>一次剂量</label>
                              <div
                                v-if="isEditableFieldActive(rec, 'dosage')"
                                class="edit-field-row field-editor dosage-editor"
                                @focusout="handleEditableFieldBlur(rec, 'dosage', $event)"
                              >
                                <input
                                  :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'dosage'), el)"
                                  v-model="rec.dosage"
                                  type="text"
                                  placeholder="剂量"
                                  class="edit-input small"
                                />
                                <select v-model="rec.dosageUnit" class="edit-select mini">
                                  <option value="">单位</option>
                                  <option v-for="u in dosageUnits" :key="u" :value="u">{{ u }}</option>
                                </select>
                              </div>
                              <button
                                v-else
                                class="field-read-btn"
                                :class="{ placeholder: isMedicineFieldEmpty(rec, 'dosage') }"
                                type="button"
                                @click.stop="activateEditableField(rec, 'dosage', $event)"
                              >
                                {{ getMedicineFieldDisplay(rec, 'dosage') }}
                              </button>
                            </div>
                            <div class="edit-field field-card" :class="{ editing: isEditableFieldActive(rec, 'frequency') }">
                              <label>频次</label>
                              <div
                                v-if="isEditableFieldActive(rec, 'frequency')"
                                class="field-editor"
                                @focusout="handleEditableFieldBlur(rec, 'frequency', $event)"
                              >
                                <select
                                  :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'frequency'), el)"
                                  v-model="rec.frequency"
                                  class="edit-select"
                                >
                                  <option value="">请选择</option>
                                  <option v-for="f in getFrequencyOptionsForRecord(rec)" :key="f" :value="f">{{ f }}</option>
                                </select>
                              </div>
                              <button
                                v-else
                                class="field-read-btn"
                                :class="{ placeholder: isMedicineFieldEmpty(rec, 'frequency') }"
                                type="button"
                                @click.stop="activateEditableField(rec, 'frequency', $event)"
                              >
                                {{ getMedicineFieldDisplay(rec, 'frequency') }}
                              </button>
                            </div>
                            <div class="edit-field field-card" :class="{ editing: isEditableFieldActive(rec, 'route') }">
                              <label>用法</label>
                              <div
                                v-if="isEditableFieldActive(rec, 'route')"
                                class="field-editor"
                                @focusout="handleEditableFieldBlur(rec, 'route', $event)"
                              >
                                <select
                                  :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'route'), el)"
                                  v-model="rec.route"
                                  class="edit-select"
                                >
                                  <option value="">请选择</option>
                                  <option v-for="r in getRouteOptionsForRecord(rec)" :key="r" :value="r">{{ r }}</option>
                                </select>
                              </div>
                              <button
                                v-else
                                class="field-read-btn"
                                :class="{ placeholder: isMedicineFieldEmpty(rec, 'route') }"
                                type="button"
                                @click.stop="activateEditableField(rec, 'route', $event)"
                              >
                                {{ getMedicineFieldDisplay(rec, 'route') }}
                              </button>
                            </div>
                            <div class="edit-field field-card" :class="{ editing: isEditableFieldActive(rec, 'total') }">
                              <label>总量</label>
                              <div
                                v-if="isEditableFieldActive(rec, 'total')"
                                class="edit-field-row field-editor total-editor"
                                @focusout="handleEditableFieldBlur(rec, 'total', $event)"
                              >
                                <input
                                  :ref="(el) => registerEditableFieldElement(getEditableFieldKey(rec, 'total'), el)"
                                  v-model="rec.totalQty"
                                  type="text"
                                  placeholder="数量"
                                  class="edit-input small"
                                />
                                <select v-model="rec.totalUnit" class="edit-select mini">
                                  <option value="">单位</option>
                                  <option v-for="u in medicineTotalUnits" :key="u" :value="u">{{ u }}</option>
                                </select>
                              </div>
                              <button
                                v-else
                                class="field-read-btn"
                                :class="{ placeholder: isMedicineFieldEmpty(rec, 'total') }"
                                type="button"
                                @click.stop="activateEditableField(rec, 'total', $event)"
                              >
                                {{ getMedicineFieldDisplay(rec, 'total') }}
                              </button>
                            </div>
                          </div>

                          <div v-if="isTreatmentEditorExpanded(rec)" class="rec-edit-fields secondary">
                            <div class="edit-field">
                              <label>规定病</label>
                              <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                            </div>
                            <div class="edit-field">
                              <label>天数</label>
                              <input v-model="rec.days" type="text" placeholder="天" class="edit-input mini" />
                            </div>
                            <div class="edit-field">
                              <label>药房</label>
                              <select v-model="rec.pharmacy" class="edit-select">
                                <option value="">请选择</option>
                                <option v-for="p in pharmacyOptions" :key="p" :value="p">{{ p }}</option>
                              </select>
                            </div>
                            <div class="edit-field">
                              <label>备注</label>
                              <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                            </div>
                            <div class="edit-field">
                              <label>医保限用</label>
                              <select v-model="rec.insuranceType" class="edit-select">
                                <option v-for="i in insuranceOptions" :key="i" :value="i">{{ i }}</option>
                              </select>
                            </div>
                          </div>
                        </template>

                        <template v-if="rec.type === 'exam' && isTreatmentEditorExpanded(rec)">
                          <div class="edit-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>部位方式</label>
                            <input v-model="rec.bodySite" type="text" placeholder="请输入部位" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>总量</label>
                            <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input mini" />
                          </div>
                          <div class="edit-field">
                            <label>执行科室</label>
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="i in insuranceOptions" :key="i" :value="i">{{ i }}</option>
                            </select>
                          </div>
                        </template>

                        <template v-if="rec.type === 'lab_test' && isTreatmentEditorExpanded(rec)">
                          <div class="edit-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>部位方式</label>
                            <input v-model="rec.bodySite" type="text" placeholder="部位" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>总量</label>
                            <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input mini" />
                          </div>
                          <div class="edit-field">
                            <label>执行科室</label>
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>备注</label>
                            <input v-model="rec.remark" type="text" placeholder="备注" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="i in insuranceOptions" :key="i" :value="i">{{ i }}</option>
                            </select>
                          </div>
                        </template>

                        <template v-if="rec.type === 'procedure' && isTreatmentEditorExpanded(rec)">
                          <div class="edit-field">
                            <label>规定病</label>
                            <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>总量</label>
                            <div class="edit-field-row">
                              <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input small" />
                              <span class="edit-unit">次</span>
                            </div>
                          </div>
                          <div class="edit-field">
                            <label>执行科室</label>
                            <input v-model="rec.execDept" type="text" placeholder="科室" class="edit-input" />
                          </div>
                          <div class="edit-field">
                            <label>医保限用</label>
                            <select v-model="rec.insuranceType" class="edit-select">
                              <option v-for="i in insuranceOptions" :key="i" :value="i">{{ i }}</option>
                            </select>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>

            <div v-else class="empty-text">
              <template v-if="selectedDiagnosis">暂无治疗建议</template>
              <template v-else>请先选择诊断</template>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- Fixed Action Area -->
      <div class="fixed-action-area">
        <button class="writeback-btn" :disabled="!canSubmit" @click="handleBatchWriteBack">
          <template v-if="submitting">提交中...</template>
          <template v-else>一键回写</template>
        </button>
        <button class="back-btn" @click="emit('close')">返回</button>
      </div>
    </div>

    <!-- Checklist Modal -->
    <div v-if="showChecklistModal" class="modal-overlay" @click.self="showChecklistModal = false">
      <div class="modal checklist-modal">
        <div class="modal-header">
          <h3>鉴别排查</h3>
          <button class="close-btn" @click="showChecklistModal = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="checklist-intro">
            <p>以下问题有助于排查诊断风险，请逐项确认：</p>
          </div>
          <div class="checklist-items">
            <label v-for="(item, index) in checklistItems" :key="index" class="checklist-item-label">
              <input type="checkbox" v-model="item.checked" />
              <span class="checklist-text">{{ item.question }}</span>
            </label>
          </div>
          <div class="checklist-notes-box">
            <label>补充说明：</label>
            <textarea v-model="checklistNotes" placeholder="填写相关补充信息..."></textarea>
          </div>
          <div class="checklist-actions">
            <button class="btn-secondary" @click="showChecklistModal = false">暂不确认 (跳过)</button>
            <button class="btn-primary" @click="handleChecklistConfirm" :disabled="!checklistItems.some(i => i.checked) && !checklistNotes">确认</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voice-consultation-new {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background-gray, #f8f9fc);
  overflow: hidden;
}

/* ── Patient Header ──────────────────────────────────── */
.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 10px 16px;
  box-shadow: 0 1px 6px rgba(102, 126, 234, 0.3);
  z-index: 10;
  flex-shrink: 0;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.15);
}

.patient-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.patient-tag {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 10px;
}

.id-tag {
  font-family: monospace;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn-cancel {
  padding: 6px 16px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-submit {
  padding: 6px 20px;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #764ba2;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-submit:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Loading State ───────────────────────────────────── */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading-title {
  color: #1E293B;
  font-size: 15px;
  font-weight: 600;
}

.ai-spinner {
  position: relative;
  width: 44px;
  height: 44px;
}

.ai-spinner.small {
  width: 24px;
  height: 24px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2.5px solid #EEF2F6;
  border-top-color: #2B7FE3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: radial-gradient(circle, #2B7FE3 0%, #4A9BF5 100%);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(43, 127, 227, 0.35);
  animation: pulse-core 1.5s ease-in-out infinite;
}

.ai-spinner.small .spinner-core {
  width: 10px;
  height: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-core {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
}

.loading-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
}

/* ── Medical Record Page ─────────────────────────────── */
.medical-record-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-background-gray, #f8f9fc);
  overflow: hidden;
  position: relative;
  min-height: 0;
}

/* ── Two-Column Layout ───────────────────────────────── */
.record-content {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  min-height: 0;
}

.record-panel {
  flex: 1;
  background: #fff;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: none;
  border-right: 1px solid #EEF2F6;
}

.record-panel:last-child {
  border-right: none;
}

.left-panel {
  flex: 0.88;
  min-width: 0;
}

.right-panel {
  flex: 1.12;
  background: #FAFBFD;
  border-right: none;
  min-width: 0;
}

.panel-header {
  padding: 10px 16px;
  border-bottom: 1px solid #EEF2F6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
}

.right-panel .panel-header {
  background: #FAFBFD;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: #1E293B;
  font-weight: 600;
}

.panel-body {
  flex: 1;
  padding: 10px 12px;
  overflow-y: auto;
  position: relative;
}

.right-panel .panel-body {
  padding-bottom: 84px;
}

.recommendation-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.overview-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-item.compact {
  align-items: flex-end;
  justify-content: center;
}

.overview-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

.overview-value {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Record Fields ───────────────────────────────────── */
.record-field {
  margin-bottom: 12px;
}

.record-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-weak, #475569);
  margin-bottom: 6px;
}

.record-field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border-medium, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-strong, #1e293b);
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.record-field textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* ── AI Card ─────────────────────────────────────────── */
.ai-card {
  background: var(--color-background-white, #fff);
  border-radius: 10px;
  padding: 14px 14px 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(226, 232, 240, 0.8);
  position: relative;
  overflow: visible;
  min-height: 0;
}

.ai-card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-light, #EEF2F6);
}

.ai-card-title-row h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-strong, #1e293b);
}

.ai-card-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-card-caption {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

/* ── Diagnosis List ──────────────────────────────────── */
.diagnosis-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diagnosis-item {
  position: relative;
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.diagnosis-item:hover {
  border-color: rgba(59, 130, 246, 0.24);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  transform: translateY(-1px);
}

.diagnosis-item.active {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(226, 232, 240, 0.9);
  box-shadow: none;
}

.diagnosis-item::before {
  content: none;
}

.diagnosis-item.active::before {
  content: none;
}

.diag-selected-mark {
  position: absolute;
  top: 14px;
  left: 16px;
  width: 12px;
  height: 12px;
  background: transparent;
  color: #2b7fe3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0.9;
}

.diag-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 0;
  padding-left: 28px;
}

.diag-title-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.diag-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.diag-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-strong, #1e293b);
  display: flex;
  align-items: center;
  gap: 6px;
}

.diag-secondary-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.diag-secondary-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.diag-secondary-text.rate-high {
  color: #0f766e;
}

.diag-secondary-text.rate-medium {
  color: #2563eb;
}

.diag-secondary-text.rate-low {
  color: #b45309;
}

.diag-secondary-text.selected {
  color: inherit;
  font-weight: inherit;
}

.diag-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  padding-top: 2px;
}

.diag-rationale {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.5;
  padding-left: 28px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(148, 163, 184, 0.35);
}

.insight-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.4;
  transition: color 0.2s ease, opacity 0.2s ease;
  opacity: 0.84;
}

.insight-toggle-btn:hover {
  color: #2b7fe3;
  opacity: 1;
}

.empty-text {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 13px;
  padding: 20px 0;
}

/* ── Treatment Sections ──────────────────────────────── */
.treatment-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  border-radius: 0;
  border: none;
  border-bottom: none;
  background: transparent;
  margin-top: 6px;
}

.treatment-section:last-child {
  border-bottom: none;
}

.treatment-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 2px 0;
  border-bottom: none;
}

.treatment-section-header h5 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-strong, #1e293b);
  display: flex;
  align-items: center;
  gap: 6px;
}

.treatment-section-header h5::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #2B7FE3;
}

.treatment-section-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.treatment-section-summary {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.treatment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.treatment-item {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  padding: 12px 12px 10px;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease;
  overflow: visible;
}

.treatment-item:last-child {
  border-bottom: none;
}

.treatment-item:hover {
  border-color: rgba(59, 130, 246, 0.24);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  transform: translateY(-1px);
}

.treatment-item.active {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(226, 232, 240, 0.9);
  box-shadow: none;
}

.selected-mark {
  position: absolute;
  top: 12px;
  left: 10px;
  width: 12px;
  height: 12px;
  background: transparent;
  color: #2B7FE3;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: none;
  opacity: 0.9;
}

.rec-content {
  flex: 1;
  min-width: 0;
  padding-left: 24px;
}

.rec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 0;
}

.rec-title-block {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.rec-title-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.rec-name-wrap {
  min-width: 0;
  flex: 0 1 auto;
}

.rec-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  line-height: 1.6;
}

.rec-tag.medicine {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.rec-tag.exam {
  background: rgba(99, 102, 241, 0.08);
  color: #4F46E5;
}

.rec-tag.lab_test {
  background: rgba(245, 158, 11, 0.1);
  color: #D97706;
}

.rec-tag.procedure {
  background: rgba(236, 72, 153, 0.08);
  color: #DB2777;
}

.rec-name {
  display: block;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-strong, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-secondary-meta {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.rec-kind {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
  white-space: nowrap;
}

.rec-secondary-text {
  font-size: 11px;
  color: #64748b;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-secondary-text.warning {
  color: #b45309;
}

.rec-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.edit-chevron-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #475569;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.edit-chevron-btn:hover {
  background: rgba(43, 127, 227, 0.12);
  color: #2b7fe3;
}

.edit-chevron {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-1px) rotate(45deg);
  transition: transform 0.18s ease;
}

.edit-chevron.expanded {
  transform: translateY(1px) rotate(225deg);
}

.rec-reason,
.rec-usage {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.5;
}

.rec-meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.usage-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  font-size: 11px;
  font-weight: 500;
}

.rec-reason {
  margin-top: 6px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.08);
}

/* ── Inline Edit Fields ──────────────────────────────── */
.rec-edit-shell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(247, 250, 252, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
}

.rec-edit-shell.compact {
  gap: 0;
  margin-top: 8px;
  padding: 8px 10px;
}

.rec-edit-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.rec-edit-fields.primary {
  padding-top: 0;
}

.medicine-primary-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.rec-edit-fields.secondary {
  padding-top: 6px;
  border-top: 1px dashed rgba(148, 163, 184, 0.35);
}

.edit-field {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  flex-wrap: wrap;
}

.field-card {
  align-items: center;
  flex-direction: row;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  padding: 8px 10px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.medicine-primary-fields .field-card {
  flex-wrap: nowrap;
}

.field-card.editing {
  border-color: rgba(43, 127, 227, 0.42);
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.08);
  background: #fff;
}

.edit-field label {
  font-size: 10px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
  flex-shrink: 0;
}
.medicine-primary-fields .field-card label {
  width: 48px;
}

.field-read-btn {
  width: auto;
  min-height: 20px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-strong, #1e293b);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  cursor: text;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-read-btn.placeholder {
  color: #94a3b8;
  font-weight: 500;
}

.field-editor {
  min-width: 0;
  width: auto;
  flex: 1;
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex-wrap: nowrap;
}

.dosage-editor,
.total-editor {
  gap: 6px;
}

.field-editor .edit-select,
.field-editor .edit-input {
  width: 100%;
}
.medicine-primary-fields .field-editor .edit-select,
.medicine-primary-fields .field-editor .edit-input {
  min-width: 0;
}

.field-editor .edit-select.mini,
.field-editor .edit-input.small,
.field-editor .edit-input.mini {
  width: auto;
}

.edit-input,
.edit-select {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: var(--color-text-strong, #1e293b);
  outline: none;
  transition: border-color 0.15s;
}

.edit-input:focus,
.edit-select:focus {
  border-color: #2B7FE3;
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.1);
}

.edit-input {
  width: 72px;
}

.edit-input.small {
  width: 52px;
}

.edit-input.mini {
  width: 38px;
}

.edit-select {
  min-width: 64px;
  cursor: pointer;
}

.edit-select.mini {
  min-width: 46px;
}

.edit-unit {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  margin-left: 2px;
}

/* ── Fixed Action Area ───────────────────────────────── */
.fixed-action-area {
  position: absolute;
  bottom: 12px;
  right: 24px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 12px;
}

.writeback-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 20px;
  background: var(--color-info, #2B7FE3);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.writeback-btn:hover {
  background: var(--color-primary-dark, #1d6fc9);
}

.writeback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 20px;
  background: var(--color-background-white, #fff);
  color: var(--color-text-medium, #64748b);
  border: 1px solid var(--color-border-medium, #CBD5E1);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  border-color: var(--color-info, #2B7FE3);
  color: var(--color-info, #2B7FE3);
}

/* ── Related Diagnosis Dropdown ────────────────────── */
.inline-related-trigger {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--color-text-muted, #94a3b8);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inline-related-trigger:hover {
  background: rgba(43, 127, 227, 0.08);
  color: #2B7FE3;
}

.arrow {
  font-size: 10px;
  transition: transform 0.2s;
}

.arrow.open {
  transform: rotate(180deg);
}

.related-section {
  margin-top: 8px;
  padding-left: 28px;
}

.related-list {
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid #e2e8f0;
}

.related-item {
  padding: 8px 10px;
  display: flex;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
  align-items: center;
}

.related-item:hover {
  background: #f0f9ff;
}

.related-code {
  font-family: monospace;
  color: var(--color-text-muted, #94a3b8);
  font-weight: 500;
  min-width: 60px;
}

.related-name {
  color: #334155;
  font-weight: 500;
}

/* ── Checklist Indicator ───────────────────────────── */
.diag-checklist-wrapper {
  padding-left: 28px;
  margin-top: 6px;
}

.checklist-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.08);
  color: #d97706;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.checklist-indicator:hover {
  background: rgba(245, 158, 11, 0.15);
}

.checklist-indicator.loading {
  color: var(--color-text-muted, #94a3b8);
  background: rgba(148, 163, 184, 0.08);
  cursor: default;
}

.checklist-indicator .spinner {
  animation: spin 1s linear infinite;
}

/* ── Modal ─────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-background-white, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  max-width: 520px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light, #EEF2F6);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-strong, #1e293b);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-background-gray, #f1f5f9);
  color: var(--color-text-strong, #1e293b);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.checklist-intro {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--color-text-muted, #64748b);
}

.checklist-intro p {
  margin: 0;
}

.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.checklist-item-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light, #EEF2F6);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.checklist-item-label:hover {
  background: rgba(43, 127, 227, 0.03);
}

.checklist-item-label input[type="checkbox"] {
  margin-top: 2px;
  flex-shrink: 0;
}

.checklist-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-strong, #1e293b);
}

.checklist-notes-box {
  margin-bottom: 16px;
}

.checklist-notes-box label {
  display: block;
  font-size: 12px;
  flex-wrap: nowrap;
  color: var(--color-text-weak, #475569);
  margin-bottom: 6px;
  overflow: hidden;
}

.checklist-notes-box textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border-medium, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-strong, #1e293b);
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  min-height: 60px;
}

.checklist-notes-box textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.checklist-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--color-border-medium, #CBD5E1);
  background: var(--color-background-white, #fff);
  border-radius: 6px;
  color: var(--color-text-medium, #64748b);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--color-background-gray, #f1f5f9);
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  background: var(--color-info, #2B7FE3);
  border-radius: 6px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-dark, #1d6fc9);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 1200px) {
  .record-content {
    flex-direction: column;
  }

  .recommendation-overview {
    grid-template-columns: 1fr;
  }

  .overview-item.compact {
    align-items: flex-start;
  }

  .fixed-action-area {
    right: 16px;
  }

  .medicine-primary-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

}

@media (max-width: 760px) {
  .medicine-primary-fields {
    grid-template-columns: 1fr;
  }
}
</style>
