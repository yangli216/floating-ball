<script setup lang="ts">
import { ref, computed, watch, inject, onMounted } from 'vue';
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

// ── Map MatchedDiagnosis -> Diagnosis ─────────────────────────────────
function initDiagnosesFromIntent(matched: MatchedDiagnosis[]): Diagnosis[] {
  return matched.map((m) => ({
    id: m.matchedItem?.id,
    name: m.matchedItem?.name || m.name,
    code: m.matchedItem?.code || m.code || '',
    rate: m.matchedItem ? '医生口述' : '未匹配',
    rationale: `医生口述诊断: "${m.name}"`,
  }));
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
    return {
      type: mapTreatmentType(m.type),
      name,
      reason: `医生口述: "${m.text}"`,
      usage,
      matchedItem: m.matchedItem || undefined,
      selected: !!m.matchedItem,
    };
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

    // Trigger fact check + checklist
    performDiagnosisFactCheck(aiDiagnoses.value);
    if (selectedDiagnosis.value) {
      fetchDiagnosisChecklist(selectedDiagnosis.value);
    }
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
          return {
            ...rec,
            matchedItem: matched ? { id: matched.id, name: matched.name, spec: matched.spec } : undefined,
            selected: !!matched,
          };
        });
      } catch { return []; }
    };

    allRecs.push(...parseAndMatch(medResponse, (n) => medicalDataService.matchMedicine(n)));
    allRecs.push(...parseAndMatch(examResponse, (n) => medicalDataService.matchExamItem(n)));
    allRecs.push(...parseAndMatch(labResponse, (n) => medicalDataService.matchLabTestItem(n)));
    allRecs.push(...parseAndMatch(procResponse, (n) => medicalDataService.matchProcedureItem(n)));

    treatments.value = allRecs;

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
  if (rate.includes('高') || rate === '医生口述') return 'rate-high';
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
      resultType: 'batch',
      requestId: `voice-batch-${Date.now()}`,
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
    }

    // Trigger fact checks (async, non-blocking)
    if (aiDiagnoses.value.length > 0) {
      performDiagnosisFactCheck(aiDiagnoses.value);
      // Trigger checklist for selected diagnosis
      if (selectedDiagnosis.value) {
        fetchDiagnosisChecklist(selectedDiagnosis.value);
      }
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
          <!-- Diagnosis Section -->
          <div class="ai-card">
            <div class="ai-card-title-row">
              <h4>初步诊断 (Diagnosis)</h4>
              <button class="ai-recommend-btn" type="button" @click="fetchAIDiagnosis" :disabled="diagnosisLoading">
                <template v-if="diagnosisLoading">推荐中...</template>
                <template v-else>AI推荐诊断</template>
              </button>
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
                <div class="diag-header">
                  <div class="diag-name-group">
                    <FactCheckHighlight :issue="getIssueForDiagnosis(diag.code)">
                      <span class="diag-name">{{ diag.name }} ({{ diag.code }})</span>
                    </FactCheckHighlight>
                    <div class="inline-related-trigger" @click="toggleRelatedDropdown(diag, $event)" title="切换同类诊断">
                      <span class="arrow" :class="{ open: openRelatedId === (diag.id || diag.code) }">&#9660;</span>
                    </div>
                  </div>
                  <span class="diag-rate" :class="getDiagRateClass(diag.rate)">{{ diag.rate }}</span>
                </div>
                <div class="diag-rationale">{{ diag.rationale }}</div>

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
            <div v-else class="empty-text">点击"AI推荐诊断"获取诊断建议</div>
          </div>

          <!-- Treatment Section -->
          <div class="ai-card">
            <div class="ai-card-title-row">
              <h4>治疗方案 (Treatment)</h4>
              <button
                v-if="selectedDiagnosis"
                class="ai-recommend-btn"
                type="button"
                @click="fetchAITreatment"
                :disabled="treatmentLoading"
              >
                <template v-if="treatmentLoading">推荐中...</template>
                <template v-else>AI推荐方案</template>
              </button>
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
                    <span class="treatment-section-pill">{{ section.items.length }} 项推荐</span>
                    <span class="treatment-section-pill strong">{{ section.items.filter(i => i.selected).length }} 项已选</span>
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
                        <div class="rec-name-group">
                          <span class="rec-tag" :class="rec.type">{{ getTreatmentTagLabel(rec.type) }}</span>
                          <FactCheckHighlight :issue="getIssueForTreatment(rec.name)">
                            <span class="rec-name">{{ rec.name }}</span>
                          </FactCheckHighlight>
                          <span v-if="rec.matchedItem" class="matched-inline">
                            <span class="match-icon">&#10003;</span>
                            <span class="match-name">{{ rec.matchedItem.name }}</span>
                            <span v-if="rec.type === 'medicine' && rec.matchedItem.spec" class="match-spec">{{ rec.matchedItem.spec }}</span>
                          </span>
                          <span v-else class="unmatched-icon" title="未匹配标准库">&#128269;</span>
                        </div>
                      </div>
                      <div class="rec-reason">{{ rec.reason }}</div>
                      <div v-if="rec.usage" class="rec-usage">建议: {{ rec.usage }}</div>

                      <!-- Inline editable fields (shown when selected) -->
                      <div v-if="rec.selected" class="rec-edit-fields" @click.stop>
                        <!-- Common: 规定病 (all types) -->
                        <div class="edit-field">
                          <label>规定病</label>
                          <input v-model="rec.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                        </div>

                        <!-- Medicine fields -->
                        <template v-if="rec.type === 'medicine'">
                          <div class="edit-field">
                            <label>每次剂量</label>
                            <div class="edit-field-row">
                              <input v-model="rec.dosage" type="text" placeholder="剂量" class="edit-input small" />
                              <select v-model="rec.dosageUnit" class="edit-select mini">
                                <option value="">单位</option>
                                <option v-for="u in dosageUnits" :key="u" :value="u">{{ u }}</option>
                              </select>
                            </div>
                          </div>
                          <div class="edit-field">
                            <label>频次</label>
                            <select v-model="rec.frequency" class="edit-select">
                              <option value="">请选择</option>
                              <option v-for="f in frequencyOptions" :key="f" :value="f">{{ f }}</option>
                            </select>
                          </div>
                          <div class="edit-field">
                            <label>用法</label>
                            <select v-model="rec.route" class="edit-select">
                              <option value="">请选择</option>
                              <option v-for="r in routeOptions" :key="r" :value="r">{{ r }}</option>
                            </select>
                          </div>
                          <div class="edit-field">
                            <label>天数</label>
                            <input v-model="rec.days" type="text" placeholder="天" class="edit-input mini" />
                          </div>
                          <div class="edit-field">
                            <label>总量</label>
                            <div class="edit-field-row">
                              <input v-model="rec.totalQty" type="text" placeholder="数量" class="edit-input small" />
                              <select v-model="rec.totalUnit" class="edit-select mini">
                                <option value="">单位</option>
                                <option v-for="u in medicineTotalUnits" :key="u" :value="u">{{ u }}</option>
                              </select>
                            </div>
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
                        </template>

                        <!-- Exam fields -->
                        <template v-if="rec.type === 'exam'">
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

                        <!-- Lab test fields -->
                        <template v-if="rec.type === 'lab_test'">
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

                        <!-- Procedure fields -->
                        <template v-if="rec.type === 'procedure'">
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
              <template v-if="selectedDiagnosis">点击"AI推荐方案"获取治疗建议</template>
              <template v-else>请先选择诊断后再获取治疗方案</template>
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
  flex: 0.8;
}

