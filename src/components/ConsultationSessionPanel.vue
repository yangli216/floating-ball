<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { once, emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import Icon from './Icon.vue';
import type { AppPatient } from '../types/appState';
import {
  buildRecordDraft,
  buildSessionContext,
  buildSessionReminders,
  buildSessionWritebackResult,
  generateDiagnosisSuggestions,
  generateDifferentialChecklist,
  generateTreatmentSuggestions,
  type SessionDiagnosisSuggestion,
} from '../services/consultationSession';
import {
  useConsultationSessionStore,
  type SessionCard,
  type SessionCardKind,
  type SessionOption,
} from '../stores/consultationSession';
import { medicalDataService } from '../services/medicalData';
import { WINDOW_SIZES } from '../constants/windowSizes';
import { buildDiagnosisPathPayload } from '../services/diagnosisPath';

type SectionKey = 'patient' | 'recommendation' | 'timeline';
type ModuleKind = 'record' | 'diagnosis' | 'differential' | 'medication' | 'examination' | 'reminder';
type DiagnosisPathWindowPhase = 'preparing' | 'cache' | 'generating' | 'rendering' | 'success' | 'error';
type DiagnosisOptionGroup = {
  key: string;
  title: string;
  rangeLabel?: string;
  options: SessionOption[];
  order: number;
};

const DIAGNOSIS_PATH_WINDOW_LABEL = 'diagnosis-path-window';
const DIAGNOSIS_PATH_GENERATION_TIMEOUT_MS = 30000;
const DIAGNOSIS_PATH_RENDER_TIMEOUT_MS = 10000;

const props = defineProps<{
  patientInfo?: AppPatient | null;
  autoTrigger?: {
    kind: SessionCardKind;
    token: number;
  } | null;
}>();

const emit = defineEmits<{
  close: [];
  'open-full-consultation': [];
  'consume-auto-trigger': [];
}>();

const loadingTask = ref<SessionCardKind | null>(null);
const isWritingBack = ref(false);
const actionError = ref('');
const functionBarExpanded = ref(false);
const sections = ref<Record<SectionKey, boolean>>({
  patient: true,
  recommendation: true,
  timeline: false,
});
const moduleSections = ref<Record<ModuleKind, boolean>>({
  record: false,
  diagnosis: false,
  differential: false,
  medication: false,
  examination: false,
  reminder: false,
});
const sessionStore = useConsultationSessionStore();
const showToast = inject<(msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void>(
  'showToast'
);

const sessionContext = computed(() => buildSessionContext(props.patientInfo));
const cards = computed(() => sessionStore.cards);
const draft = computed(() => sessionStore.draft);
const getPatientAnchorId = (patient?: AppPatient | null) =>
  String(patient?.idPi || patient?.patientId || patient?.id || '');
const diagnosisPathSessionSource = computed(() => {
  const storePatient = sessionStore.patient;
  const propsPatient = props.patientInfo || null;

  if (
    storePatient &&
    propsPatient &&
    getPatientAnchorId(storePatient) === getPatientAnchorId(propsPatient)
  ) {
    return storePatient;
  }

  return propsPatient || storePatient || null;
});

const patientName = computed(() => sessionContext.value.patientName || '未接诊患者');
const patientGender = computed(() => sessionContext.value.gender || '未标注');
const patientAge = computed(() => sessionContext.value.age || '未知年龄');
const patientDepartment = computed(() => readPatientText(['department']) || '未分配科室');
const patientId = computed(() => readPatientText(['idPi', 'patientId', 'id']) || '-');
const patientAllergy = computed(() => sessionContext.value.allergyHistory || '未提供过敏史');
const patientComplaint = computed(() => sessionContext.value.chiefComplaint || '尚未填写主诉');
const patientHistory = computed(() => sessionContext.value.historyOfPresentIllness || '尚未填写现病史');
const patientDiagnosis = computed(() => readPatientText(['diagnosis']) || '未提供诊断');
const hasPatient = computed(() => Boolean(props.patientInfo));
const hasWritableDraft = computed(() =>
  Boolean(
    draft.value.chiefComplaint.trim() ||
      draft.value.historyOfPresentIllness.trim() ||
      draft.value.diagnoses.length ||
      draft.value.medications.length ||
      draft.value.examinations.length ||
      draft.value.reminders.length
  )
);

const pendingCount = computed(() => cards.value.filter((card) => !card.applied && card.kind !== 'session').length);
const patientSummaryRows = computed(() => [
  { label: '原始主诉', value: patientComplaint.value },
  { label: '原始现病史', value: patientHistory.value },
  { label: '过敏史', value: patientAllergy.value },
  { label: '当前诊断', value: patientDiagnosis.value },
]);
const recommendationCards = computed(() => cards.value.filter((card) => card.kind !== 'session'));
const latestRecommendationCard = computed<SessionCard | null>(() => {
  if (recommendationCards.value.length > 0) {
    return recommendationCards.value[recommendationCards.value.length - 1];
  }
  return cards.value.length > 0 ? cards.value[cards.value.length - 1] : null;
});
const recentCards = computed(() => {
  const latestId = latestRecommendationCard.value?.id;
  return [...cards.value]
    .filter((card) => card.id !== latestId)
    .slice(-3)
    .reverse();
});
const draftDigest = computed(() => {
  const parts: string[] = [];
  if (draft.value.chiefComplaint.trim()) parts.push('主诉');
  if (draft.value.historyOfPresentIllness.trim()) parts.push('现病史');
  if (draft.value.diagnoses.length) parts.push(`诊断 ${draft.value.diagnoses.length}`);
  if (draft.value.medications.length) parts.push(`用药 ${draft.value.medications.length}`);
  if (draft.value.examinations.length) parts.push(`检查 ${draft.value.examinations.length}`);
  return parts.length ? `已沉淀 ${parts.join(' / ')}` : '尚未采纳推荐内容';
});
const draftDockStatus = computed(() => {
  if (pendingCount.value > 0) {
    return `${pendingCount.value} 待处理`;
  }
  if (hasWritableDraft.value) {
    return '可回写';
  }
  return '未采纳';
});
const moduleActions: Array<{
  kind: ModuleKind;
  label: string;
  emptyText: string;
}> = [
  { kind: 'record', label: '主诉病史草稿', emptyText: '尚未生成 AI 病历草稿' },
  { kind: 'diagnosis', label: '推荐诊断', emptyText: '尚未生成诊断建议' },
  { kind: 'differential', label: '诊断鉴别', emptyText: '尚未生成鉴别建议' },
  { kind: 'medication', label: '推荐用药', emptyText: '尚未生成用药建议' },
  { kind: 'examination', label: '推荐检查', emptyText: '尚未生成检查建议' },
  { kind: 'reminder', label: '智能提醒', emptyText: '尚未同步提醒' },
];
const recommendationModules = computed(() =>
  moduleActions.map((action, index) => {
    const card = getLatestCardByKind(action.kind);
    return {
      ...action,
      index: index + 1,
      card,
      expanded: moduleSections.value[action.kind],
      badge: moduleBadgeText(card),
      preview: modulePreviewText(action.kind, card, action.emptyText),
    };
  })
);
const primaryActions = [
  { kind: 'diagnosis' as SessionCardKind, label: '推荐诊断', icon: 'lucide:stethoscope' },
  { kind: 'medication' as SessionCardKind, label: '推荐用药', icon: 'lucide:pill' },
  { kind: 'examination' as SessionCardKind, label: '推荐检查', icon: 'lucide:test-tube' },
];
const secondaryActions = [
  { kind: 'record' as SessionCardKind, label: '主诉病史', icon: 'lucide:file-text' },
  { kind: 'differential' as SessionCardKind, label: '诊断鉴别', icon: 'lucide:split-square-vertical' },
  { kind: 'reminder' as SessionCardKind, label: '智能提醒', icon: 'lucide:triangle-alert' },
];

watch(
  () => [
    props.patientInfo?.idPi,
    props.patientInfo?.patientId,
    props.patientInfo?.id,
    props.patientInfo?.naPi,
  ],
  () => {
    resetSessionCards();
  },
  { immediate: true }
);

watch(
  () => props.autoTrigger?.token,
  async (token) => {
    if (!token || !props.autoTrigger?.kind || !props.patientInfo) {
      return;
    }
    openRecommendationModule(props.autoTrigger.kind as ModuleKind);
    await triggerByKind(props.autoTrigger.kind);
    emit('consume-auto-trigger');
  },
  { immediate: true }
);

function readPatientText(keys: string[]): string {
  const patient = props.patientInfo;
  if (!patient) {
    return '';
  }

  for (const key of keys) {
    const value = patient[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return '';
}

function toggleSection(section: SectionKey): void {
  sections.value[section] = !sections.value[section];
}

function toggleRecommendationModule(kind: ModuleKind): void {
  moduleSections.value[kind] = !moduleSections.value[kind];
}

function openRecommendationModule(kind: ModuleKind): void {
  moduleSections.value[kind] = true;
}

function toggleFunctionBar(): void {
  functionBarExpanded.value = !functionBarExpanded.value;
}

function openFullConsultation(): void {
  functionBarExpanded.value = false;
  emit('open-full-consultation');
}

function resetSectionLayout(): void {
  sections.value.patient = true;
  sections.value.recommendation = true;
  sections.value.timeline = false;
  moduleSections.value.record = false;
  moduleSections.value.diagnosis = false;
  moduleSections.value.differential = false;
  moduleSections.value.medication = false;
  moduleSections.value.examination = false;
  moduleSections.value.reminder = false;
}

function resetSessionCards(): void {
  if (!props.patientInfo) {
    sessionStore.clearSession();
    return;
  }

  sessionStore.startSession(props.patientInfo);
  resetSectionLayout();

  sessionStore.appendCard({
    kind: 'session',
    badge: 'SESSION',
    title: '已进入本次接诊 session',
    source: '灵活触发入口',
    summary: '当前为灵活模式，可按需触发单个 AI 任务，不打断原症状问诊主流程。',
    status: '已建立',
    statusTone: 'accent',
    details: [
      `患者：${patientName.value} / ${patientDepartment.value}`,
      '本入口承载轻量任务时间线，不替代最终医生决策。',
      '需要完整症状采集时，可随时跳转进入旧的 ConsultationPage。',
    ],
  });

  pushReminderCard();
}

function pushRecordCard(): void {
  const recordDraft = buildRecordDraft(sessionContext.value);
  sessionStore.appendCard({
    kind: 'record',
    badge: '病历',
    title: '主诉与现病史草稿已生成',
    source: '灵活触发',
    summary: '基于当前患者上下文和接诊信息生成主诉、现病史草稿。',
    status: '待医生确认',
    details: [
      `主诉建议：${recordDraft.chiefComplaint}`,
      `现病史摘要：${recordDraft.historyOfPresentIllness}`,
      '医生可在完整问诊页继续补充症状属性，不会打断当前 session。',
    ],
  });
}

async function pushDiagnosisCard(): Promise<void> {
  const diagnoses = await generateDiagnosisSuggestions(sessionContext.value);
  const options = diagnoses.map((diagnosis, index) => ({
    id: diagnosis.id || `${diagnosis.code || diagnosis.name}-${index}`,
    title: diagnosis.name,
    description: diagnosis.rationale,
    code: diagnosis.code,
    meta: diagnosis.rate,
    caption: diagnosis.id ? `已匹配标准诊断 ${diagnosis.code}` : '未匹配标准库',
    matched: !!diagnosis.id,
    selected: false,
  }));
  sessionStore.appendCard({
    kind: 'diagnosis',
    badge: '诊断',
    title: '推荐诊断已生成',
    source: '灵活触发',
    summary: '复用完整问诊页的诊断推荐与匹配规则，需医生明确选中后才写入草稿。',
    status: '待选择',
    options,
    details: [
      '优先结合当前主诉、现病史和既往病史做轻量筛选。',
      '医生采纳候选诊断后，可继续触发诊断鉴别和推荐用药。',
    ],
  });
}

async function pushDifferentialCard(): Promise<void> {
  const selectedDiagnosis = getSelectedDiagnosis() || {
    name: '当前诊断未确定',
    code: '',
    rate: '',
    rationale: '',
  };
  const checklist = await generateDifferentialChecklist(sessionContext.value, selectedDiagnosis.name);
  sessionStore.appendCard({
    kind: 'differential',
    badge: '鉴别',
    title: `诊断鉴别：${selectedDiagnosis.name}`,
    source: '灵活触发',
    summary: '围绕当前诊断给出核心区别点，不要求医生输入大段文本。',
    status: checklist.isNeeded ? '待补充依据' : '当前诊断较清晰',
    details: checklist.isNeeded
      ? checklist.items.map((item) => `${item.question}；建议补充：${item.recordText}`)
      : [
          `当前关注诊断：${selectedDiagnosis.name}`,
          '当前上下文未识别出明确的高危鉴别排雷项，可继续由医生按需补充。',
        ],
  });
}

async function pushMedicationCard(): Promise<void> {
  const selectedDiagnosis = getSelectedDiagnosis();
  const recommendations = await generateTreatmentSuggestions(
    sessionContext.value,
    selectedDiagnosis || {
      code: '',
      name: '待医生确认诊断',
      rate: '',
      rationale: '',
    }
  );
  sessionStore.appendCard({
    kind: 'medication',
    badge: '用药',
    title: '推荐用药草稿已生成',
    source: '灵活触发',
    summary: '贴合基层门诊常见用药规范，最终校验仍以医生站为准。',
    status: '待医生确认',
    options: recommendations
      .filter((item) => item.type === 'medicine')
      .map((item, index) => ({
        id: `medicine-${index}`,
        title: item.matchedItem?.name || item.name,
        description: item.reason,
        meta: item.usage || '',
        caption: item.matchedItem
          ? `已匹配 ${item.matchedItem.name}${item.matchedItem.spec ? ` · ${item.matchedItem.spec}` : ''}`
          : '未匹配标准库',
        matched: !!item.matchedItem,
        selected: false,
      })),
    details: [
      '复用完整问诊页的方案推荐与药品标准库匹配规则。',
      '若当前诊断仍在调整，建议先完成诊断鉴别再采纳用药草稿。',
    ],
  });
}

async function pushExaminationCard(): Promise<void> {
  const selectedDiagnosis = getSelectedDiagnosis();
  const recommendations = await generateTreatmentSuggestions(
    sessionContext.value,
    selectedDiagnosis || {
      code: '',
      name: '待医生确认诊断',
      rate: '',
      rationale: '',
    }
  );
  sessionStore.appendCard({
    kind: 'examination',
    badge: '检查',
    title: '检查检验建议已生成',
    source: '灵活触发',
    summary: '优先保留能影响门诊决策的关键检查，避免重复推荐。',
    status: '待医生确认',
    options: recommendations
      .filter((item) => item.type === 'exam')
      .map((item, index) => ({
        id: `exam-${index}`,
        title: item.matchedItem?.name || item.name,
        description: item.reason,
        caption: item.matchedItem ? `已匹配 ${item.matchedItem.name}` : '未匹配标准库',
        matched: !!item.matchedItem,
        selected: false,
      })),
    details: [
      '复用完整问诊页的方案推荐与检查标准库匹配规则。',
      '已完成或重复的项目应允许医生一键删除，不中断当前 session。',
    ],
  });
}

function pushReminderCard(): void {
  const reminders = buildSessionReminders(sessionContext.value);
  const reminderLines = [
    ...reminders.urgent.map((line) => `紧急：${line}`),
    ...reminders.normal.map((line) => `普通：${line}`),
  ];
  sessionStore.appendCard({
    kind: 'reminder',
    badge: '提醒',
    title: '当前患者提醒已同步',
    source: '患者上下文',
    summary: '提醒始终跟随当前患者切换，紧急项优先暴露给医生。',
    status: reminderLines.some((line) => line.includes('紧急')) ? '存在紧急提醒' : '已更新',
    statusTone: reminderLines.some((line) => line.includes('紧急')) ? 'warn' : 'default',
    details: reminderLines,
  });
}

function getSelectedDiagnosis(): SessionDiagnosisSuggestion | null {
  const selectedOption = sessionStore.getLatestSelectedDiagnosis();
  if (!selectedOption) {
    if (!patientDiagnosis.value || patientDiagnosis.value === '未提供诊断') {
      return null;
    }
    return {
      code: '',
      name: patientDiagnosis.value,
      rate: '',
      rationale: '来自门诊医生站当前诊断草稿。',
    };
  }

  return {
    code: selectedOption.code || '',
    name: selectedOption.title,
    rate: selectedOption.meta || '',
    rationale: selectedOption.description,
  };
}

function getLatestCardByKind(kind: ModuleKind): SessionCard | null {
  return [...cards.value].reverse().find((card) => card.kind === kind) || null;
}

function modulePreviewText(kind: ModuleKind, card: SessionCard | null, emptyText: string): string {
  if (loadingTask.value === kind) {
    return '正在生成建议...';
  }
  if (!card) {
    return emptyText;
  }
  return card.title;
}

function moduleBadgeText(card: SessionCard | null): string {
  if (!card) {
    return '';
  }
  if (card.kind === 'diagnosis' || card.kind === 'medication' || card.kind === 'examination') {
    const total = card.options?.length || 0;
    const selected = card.options?.filter((option) => option.selected).length || 0;
    return total > 0 ? `${selected}/${total}` : card.status;
  }
  if (card.kind === 'reminder') {
    return `${card.details.length} 条`;
  }
  return card.status;
}

function cardNeedsOptions(card: SessionCard | null): boolean {
  const kind = card?.kind;
  return kind === 'diagnosis' || kind === 'medication' || kind === 'examination';
}

function cardOptions(card: SessionCard | null) {
  return card?.options || [];
}

function diagnosisOptionGroups(card: SessionCard | null): DiagnosisOptionGroup[] {
  if (!card || card.kind !== 'diagnosis' || !card.options?.length) {
    return [];
  }

  const groupMap = new Map<string, DiagnosisOptionGroup>();

  card.options.forEach((option) => {
    const category = medicalDataService.getIcd10CategoryInfo(option.code || '');
    const key = category ? `icd10-${category.key}` : 'icd10-unknown';

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        title: category?.title || '未分类/待确认',
        rangeLabel: category?.range,
        options: [],
        order: category?.order ?? Number.MAX_SAFE_INTEGER,
      });
    }

    groupMap.get(key)?.options.push(option);
  });

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function shouldShowConfirm(card: SessionCard | null): boolean {
  if (!card) {
    return false;
  }
  return (
    card.kind === 'record' ||
    card.kind === 'diagnosis' ||
    card.kind === 'medication' ||
    card.kind === 'examination'
  );
}

function extractRecordDraft(card: SessionCard | null): { chiefComplaint: string; historyOfPresentIllness: string } {
  if (!card || card.kind !== 'record') {
    return {
      chiefComplaint: '',
      historyOfPresentIllness: '',
    };
  }

  return {
    chiefComplaint:
      card.details.find((item) => item.startsWith('主诉建议：'))?.replace('主诉建议：', '').trim() || '',
    historyOfPresentIllness:
      card.details.find((item) => item.startsWith('现病史摘要：'))?.replace('现病史摘要：', '').trim() || '',
  };
}

function statusClass(card: SessionCard): string {
  return card.statusTone || 'default';
}

function canApplyCard(card: SessionCard | null): boolean {
  if (!card) {
    return false;
  }

  if (card.kind === 'record' || card.kind === 'reminder') {
    return true;
  }

  if (card.kind === 'diagnosis' || card.kind === 'medication' || card.kind === 'examination') {
    return Boolean(card.options?.some((option) => option.selected));
  }

  return false;
}

function applyButtonText(card: SessionCard | null): string {
  if (!card) {
    return '确认并回写';
  }

  if (card.kind === 'medication' || card.kind === 'examination') {
    return '确认所选并回写';
  }

  return '确认并回写';
}

function selectOption(cardId: string, optionId: string): void {
  sessionStore.selectCardOption(cardId, optionId);
}

function markReviewed(cardId: string): void {
  sessionStore.markCardReviewed(cardId);
}

async function emitDiagnosisPathStatus(payload: {
  loading: boolean;
  phase: DiagnosisPathWindowPhase;
  message: string;
  detail?: string;
  clearPayload?: boolean;
}): Promise<void> {
  await emitTo(DIAGNOSIS_PATH_WINDOW_LABEL, 'diagnosis-path:status', payload);
}

async function waitForDiagnosisPathWindowReady(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('诊断路径窗口初始化超时。')), 8000);
    void once<{ label: string }>('diagnosis-path:ready', ({ payload: ready }) => {
      if (ready?.label !== DIAGNOSIS_PATH_WINDOW_LABEL) {
        return;
      }
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForDiagnosisPathRenderResult(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('诊断路径渲染超时。')), DIAGNOSIS_PATH_RENDER_TIMEOUT_MS);

    void once<{ label: string }>('diagnosis-path:rendered', ({ payload: ready }) => {
      if (ready?.label !== DIAGNOSIS_PATH_WINDOW_LABEL) {
        return;
      }
      clearTimeout(timer);
      resolve();
    });

    void once<{ label: string; message?: string }>('diagnosis-path:render-failed', ({ payload: failed }) => {
      if (failed?.label !== DIAGNOSIS_PATH_WINDOW_LABEL) {
        return;
      }
      clearTimeout(timer);
      reject(new Error(failed?.message || '诊断路径渲染失败。'));
    });
  });
}