.right-panel {
  flex: 1.2;
  background: #FAFBFD;
  border-right: none;
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
  padding: 12px;
  overflow-y: auto;
  position: relative;
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
  padding: 16px 18px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(226, 232, 240, 0.8);
  position: relative;
  overflow: hidden;
  min-height: 120px;
  overflow-y: auto;
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

.ai-recommend-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--color-info, #2B7FE3);
  border-radius: 6px;
  background: var(--color-background-white, #fff);
  color: var(--color-info, #2B7FE3);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.ai-recommend-btn:hover:not(:disabled) {
  background: var(--color-info-bg, rgba(43, 127, 227, 0.06));
}

.ai-recommend-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Diagnosis List ──────────────────────────────────── */
.diagnosis-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagnosis-item {
  position: relative;
  padding: 12px 16px;
  border: 1px solid var(--color-border-light, #EEF2F6);
  border-radius: 8px;
  background: var(--color-background-white, #fff);
  cursor: pointer;
  transition: all 0.2s;
}

.diagnosis-item:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.diagnosis-item.active {
  background: rgba(43, 127, 227, 0.04);
  border-color: #2B7FE3;
  box-shadow: 0 0 0 1px rgba(43, 127, 227, 0.15);
}

.diagnosis-item::before {
  content: '';
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border-medium, #CBD5E1);
  border-radius: 4px;
  position: absolute;
  left: 16px;
  top: 14px;
  flex-shrink: 0;
}

.diagnosis-item.active::before {
  background: var(--color-info, #2B7FE3);
  border-color: var(--color-info, #2B7FE3);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px;
}

.diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  padding-left: 28px;
}

.diag-name-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diag-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-info, #2B7FE3);
  display: flex;
  align-items: center;
  gap: 6px;
}

.diag-rate {
  font-size: 11px;
  color: var(--color-background-white, #fff);
  background: var(--color-success, #10b981);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.diag-rate.rate-high {
  background: var(--color-success, #10b981);
}

.diag-rate.rate-medium {
  background: var(--color-info, #2B7FE3);
}

.diag-rate.rate-low {
  background: var(--color-warning, #f59e0b);
  color: var(--color-background-white, #fff);
}

.diag-rationale {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.5;
  padding-left: 28px;
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
  gap: 0;
  padding: 0;
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--color-border-light, #EEF2F6);
  background: transparent;
}

.treatment-section:last-child {
  border-bottom: none;
}

.treatment-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0 8px;
  border-bottom: 1px solid var(--color-border-light, #EEF2F6);
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

.treatment-section-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  font-size: 11px;
  font-weight: 400;
}

.treatment-section-pill.strong {
  color: var(--color-success, #10b981);
}

.treatment-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.treatment-item {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  border-radius: 0;
  padding: 10px 4px;
  gap: 4px;
  cursor: pointer;
  transition: background 0.2s;
  overflow: visible;
}

.treatment-item:last-child {
  border-bottom: none;
}

.treatment-item:hover {
  background: rgba(43, 127, 227, 0.03);
}

.treatment-item.active {
  background: rgba(43, 127, 227, 0.04);
  border-color: rgba(43, 127, 227, 0.12);
  padding-left: 20px;
}

.selected-mark {
  position: absolute;
  top: 8px;
  left: -2px;
  width: 18px;
  height: 18px;
  background: #2B7FE3;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 1px 3px rgba(43, 127, 227, 0.3);
}

.rec-content {
  flex: 1;
  min-width: 0;
}

.rec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}

.rec-name-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
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
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-strong, #1e293b);
}

.matched-inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(16, 185, 129, 0.08);
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  font-size: 11px;
  margin-left: 4px;
}

.match-icon {
  color: #059669;
  font-weight: 600;
  font-size: 10px;
}

.match-name {
  font-weight: 600;
  color: var(--color-success-text, #059669);
}

.match-spec {
  color: var(--color-success, #10b981);
  font-size: 11px;
}

.unmatched-icon {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.5;
}

.rec-reason,
.rec-usage {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  line-height: 1.5;
}

/* ── Inline Edit Fields ──────────────────────────────── */
.rec-edit-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(43, 127, 227, 0.03);
  border: 1px solid rgba(43, 127, 227, 0.1);
  border-radius: 6px;
}

.edit-field {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.edit-field label {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
  flex-shrink: 0;
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.edit-input,
.edit-select {
  font-size: 12px;
  padding: 3px 6px;
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
  width: 80px;
}

.edit-input.small {
  width: 56px;
}

.edit-input.mini {
  width: 42px;
}

.edit-select {
  min-width: 72px;
  cursor: pointer;
}

.edit-select.mini {
  min-width: 50px;
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
  font-weight: 600;
  color: var(--color-text-weak, #475569);
  margin-bottom: 6px;
}

.checklist-notes-box textarea {
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
</style>