async function withDiagnosisPathTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('诊断路径生成超时。'));
        }, DIAGNOSIS_PATH_GENERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function ensureDiagnosisPathWindowVisible(pathWindow: WebviewWindow): void {
  void pathWindow.show().catch((error) => {
    console.warn('[DiagnosisPath] Failed to show diagnosis path window:', error);
  });
  void pathWindow.setFocus().catch((error) => {
    console.warn('[DiagnosisPath] Failed to focus diagnosis path window:', error);
  });
}

async function openDiagnosisPath(card: SessionCard | null): Promise<void> {
  if (!card || card.kind !== 'diagnosis' || !card.options?.length) {
    showToast?.('当前没有可展示的诊断路径。', 'info');
    return;
  }

  const selectedOption = card.options.find((option) => option.selected) || card.options[0];
  const sessionKey = sessionStore.resolveDiagnosisPathSessionKey(diagnosisPathSessionSource.value);
  const targetKey = sessionStore.resolveDiagnosisPathTargetKey(selectedOption);
  const candidateSignature = sessionStore.resolveDiagnosisPathCandidateSignature(card.options);
  let pathWindow = await WebviewWindow.getByLabel(DIAGNOSIS_PATH_WINDOW_LABEL);
  const shouldWaitReady = !pathWindow;

  if (!pathWindow) {
    pathWindow = new WebviewWindow(DIAGNOSIS_PATH_WINDOW_LABEL, {
      url: '/?window=diagnosis-path',
      title: '诊断推理路径',
      width: WINDOW_SIZES.DIAGNOSIS_PATH.width,
      height: WINDOW_SIZES.DIAGNOSIS_PATH.height,
      minWidth: 920,
      minHeight: 620,
      center: true,
      focus: true,
      resizable: true,
    });

    await new Promise<void>((resolve, reject) => {
      pathWindow?.once('tauri://created', () => resolve());
      pathWindow?.once('tauri://error', (event) => reject(event.payload));
    });
  }

  if (shouldWaitReady) {
    await waitForDiagnosisPathWindowReady();
  }

  await emitDiagnosisPathStatus({
    loading: true,
    phase: 'cache',
    clearPayload: true,
    message: '正在检查诊断路径缓存...',
    detail: '优先复用当前会话中已生成的推理结果。',
  });
  ensureDiagnosisPathWindowVisible(pathWindow);

  let payload = sessionStore.getDiagnosisPathCache(sessionKey, targetKey, candidateSignature);

  try {
    if (payload) {
      await emitDiagnosisPathStatus({
        loading: true,
        phase: 'rendering',
        message: '已命中缓存，正在渲染诊断路径...',
        detail: '正在绘制 Sankey 图和说明面板。',
      });
    } else {
      await emitDiagnosisPathStatus({
        loading: true,
        phase: 'generating',
        message: '正在生成结构化推理链...',
        detail: '模型会整理支持证据、反证提醒和鉴别要点。',
      });
      payload = await withDiagnosisPathTimeout(
        buildDiagnosisPathPayload(sessionContext.value, card.options, selectedOption?.id)
      );
      if (payload) {
        sessionStore.setDiagnosisPathCache(sessionKey, targetKey, candidateSignature, payload);
      }
    }

    if (!payload) {
      await emitDiagnosisPathStatus({
        loading: false,
        phase: 'error',
        clearPayload: true,
        message: '暂时无法生成诊断路径。',
        detail: '模型未返回可用的结构化推理结果。',
      });
      showToast?.('暂时无法生成诊断路径。', 'info');
      return;
    }

    await emitDiagnosisPathStatus({
      loading: true,
      phase: 'rendering',
      message: '诊断路径已生成，正在渲染...',
      detail: '准备绘制图表并填充右侧说明面板。',
    });
    const renderResult = waitForDiagnosisPathRenderResult();
    await emitTo(DIAGNOSIS_PATH_WINDOW_LABEL, 'diagnosis-path:update', payload);
    await renderResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : '诊断路径处理失败。';
    await emitDiagnosisPathStatus({
      loading: false,
      phase: 'error',
      clearPayload: true,
      message,
      detail: message.includes('超时')
        ? '当前步骤耗时过长，建议稍后重试或检查模型响应。'
        : '窗口未能完成图表渲染，请查看控制台日志。',
    });
    showToast?.(message, 'error');
  }
}

async function confirmCard(cardId: string): Promise<void> {
  const card = cards.value.find((item) => item.id === cardId) || null;
  if (!canApplyCard(card)) {
    showToast?.('请先在候选列表中完成选择，再确认回写。', 'info');
    return;
  }

  if (!sessionStore.applyCardToDraft(cardId)) {
    showToast?.('当前卡片没有可回写的内容。', 'info');
    return;
  }

  await nextTick();
  const success = await writebackDraft(false);
  if (success) {
    sessionStore.replaceCard(cardId, {
      status: '已确认并回写',
      statusTone: 'accent',
      applied: true,
    });
    showToast?.('已确认并回写到医生站结果通道。', 'success');
  }
}

async function writebackDraft(showSuccessToast = true): Promise<boolean> {
  if (!props.patientInfo || !hasWritableDraft.value) {
    showToast?.('请先采纳任一推荐内容，再回写医生站。', 'info');
    return false;
  }

  functionBarExpanded.value = false;
  isWritingBack.value = true;
  actionError.value = '';

  try {
    const result = buildSessionWritebackResult(props.patientInfo, draft.value);
    await invoke('complete_consultation', { result });
    sessionStore.appendCard({
      kind: 'session',
      badge: '回写',
      title: '已回写医生站草稿',
      source: 'session draft',
      summary: '当前已采纳内容已写入本地 HIS 结果通道，等待医生站拉取。',
      status: '已回写',
      statusTone: 'accent',
      details: [
        `主诉：${result.chiefComplaint || '未填写'}`,
        `诊断：${result.diagnosisList.length ? result.diagnosisList.map((item) => item.name).join('；') : '未采纳'}`,
        `用药：${result.medications.length ? result.medications.map((item) => item.name).join('；') : '未采纳'}`,
        `检查：${result.examinations.length ? result.examinations.map((item) => item.name).join('；') : '未采纳'}`,
      ],
    });
    sections.value.timeline = true;
    if (showSuccessToast) {
      showToast?.('session 草稿已回写到医生站结果通道。', 'success');
    }
    return true;
  } catch (error) {
    console.error('[ConsultationSessionPanel] writebackDraft failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    actionError.value = `回写失败：${message}`;
    showToast?.(`回写失败：${message}`, 'error');
    return false;
  } finally {
    isWritingBack.value = false;
  }
}

async function triggerByKind(kind: SessionCardKind): Promise<void> {
  functionBarExpanded.value = false;
  loadingTask.value = kind;
  actionError.value = '';
  sections.value.recommendation = true;
  if (kind !== 'session') {
    openRecommendationModule(kind as ModuleKind);
  }

  try {
    switch (kind) {
      case 'record':
        pushRecordCard();
        break;
      case 'diagnosis':
        await pushDiagnosisCard();
        break;
      case 'differential':
        await pushDifferentialCard();
        break;
      case 'medication':
        await pushMedicationCard();
        break;
      case 'examination':
        await pushExaminationCard();
        break;
      case 'reminder':
        pushReminderCard();
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('[ConsultationSessionPanel] triggerByKind failed:', error);
    actionError.value = error instanceof Error ? error.message : '生成建议失败';
  } finally {
    loadingTask.value = null;
  }
}
</script>

<template>
  <section class="session-panel">
    <div v-if="hasPatient" class="assistant-shell">
      <div class="assistant-anchor" aria-hidden="true">
        <div class="assistant-orb">
          <img class="assistant-avatar" src="/robot-avatar.png" alt="" />
        </div>
      </div>

      <header class="sheet-header">
        <div class="drag-handle" data-tauri-drag-region aria-hidden="true"></div>
        <div class="patient-overview">
          <p class="eyebrow">Smart Assistant</p>
          <div class="headline-row">
            <h2>{{ patientName }}</h2>
            <span class="patient-inline">{{ patientGender }} {{ patientAge }}</span>
          </div>
          <p class="patient-subline">{{ patientDepartment }}</p>
          <div class="tag-row">
            <span class="info-tag">ID {{ patientId }}</span>
            <span class="info-tag accent">待处理 {{ pendingCount }}</span>
            <span class="info-tag ghost">AI 辅助中</span>
          </div>
        </div>
        <button class="close-btn" title="收起" @click="emit('close')">
          <Icon icon="lucide:x" size="18" />
        </button>
      </header>

      <div class="sheet-body">
        <section class="assistant-section">
          <button class="section-bar" @click="toggleSection('patient')">
            <span class="section-index">1</span>
            <div class="section-copy">
              <strong>患者原始信息</strong>
              <span>{{ patientComplaint }}</span>
            </div>
            <span class="section-toggle">{{ sections.patient ? '收起' : '展开' }}</span>
          </button>
          <div v-if="sections.patient" class="section-body">
            <div v-for="item in patientSummaryRows" :key="item.label" class="info-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </section>

        <section class="assistant-section focus">
          <button class="section-bar" @click="toggleSection('recommendation')">
            <span class="section-index">2</span>
            <div class="section-copy">
              <strong>AI 建议</strong>
              <span>按模块查看推荐内容，可独立展开或收起</span>
            </div>
            <span class="section-toggle">{{ sections.recommendation ? '收起' : '展开' }}</span>
          </button>
          <div v-if="sections.recommendation" class="section-body">
            <div v-if="actionError" class="assistant-error">{{ actionError }}</div>

            <div class="module-list">
              <article
                v-for="module in recommendationModules"
                :key="module.kind"
                class="module-panel"
                :class="{ expanded: module.expanded }"
              >
                <button class="module-bar" @click="toggleRecommendationModule(module.kind)">
                  <span class="module-index">{{ module.index }}</span>
                  <div class="module-copy">
                    <strong>{{ module.label }}</strong>
                    <span>{{ module.preview }}</span>
                  </div>
                  <div class="module-meta">
                    <span v-if="module.badge" class="module-count">{{ module.badge }}</span>
                    <span class="module-toggle">{{ module.expanded ? '收起' : '展开' }}</span>
                  </div>
                </button>

                <div v-if="module.expanded" class="module-body">
                <div v-if="loadingTask === module.kind" class="assistant-notice">正在生成 {{ module.label }}...</div>

                  <template v-else-if="module.card">
                    <template v-if="module.kind === 'record'">
                      <div class="record-draft-head">
                        <div>
                          <span class="record-draft-tag">AI 生成草稿</span>
                          <h3>{{ module.card.title }}</h3>
                          <p>{{ module.card.summary }}</p>
                        </div>
                        <span class="status-pill" :class="statusClass(module.card)">
                          {{ module.card.status }}
                        </span>
                      </div>

                      <p class="source-line">来源：{{ module.card.source }} · {{ module.card.createdAt }}</p>

                      <div class="record-draft-grid">
                        <div class="record-draft-item">
                          <span>AI 生成主诉</span>
                          <strong>{{ extractRecordDraft(module.card).chiefComplaint || '未生成' }}</strong>
                        </div>
                        <div class="record-draft-item">
                          <span>AI 生成现病史</span>
                          <strong>{{ extractRecordDraft(module.card).historyOfPresentIllness || '未生成' }}</strong>
                        </div>
                      </div>

                      <div class="detail-list">
                        <div
                          v-for="detail in module.card.details.filter((item) => !item.startsWith('主诉建议：') && !item.startsWith('现病史摘要：'))"
                          :key="detail"
                          class="detail-item"
                        >
                          {{ detail }}
                        </div>
                      </div>

                      <div class="inline-actions">
                        <button class="ghost-btn" @click="markReviewed(module.card.id)">已查看</button>
                        <button
                          class="primary-btn small"
                          :disabled="isWritingBack || module.card.applied || !canApplyCard(module.card)"
                          @click="confirmCard(module.card.id)"
                        >
                          {{ module.card.applied ? '已回写' : applyButtonText(module.card) }}
                        </button>
                      </div>
                    </template>

                    <template v-else>
                    <div class="recommendation-head">
                      <div>
                        <h3>{{ module.card.title }}</h3>
                        <p>{{ module.card.summary }}</p>
                      </div>
                      <span class="status-pill" :class="statusClass(module.card)">
                        {{ module.card.status }}
                      </span>
                    </div>

                    <p class="source-line">来源：{{ module.card.source }} · {{ module.card.createdAt }}</p>

                    <div v-if="cardOptions(module.card).length" class="candidate-block">
                      <div class="candidate-header">
                        <strong>待选项</strong>
                        <span>{{ cardOptions(module.card).length }} 项</span>
                      </div>
                      <div v-if="module.kind === 'diagnosis'" class="diagnosis-option-group-list">
                        <section
                          v-for="group in diagnosisOptionGroups(module.card)"
                          :key="group.key"
                          class="diagnosis-option-group"
                        >
                          <div class="diagnosis-option-group-header">
                            <div class="diagnosis-option-group-title-row">
                              <strong>{{ group.title }}</strong>
                              <span v-if="group.rangeLabel" class="diagnosis-option-group-range">{{ group.rangeLabel }}</span>
                            </div>
                            <span>{{ group.options.length }} 项</span>
                          </div>
                          <div class="option-list prominent">
                            <button
                              v-for="option in group.options"
                              :key="option.id"
                              class="option-card"
                              :class="{ selected: option.selected }"
                              @click="selectOption(module.card.id, option.id)"
                            >
                              <div class="option-title-row">
                                <strong>{{ option.title }}</strong>
                                <span v-if="option.selected" class="selected-flag">已选</span>
                              </div>
                              <div v-if="option.caption" class="option-caption" :class="{ matched: option.matched }">
                                {{ option.caption }}
                              </div>
                              <div v-if="option.meta" class="option-meta">{{ option.meta }}</div>
                              <p>{{ option.description }}</p>
                            </button>
                          </div>
                        </section>
                      </div>
                      <div v-else class="option-list prominent">
                        <button
                          v-for="option in cardOptions(module.card)"
                          :key="option.id"
                          class="option-card"
                          :class="{ selected: option.selected }"
                          @click="selectOption(module.card.id, option.id)"
                        >
                          <div class="option-title-row">
                            <strong>{{ option.title }}</strong>
                            <span v-if="option.selected" class="selected-flag">已选</span>
                          </div>
                          <div v-if="option.caption" class="option-caption" :class="{ matched: option.matched }">
                            {{ option.caption }}
                          </div>
                          <div v-if="option.meta" class="option-meta">{{ option.meta }}</div>
                          <p>{{ option.description }}</p>
                        </button>
                      </div>
                    </div>

                    <div v-else-if="cardNeedsOptions(module.card)" class="candidate-empty">
                      当前模块未返回待选项，请重试一次；若仍为空，需要回到完整问诊页补齐输入后再生成。
                    </div>

                    <div class="detail-list">
                      <div v-for="detail in module.card.details" :key="detail" class="detail-item">
                        {{ detail }}
                      </div>
                    </div>

                    <div class="inline-actions">
                      <button class="ghost-btn" @click="markReviewed(module.card.id)">已查看</button>
                      <button
                        v-if="module.kind === 'diagnosis'"
                        class="ghost-btn"
                        :disabled="!cardOptions(module.card).length"
                        @click="openDiagnosisPath(module.card)"
                      >
                        查看诊断路径
                      </button>
                      <button
                        v-if="shouldShowConfirm(module.card)"
                        class="primary-btn small"
                        :disabled="isWritingBack || module.card.applied || !canApplyCard(module.card)"
                        @click="confirmCard(module.card.id)"
                      >
                        {{ module.card.applied ? '已回写' : applyButtonText(module.card) }}
                      </button>
                    </div>
                    </template>
                  </template>

                  <template v-else>
                    <div class="module-empty">
                      <p>{{ module.emptyText }}</p>
                      <button class="ghost-btn compact" :disabled="!!loadingTask" @click="triggerByKind(module.kind)">
                        生成{{ module.label }}
                      </button>
                    </div>
                  </template>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section class="assistant-section">
          <button class="section-bar" @click="toggleSection('timeline')">
            <span class="section-index">3</span>
            <div class="section-copy">
              <strong>最近轨迹</strong>
              <span>{{ recentCards.length ? `最近 ${recentCards.length} 条辅助记录` : '当前无更多轨迹' }}</span>
            </div>
            <span class="section-toggle">{{ sections.timeline ? '收起' : '展开' }}</span>
          </button>
          <div v-if="sections.timeline" class="section-body timeline-body">
            <div v-if="recentCards.length" class="timeline-list">
              <article v-for="card in recentCards" :key="card.id" class="timeline-item">
                <div class="timeline-main">
                  <span class="timeline-badge">{{ card.badge }}</span>
                  <strong>{{ card.title }}</strong>
                  <p>{{ card.summary }}</p>
                </div>
                <div class="timeline-side">
                  <span class="mini-status" :class="statusClass(card)">{{ card.status }}</span>
                  <span>{{ card.createdAt }}</span>
                </div>
              </article>
            </div>
            <p v-else class="empty-copy">暂时没有更多历史轨迹。</p>
          </div>
        </section>
      </div>

      <footer class="action-dock">
        <div class="action-strip">
          <div class="dock-status">
            <span>草稿</span>
            <strong>{{ draftDockStatus }}</strong>
          </div>

          <button class="function-launcher" @click="toggleFunctionBar">
            <Icon :icon="functionBarExpanded ? 'lucide:chevron-down' : 'lucide:panel-bottom-open'" size="16" />
            <span>{{ functionBarExpanded ? '收起操作' : '快捷操作' }}</span>
          </button>

          <button
            class="primary-btn dock-writeback"
            :disabled="isWritingBack || !hasWritableDraft"
            :aria-busy="isWritingBack"
            @click="() => writebackDraft()"
          >
            <Icon v-if="isWritingBack" icon="lucide:loader-2" class="animate-spin" size="16" />
            <span>{{ isWritingBack ? '回写中' : '回写草稿' }}</span>
          </button>
        </div>

        <section v-if="functionBarExpanded" class="function-popover">
          <div class="dock-grid compact">
            <button
              v-for="action in primaryActions"
              :key="action.kind"
              class="dock-btn"
              :disabled="!!loadingTask"
              @click="triggerByKind(action.kind)"
            >
              <Icon :icon="action.icon" size="18" />
              <span>{{ action.label }}</span>
            </button>
          </div>

          <div class="function-chip-row">
            <button
              v-for="action in secondaryActions"
              :key="action.kind"
              class="secondary-chip"
              :disabled="!!loadingTask"
              @click="triggerByKind(action.kind)"
            >
              <Icon :icon="action.icon" size="15" />
              <span>{{ action.label }}</span>
            </button>
          </div>

          <div class="popover-footer">
            <div class="popover-summary">{{ draftDigest }}</div>
            <button class="ghost-btn compact" @click="openFullConsultation">
              完整问诊
            </button>
          </div>
        </section>
      </footer>
    </div>

    <div v-else class="empty-state">
      <Icon icon="lucide:user-round-x" size="32" />
      <h3>当前没有接诊患者</h3>
      <p>请从 HIS 触发接诊，或者先在悬浮球中选择患者上下文。</p>
    </div>
  </section>
</template>

<style scoped>
.session-panel {
  width: 100%;
  height: 100%;
  padding: 14px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  background:
    radial-gradient(circle at top right, rgba(132, 180, 255, 0.22), transparent 32%),
    linear-gradient(180deg, rgba(246, 249, 255, 0.98) 0%, rgba(236, 242, 250, 0.98) 100%);
}

.session-panel::-webkit-scrollbar {
  width: 10px;
}

.session-panel::-webkit-scrollbar-track {
  background: rgba(205, 220, 246, 0.45);
  border-radius: 999px;
}

.session-panel::-webkit-scrollbar-thumb {
  background: rgba(96, 136, 210, 0.55);
  border-radius: 999px;
  border: 2px solid rgba(246, 249, 255, 0.9);
}

.session-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(76, 108, 166, 0.72);
}

.assistant-shell {
  position: relative;
  min-height: 100%;
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 12px;
  padding-top: 14px;
}

.assistant-anchor {
  position: absolute;
  top: -10px;
  left: 18px;
  z-index: 3;
  pointer-events: none;
}

.assistant-orb {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 35%, #fdfefe 0%, #d9ebff 55%, #8ebcff 100%);
  border: 4px solid rgba(255, 255, 255, 0.95);
  box-shadow:
    0 10px 24px rgba(61, 118, 214, 0.24),
    inset 0 -8px 14px rgba(103, 155, 234, 0.18);
}

.assistant-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.sheet-header,
.assistant-section,
.action-dock,
.empty-state {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(118, 151, 206, 0.2);
  box-shadow: 0 18px 34px rgba(52, 94, 156, 0.12);
}

.sheet-header {
  position: relative;
  padding: 20px 16px 16px 86px;
  border-radius: 30px 30px 22px 22px;
  background:
    radial-gradient(circle at right top, rgba(160, 195, 255, 0.42), transparent 30%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(236, 243, 255, 0.94) 100%);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.drag-handle {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 72px;
  height: 6px;
  border-radius: 999px;
  background: rgba(129, 156, 205, 0.28);
}

.eyebrow {
  margin: 0 0 6px;
  color: #5f7ba8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.headline-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.headline-row h2,
.recommendation-head h3,
.empty-state h3 {
  margin: 0;
  color: #24344f;
}

.headline-row h2 {
  font-size: 26px;
  line-height: 1.1;
}

.patient-inline,
.patient-subline {
  color: #5e6d86;
}

.patient-inline {
  font-size: 13px;
  font-weight: 700;
}

.patient-subline {
  margin: 8px 0 0;
  font-size: 14px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.info-tag,
.section-index,
.section-toggle,
.status-pill,
.mini-status,
.timeline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 700;
}

.info-tag {
  padding: 7px 12px;
  background: rgba(84, 132, 216, 0.1);
  color: #4c69a0;
  font-size: 12px;
}

.info-tag.accent {
  background: rgba(114, 172, 245, 0.18);
  color: #325ea8;
}

.info-tag.ghost {
  background: rgba(246, 247, 252, 0.9);
  color: #7c8aa7;
}

.close-btn,
.section-bar,
.option-card,
.ghost-btn,
.primary-btn,
.secondary-chip,
.dock-btn {
  border: none;
  font: inherit;
  -webkit-app-region: no-drag;
}

.close-btn,
.ghost-btn,
.primary-btn,
.secondary-chip,
.dock-btn {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, opacity 0.18s ease;
}

.close-btn:hover,
.ghost-btn:hover:not(:disabled),
.primary-btn:hover:not(:disabled),
.secondary-chip:hover:not(:disabled),
.dock-btn:hover:not(:disabled),
.option-card:hover {
  transform: translateY(-1px);
}

.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  color: #7f9bc8;
  box-shadow: 0 8px 18px rgba(94, 129, 188, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet-body {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: auto;
}

.assistant-section {
  border-radius: 24px;
  overflow: hidden;
}

.assistant-section.focus {
  border-color: rgba(96, 136, 210, 0.28);
  box-shadow: 0 20px 36px rgba(67, 106, 179, 0.14);
}

.module-list {
  display: grid;
  gap: 10px;
}

.module-panel {
  border-radius: 20px;
  border: 1px solid rgba(118, 151, 206, 0.14);
  background: rgba(248, 251, 255, 0.96);
  overflow: hidden;
}

.module-panel.expanded {
  border-color: rgba(96, 136, 210, 0.26);
  box-shadow: 0 16px 28px rgba(82, 117, 180, 0.1);
}

.module-bar {
  width: 100%;
  border: none;
  font: inherit;
  -webkit-app-region: no-drag;
  padding: 14px 16px;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}

.module-index {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #5f95ff 0%, #4378dc 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.module-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.module-copy strong {
  font-size: 17px;
  color: #283853;
}

.module-copy span {
  color: #63758f;
  font-size: 13px;
  line-height: 1.5;
}

.module-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.module-count,
.module-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.module-count {
  background: rgba(91, 136, 216, 0.08);
  color: #4f6ea4;
}

.module-toggle {
  background: rgba(255, 255, 255, 0.96);
  color: #5b7fbe;
  border: 1px solid rgba(96, 136, 210, 0.18);
}

.module-body {
  display: grid;
  gap: 12px;
  padding: 0 16px 16px;
}

.module-empty {
  display: grid;
  gap: 10px;
  padding-top: 2px;
}

.module-empty p {
  margin: 0;
  color: #63758f;
  line-height: 1.6;
}

.record-draft-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.record-draft-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(92, 148, 231, 0.12);
  color: #3c68b7;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.record-draft-grid {
  display: grid;
  gap: 10px;
}

.record-draft-item {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(243, 247, 255, 0.98);
  border: 1px solid rgba(118, 151, 206, 0.14);
}

.record-draft-item span {
  color: #6d7e99;
  font-size: 12px;
  font-weight: 700;
}

.record-draft-item strong {
  color: #233655;
  font-size: 16px;
  line-height: 1.6;
}

.section-bar {
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.section-index {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #5f95ff 0%, #4378dc 100%);
  color: #fff;
  font-size: 14px;
}

.section-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.section-copy strong {
  font-size: 18px;
  color: #283853;
}

.section-copy span,
.source-line,
.detail-item,
.empty-copy,
.timeline-main p,
.recommendation-head p,
.info-item span {
  color: #63758f;
}

.section-copy span,
.source-line,
.empty-copy,
.timeline-main p,
.recommendation-head p,
.info-item span {
  font-size: 13px;
  line-height: 1.5;
}

.section-toggle {
  padding: 7px 12px;
  background: rgba(91, 136, 216, 0.08);
  color: #5b7fbe;
  font-size: 12px;
  flex-shrink: 0;
}

.section-body {
  padding: 0 16px 16px;
  display: grid;
  gap: 10px;
}

.info-item {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(245, 248, 253, 0.96);
  border: 1px solid rgba(118, 151, 206, 0.12);
}

.info-item strong {
  display: block;
  margin-top: 6px;
  color: #21344f;
  font-size: 15px;
  line-height: 1.55;
}

.assistant-notice,
.assistant-error {
  padding: 11px 12px;
  border-radius: 16px;
  font-size: 13px;
}

.assistant-notice {
  background: rgba(84, 132, 216, 0.08);
  color: #4c6ca6;
}

.assistant-error {
  background: rgba(220, 76, 76, 0.08);
  color: #b33f3f;
}

.recommendation-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.recommendation-head h3 {
  font-size: 20px;
  line-height: 1.25;
}

.recommendation-head p,
.timeline-main p,
.empty-copy {
  margin: 6px 0 0;
}

.status-pill,
.mini-status {
  padding: 7px 11px;
  font-size: 12px;
}

.status-pill.default,
.mini-status.default {
  background: rgba(228, 233, 241, 0.96);
  color: #65738d;
}

.status-pill.accent,
.mini-status.accent {
  background: rgba(212, 231, 255, 0.96);
  color: #3c68b2;
}

.status-pill.warn,
.mini-status.warn {
  background: rgba(255, 236, 206, 0.96);
  color: #aa7020;
}

.source-line {
  margin: 0;
}

.detail-list,
.option-list,
.timeline-list,
.secondary-rail {
  display: grid;
  gap: 8px;
}

.candidate-block {
  display: grid;
  gap: 8px;
}

.diagnosis-option-group-list {
  display: grid;
  gap: 10px;
}

.diagnosis-option-group {
  display: grid;
  gap: 8px;
}

.diagnosis-option-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(233, 241, 255, 0.98), rgba(242, 247, 255, 0.96));
  border: 1px solid rgba(118, 151, 206, 0.12);
  color: #3c68b2;
}

.diagnosis-option-group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.diagnosis-option-group-title-row strong {
  font-size: 14px;
}

.diagnosis-option-group-header span {
  font-size: 12px;
  font-weight: 700;
}

.diagnosis-option-group-range {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(84, 132, 216, 0.12);
  color: #4b6da7;
  font-size: 11px;
  font-weight: 700;
}

.candidate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(233, 241, 255, 0.9);
  color: #3c68b2;
}

.candidate-header strong {
  font-size: 14px;
}

.candidate-header span,
.candidate-empty {
  font-size: 12px;
  line-height: 1.5;
}

.candidate-empty {
  padding: 11px 12px;
  border-radius: 16px;
  background: rgba(255, 241, 219, 0.9);
  color: #a06b1e;
}

.detail-item {
  padding: 11px 12px;
  border-radius: 16px;
  background: rgba(245, 248, 253, 0.96);
  border: 1px solid rgba(118, 151, 206, 0.1);
  line-height: 1.55;
}

.option-card {
  padding: 12px 14px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(118, 151, 206, 0.16);
  text-align: left;
}

.option-card.selected {
  border-color: rgba(88, 132, 216, 0.42);
  background: rgba(236, 244, 255, 0.94);
  box-shadow: 0 12px 22px rgba(76, 108, 166, 0.12);
}

.option-list.prominent .option-card {
  border-width: 2px;
}

.option-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.option-title-row strong,
.timeline-main strong {
  color: #24344f;
}

.selected-flag,
.option-meta,
.option-caption {
  color: #3d68b2;
  font-size: 12px;
  font-weight: 700;
}

.option-caption {
  margin-top: 6px;
}

.option-caption.matched {
  color: #2f6e56;
}

.option-meta {
  margin-top: 6px;
}

.option-card p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #62758f;
}

.inline-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.secondary-rail {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.secondary-chip {
  min-height: 42px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(240, 245, 253, 0.96);
  color: #4f6ea4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.secondary-chip:disabled,
.dock-btn:disabled,
.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.timeline-item {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(246, 249, 253, 0.98);
  border: 1px solid rgba(118, 151, 206, 0.12);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.timeline-main {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.timeline-badge {
  width: fit-content;
  padding: 5px 10px;
  background: rgba(89, 133, 216, 0.1);
  color: #4a6ca8;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.timeline-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  color: #7e8ba5;
  font-size: 12px;
}

.action-dock {
  padding: 10px;
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(252, 253, 255, 0.98) 0%, rgba(241, 246, 253, 0.98) 100%);
  display: grid;
  gap: 10px;
  position: sticky;
  bottom: 0;
  z-index: 3;
}

.action-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.dock-status {
  min-width: 0;
  min-height: 46px;
  padding: 9px 12px;
  border-radius: 16px;
  background: rgba(241, 246, 255, 0.94);
  border: 1px solid rgba(118, 151, 206, 0.12);
  display: grid;
  gap: 2px;
}

.dock-status span {
  font-size: 11px;
  color: #6e7f9b;
}

.dock-status strong {
  min-width: 0;
  font-size: 14px;
  color: #2b4470;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.function-launcher {
  border: none;
  font: inherit;
  -webkit-app-region: no-drag;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 16px;
  background: rgba(226, 236, 252, 0.96);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: #36598f;
}

.function-launcher span {
  font-size: 13px;
  font-weight: 700;
}

.function-popover {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 18px;
  background: rgba(238, 244, 253, 0.94);
  border: 1px solid rgba(118, 151, 206, 0.14);
}

.function-chip-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.popover-summary {
  min-width: 0;
  color: #647694;
  font-size: 12px;
  line-height: 1.45;
}

.dock-writeback {
  min-width: 112px;
}

.ghost-btn.compact {
  min-height: 40px;
  padding: 10px 12px;
  white-space: nowrap;
}

.dock-grid.compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dock-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.dock-btn {
  min-height: 52px;
  padding: 10px 8px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(232, 241, 255, 0.96) 0%, rgba(220, 233, 252, 0.96) 100%);
  color: #325ea8;
  display: grid;
  place-items: center;
  gap: 6px;
  box-shadow: inset 0 0 0 1px rgba(113, 150, 216, 0.12);
}

.dock-btn span {
  font-weight: 700;
}

.ghost-btn,
.primary-btn {
  min-height: 44px;
  padding: 11px 14px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
}

.ghost-btn {
  background: rgba(231, 238, 248, 0.94);
  color: #45648f;
}

.primary-btn {
  background: linear-gradient(135deg, #4d82e0 0%, #2f5fb2 100%);
  color: #fff;
  box-shadow: 0 12px 22px rgba(60, 104, 178, 0.24);
}

.primary-btn.small {
  box-shadow: none;
}

.empty-state {
  height: 100%;
  border-radius: 28px;
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
}

.empty-state p {
  margin: 0;
  color: #64758e;
  line-height: 1.6;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 420px) {
  .session-panel {
    padding: 10px;
  }

  .sheet-header {
    padding-left: 78px;
  }

  .headline-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .recommendation-head,
  .timeline-item {
    flex-direction: column;
  }

  .timeline-side {
    justify-items: start;
  }

  .secondary-rail,
  .dock-grid,
  .function-chip-row {
    grid-template-columns: 1fr;
  }

  .action-strip {
    grid-template-columns: 1fr;
  }

  .popover-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .primary-btn,
  .function-launcher,
  .ghost-btn.compact {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }
}
</style>
