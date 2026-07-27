<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { trackClick } from '@services/operationTracker';
import { resolvePatientAvatar, PATIENT_AVATAR_FALLBACK } from '@/utils/patientAvatar';
import { getPatientContextVisitId } from '@/utils/patientContext';
import type { AppPatient } from '@/types/appState';
import type { HisOutpatientFollowUpContext, HisVisitRecord } from '@/services/his/types';
import type { PatientMemoryBrief } from '@entities/patient-memory';
import type { PatientMemorySyncStatus } from '@features/patient-memory';
import type { ChronicRefillCandidate, RiskItem } from '@features/reception-risk';
import type { TreatmentPlanInitialDraft } from '@features/treatment-plan';
import {
  buildReceptionChronicRefillPresentation,
} from '../lib/receptionChronicRefillPresentation';
import ReceptionChronicRefillSection from './ReceptionChronicRefillSection.vue';
import {
  buildChronicDiseaseSummary,
  ChronicAiRecommendationPanel,
  getPrimaryManagedDisease,
  getPublishedClinicalPath,
  isChronicFollowUpEligible,
  useChronicAiRecommendations,
  type ChronicDiseasePatientSummary,
  type ChronicDiseaseType,
  type ChronicDiseaseWindowKind,
  type ChronicMetricKind,
} from '@features/chronic-disease';
import ChronicTrendChart from '@features/chronic-disease/ui/ChronicTrendChart.vue';

const props = defineProps<{
  patient?: AppPatient | null;
  patientName: string;
  gender: 'M' | 'F';
  age: number;
  risks: RiskItem[];
  expanded: boolean;
  analyzing?: boolean;
  chronicRefillCandidate?: ChronicRefillCandidate | null;
  chronicRefillGenerating?: boolean;
  outpatientFollowUpContext?: HisOutpatientFollowUpContext | null;
  reportInterpretationVisits?: HisVisitRecord[];
  reportAssistantOpening?: boolean;
  patientMemoryStatus?: PatientMemorySyncStatus;
  patientMemoryBrief?: PatientMemoryBrief | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'toggle-expand', expanded: boolean): void;
  (event: 'confirm-chronic-refill'): void;
  (event: 'confirm-report-assistant'): void;
  (event: 'open-patient-memory'): void;
  (event: 'open-chronic-treatment-plan', value: TreatmentPlanInitialDraft): void;
  (
    event: 'open-chronic-disease',
    value: {
      kind: ChronicDiseaseWindowKind;
      summary: ChronicDiseasePatientSummary;
      diseaseType?: ChronicDiseaseType;
    },
  ): void;
}>();

const detailExpanded = computed(() => props.expanded);
const openSection = ref(4);
const metric = ref<ChronicMetricKind>('blood-glucose');

const summary = computed(() => buildChronicDiseaseSummary({
  patient: props.patient,
  patientMemoryBrief: props.patientMemoryBrief,
}));
const patientAnchorId = computed(() => getPatientContextVisitId(props.patient));
const chronicAiRecommendations = useChronicAiRecommendations({
  summary,
  patientAnchorId,
});

const avatarSrc = ref(resolvePatientAvatar({ gender: props.gender, age: props.age }));
watch(
  () => [props.gender, props.age] as const,
  ([gender, age]) => {
    avatarSrc.value = resolvePatientAvatar({ gender, age });
  },
);

const historicalReportCount = computed(() => (props.reportInterpretationVisits || [])
  .reduce((total, visit) => total + (visit.reportedApplications?.length || 0), 0));
const followUpReportCount = computed(() => (
  (props.outpatientFollowUpContext?.labReports?.length || 0)
  + (props.outpatientFollowUpContext?.examReports?.length || 0)
));
const reportCount = computed(() => historicalReportCount.value + followUpReportCount.value);
const hasReportAssistant = computed(() => Boolean(
  props.outpatientFollowUpContext || historicalReportCount.value > 0,
));
const reportAssistantTitle = computed(() => (
  props.outpatientFollowUpContext ? '报告回诊' : '报告解读'
));
const reportAssistantSubtitle = computed(() => (
  props.outpatientFollowUpContext
    ? '本次报告已出 · 可生成后续方案'
    : `近 14 天 ${reportCount.value} 份已出报告`
));
const chronicRefillPresentation = computed(() => (
  buildReceptionChronicRefillPresentation(
    props.chronicRefillCandidate,
    props.chronicRefillGenerating,
  )
));
const hasPatientPortraitDetail = computed(() => (
  props.patientMemoryStatus === 'ready' && Boolean(props.patientMemoryBrief)
));

const primaryFollowUpDisease = computed<ChronicDiseaseType | undefined>(() => (
  getPrimaryManagedDisease(summary.value)
));

const versionLabel = computed(() => {
  const disease = primaryFollowUpDisease.value;
  return disease ? getPublishedClinicalPath(disease).pathVersion : '规则 v2026.1';
});

const latestDataLabel = computed(() => {
  if (!summary.value.latestDataAt) return '待核实';
  const date = new Date(summary.value.latestDataAt);
  if (Number.isNaN(date.getTime())) return '待核实';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
});

function pathEvidenceStats(diseaseType: ChronicDiseaseType): {
  supported: number;
  total: number;
  verify: number;
} {
  const path = getPublishedClinicalPath(diseaseType);
  const hasMeasurement = diseaseType === 'hypertension'
    ? summary.value.bloodPressurePoints.length > 0
    : summary.value.bloodGlucosePoints.length > 0;
  const supported = Number(hasMeasurement) + Number(summary.value.recentMedicationNames.length > 0);
  return {
    supported,
    total: path.nodes.length,
    verify: path.nodes.length - supported,
  };
}

function onAvatarError(): void {
  if (avatarSrc.value !== PATIENT_AVATAR_FALLBACK) avatarSrc.value = PATIENT_AVATAR_FALLBACK;
}

function expandDetail(): void {
  if (detailExpanded.value) return;
  trackClick('reception_chronic_plugin_expand', {
    chronicManaged: summary.value.isChronicManaged,
    diseases: summary.value.diseaseTags.map((item) => item.diseaseType),
  });
  emit('toggle-expand', true);
}

function collapseDetail(): void {
  trackClick('reception_chronic_plugin_collapse');
  emit('toggle-expand', false);
}

function close(): void {
  if (detailExpanded.value) {
    collapseDetail();
    return;
  }
  trackClick('reception_close');
  emit('close');
}

function handleCapsuleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  expandDetail();
}

function toggleSection(index: number): void {
  const nextSection = openSection.value === index ? 0 : index;
  openSection.value = nextSection;
  if (nextSection === 2) void chronicAiRecommendations.load();
}

async function addAiRecommendationsToDraft(): Promise<void> {
  try {
    const draft = await chronicAiRecommendations.prepareDraft(crypto.randomUUID());
    trackClick('reception_chronic_treatment_plan_open', {
      itemCount: draft.items.length,
      patientAnchorId: draft.patientAnchorId,
    });
    emit('open-chronic-treatment-plan', draft);
  } catch (error) {
    console.warn('[ReceptionCapsule] Failed to prepare chronic treatment plan', error);
  }
}

function confirmChronicRefill(): void {
  trackClick('reception_chronic_refill_confirm', {
    diagnosis: props.chronicRefillCandidate?.diagnosis,
    medicationCount: props.chronicRefillCandidate?.medications.length,
  });
  emit('confirm-chronic-refill');
}

function confirmReportAssistant(): void {
  trackClick('reception_report_assistant_confirm', {
    sourceVisitId: props.outpatientFollowUpContext?.source?.visitId,
    reportCount: reportCount.value,
  });
  emit('confirm-report-assistant');
}

function openPatientMemory(): void {
  trackClick('reception_patient_memory_open', {
    memoryVersion: props.patientMemoryBrief?.memoryVersion,
  });
  emit('open-patient-memory');
}

function openWindow(kind: ChronicDiseaseWindowKind, diseaseType?: ChronicDiseaseType): void {
  if (kind === 'follow-up' && !isChronicFollowUpEligible(summary.value, diseaseType)) return;
  trackClick(`reception_chronic_${kind}_open`, { diseaseType });
  emit('open-chronic-disease', {
    kind,
    summary: summary.value,
    diseaseType,
  });
}
</script>

<template>
  <div class="reception-root" :class="{ expanded: detailExpanded }" data-tauri-drag-region>
    <template v-if="!detailExpanded">
      <button
        type="button"
        class="patient-capsule"
        :aria-label="`当前患者 ${patientName}，双击或按回车展开慢病插件`"
        title="双击展开慢病插件"
        @dblclick="expandDetail"
        @keydown="handleCapsuleKeydown"
      >
        <img
          class="capsule-robot"
          src="/assets/chronic-disease/medical-ai-robot.png"
          alt=""
          draggable="false"
        />
        <span class="capsule-copy">
          <strong>{{ patientName }}</strong>
          <small>{{ gender === 'F' ? '女' : '男' }} · {{ age }}岁</small>
        </span>
        <span v-if="analyzing" class="capsule-status analyzing">
          <Icon icon="lucide:loader-circle" size="13" />评估中
        </span>
        <span v-else-if="summary.hasSupportedDisease" class="capsule-dot" aria-label="已识别两慢病患者" />
        <span v-else class="capsule-status">普通接诊</span>
      </button>
      <button type="button" class="compact-close" aria-label="关闭接诊胶囊" @click="close">
        <Icon icon="lucide:x" size="13" />
      </button>
    </template>

    <aside v-else class="plugin-panel" aria-label="慢病助手详情">
      <header class="plugin-patient-header">
        <div class="patient-main-row">
          <img class="patient-avatar" :src="avatarSrc" alt="" draggable="false" @error="onAvatarError" />
          <div class="patient-summary">
            <div class="patient-primary">
              <div class="patient-title">
                <strong>{{ patientName }}</strong>
                <span>{{ gender === 'F' ? '女' : '男' }}</span>
                <span>{{ age }}岁</span>
              </div>
              <span v-if="summary.hasSupportedDisease" class="header-tag">接诊中</span>
              <span v-if="summary.isChronicManaged" class="due-tag">
                <Icon icon="lucide:clock-alert" size="13" />慢病管理
              </span>
              <span v-else-if="summary.hasSupportedDisease" class="neutral-tag">公卫待核实</span>
              <span v-else class="neutral-tag">普通接诊</span>
            </div>
            <div class="public-health-row">
              <Icon
                :icon="summary.contractSource === 'public-health' ? 'lucide:circle-check' : 'lucide:info'"
                size="16"
              />
              <span class="contract-label">{{ summary.contractLabel }}</span>
              <span
                v-for="tag in summary.diseaseTags"
                :key="tag.diseaseType"
                class="health-status"
                :class="tag.source"
                :title="`${tag.label} · ${tag.sourceLabel}`"
              >
                {{ tag.source === 'public-health' ? tag.label : `${tag.label} · 临床识别` }}
              </span>
              <span v-if="summary.diseaseTags.length === 0" class="health-empty">未识别两慢病管理标签</span>
            </div>
          </div>
        </div>
        <button type="button" class="close-panel" aria-label="收起慢病插件" title="收起" @click="close">
          <Icon icon="lucide:x" size="21" />
        </button>
        <img
          src="/assets/chronic-disease/medical-ai-robot.png"
          alt=""
          class="panel-robot"
          draggable="false"
        />
      </header>

      <div class="plugin-body-card">
        <div class="panel-scroll">
        <section class="accordion-section" :class="{ open: openSection === 1 }">
          <button type="button" class="accordion-trigger" :aria-expanded="openSection === 1" @click="toggleSection(1)">
            <span class="section-number">1</span>
            <span class="section-copy">
              <span class="section-title">就诊历史信息</span>
              <span class="section-summary">上次就诊：{{ summary.lastVisitLabel }} · {{ summary.diagnosisText }}</span>
            </span>
            <Icon :icon="openSection === 1 ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="19" />
          </button>
          <div v-if="openSection === 1" class="accordion-content">
            <div class="visit-meta">
              <span><b>最近就诊</b>{{ summary.lastVisitLabel }}</span>
              <span><b>诊断</b>{{ summary.diagnosisText }}</span>
            </div>
            <div class="segmented" role="tablist" aria-label="慢病趋势类型">
              <button type="button" :class="{ active: metric === 'blood-glucose' }" @click="metric = 'blood-glucose'">血糖曲线</button>
              <button type="button" :class="{ active: metric === 'blood-pressure' }" @click="metric = 'blood-pressure'">血压曲线</button>
            </div>
            <ChronicTrendChart
              :metric="metric"
              :blood-pressure-points="summary.bloodPressurePoints"
              :blood-glucose-points="summary.bloodGlucosePoints"
            />
            <button v-if="hasPatientPortraitDetail" type="button" class="text-action" @click="openPatientMemory">
              查看完整患者健康画像 <Icon icon="lucide:chevron-right" size="13" />
            </button>
          </div>
        </section>

        <section class="accordion-section" :class="{ open: openSection === 2 }">
          <button type="button" class="accordion-trigger" :aria-expanded="openSection === 2" @click="toggleSection(2)">
            <span class="section-number">2</span>
            <span class="section-copy">
              <span class="section-title">AI 推荐</span>
              <span class="section-summary">{{ chronicAiRecommendations.summaryText.value }}</span>
            </span>
            <Icon :icon="openSection === 2 ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="19" />
          </button>
          <div v-if="openSection === 2" class="accordion-content">
            <ChronicAiRecommendationPanel
              :eligible="summary.hasSupportedDisease"
              :items="chronicAiRecommendations.items.value"
              :selected-ids="chronicAiRecommendations.selectedIds.value"
              :loading="chronicAiRecommendations.loading.value"
              :loaded="chronicAiRecommendations.loaded.value"
              :error="chronicAiRecommendations.error.value"
              :preparing="chronicAiRecommendations.preparing.value"
              :prepare-error="chronicAiRecommendations.prepareError.value"
              @retry="chronicAiRecommendations.load(true)"
              @toggle="chronicAiRecommendations.toggleSelection"
              @submit="addAiRecommendationsToDraft"
            />

            <div v-if="risks.length > 0" class="existing-group">
              <strong>接诊风险</strong>
              <div v-for="risk in risks" :key="`${risk.category}-${risk.content}`" class="risk-row">
                <span>{{ risk.category }}</span>{{ risk.content }}
              </div>
            </div>

            <div v-if="hasReportAssistant" class="existing-actions">
              <button
                type="button"
                :disabled="reportAssistantOpening"
                @click="confirmReportAssistant"
              >
                <Icon :icon="reportAssistantOpening ? 'lucide:loader-circle' : 'lucide:file-search'" size="16" />
                <span><strong>{{ reportAssistantTitle }}</strong><small>{{ reportAssistantSubtitle }}</small></span>
                <Icon icon="lucide:chevron-right" size="15" />
              </button>
            </div>
          </div>
        </section>

        <section class="accordion-section refill-section" :class="{ open: openSection === 3 }">
          <button type="button" class="accordion-trigger" :aria-expanded="openSection === 3" @click="toggleSection(3)">
            <span class="section-number">3</span>
            <span class="section-copy">
              <span class="section-title">慢病复诊配药</span>
              <span class="section-summary">{{ chronicRefillPresentation.sectionSummary }}</span>
            </span>
            <Icon :icon="openSection === 3 ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="19" />
          </button>
          <div v-if="openSection === 3" class="accordion-content">
            <ReceptionChronicRefillSection
              :presentation="chronicRefillPresentation"
              :generating="chronicRefillGenerating"
              @confirm="confirmChronicRefill"
            />
          </div>
        </section>

        <section class="accordion-section clinical-section" :class="{ open: openSection === 4 }">
          <button type="button" class="accordion-trigger" :aria-expanded="openSection === 4" @click="toggleSection(4)">
            <span class="section-number">4</span>
            <span class="section-copy">
              <span class="section-title">临床诊疗建议</span>
            </span>
            <Icon :icon="openSection === 4 ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="19" />
          </button>
          <div v-if="openSection === 4" class="accordion-content">
            <div v-if="summary.hasSupportedDisease" class="pathway-summary">
              <button
                v-for="tag in summary.diseaseTags"
                :key="tag.diseaseType"
                type="button"
                class="pathway-card"
                @click="openWindow('path', tag.diseaseType)"
              >
                <span class="pathway-icon" :class="tag.diseaseType">
                  <Icon :icon="tag.diseaseType === 'hypertension' ? 'mdi:heart-pulse' : 'mdi:water-plus-outline'" size="23" />
                </span>
                <span class="pathway-copy">
                  <span class="pathway-title">
                    <b>{{ tag.diseaseType === 'hypertension' ? '高血压管理路径' : '糖尿病管理路径' }}</b>
                    <small>已发布</small>
                    <small class="verify-pill">待核实 {{ pathEvidenceStats(tag.diseaseType).verify }}</small>
                  </span>
                  <span>
                    已有证据 {{ pathEvidenceStats(tag.diseaseType).supported }}/{{ pathEvidenceStats(tag.diseaseType).total }} 个节点
                    · 点击查看交互节点
                  </span>
                </span>
                <Icon icon="lucide:chevron-right" size="21" />
              </button>
              <div class="ai-boundary"><Icon icon="lucide:info" size="16" />AI 仅解释已发布路径，不修改规则</div>
            </div>
            <div v-else class="empty-section">当前患者没有可用的两慢病诊疗路径。</div>
          </div>
        </section>
      </div>

        <footer class="plugin-footer">
          <div class="panel-actions">
            <button
              type="button"
              class="action-button followup"
              :disabled="!summary.isChronicManaged"
              :title="summary.isChronicManaged ? '打开慢病随访' : summary.hasSupportedDisease ? '临床已识别，公卫管理身份待核实' : '未识别为两慢病对象'"
              @click="openWindow('follow-up')"
            >
              <Icon icon="lucide:calendar-check" size="18" />慢病随访
            </button>
            <button
              type="button"
              class="action-button prescription"
              :disabled="!summary.hasSupportedDisease"
              :title="summary.hasSupportedDisease ? '打开健康处方' : '未识别为高血压或 2 型糖尿病对象'"
              @click="openWindow('prescription')"
            >
              <Icon icon="lucide:clipboard-plus" size="18" />健康处方
            </button>
            <button
              type="button"
              class="action-button assessment"
              :disabled="!summary.hasSupportedDisease"
              :title="summary.hasSupportedDisease ? '打开年度评估' : '未识别为高血压或 2 型糖尿病对象'"
              @click="openWindow('assessment')"
            >
              <Icon icon="lucide:chart-no-axes-combined" size="18" />年度评估
            </button>
          </div>
          <div class="version-row">
            <span>数据截至 {{ latestDataLabel }}</span>
            <span aria-hidden="true">·</span>
            <span>路径 {{ versionLabel }}</span>
          </div>
        </footer>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.reception-root {
  position: absolute;
  inset: 1px;
  overflow: visible;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

button:focus-visible, input:focus-visible {
  outline: 3px solid rgba(43, 127, 227, 0.24);
  outline-offset: 2px;
}

.patient-capsule {
  position: absolute;
  inset: 1px;
  padding: 6px 34px 6px 7px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e293b;
  text-align: left;
  background: rgba(255, 253, 248, 0.98);
  border: 1px solid #fdba74;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.13);
  -webkit-app-region: no-drag;
}
.capsule-robot { width: 50px; height: 50px; flex: none; object-fit: contain; }
.capsule-copy { min-width: 0; display: grid; gap: 2px; }
.capsule-copy strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.capsule-copy small { color: #64748b; font-size: 11px; }
.capsule-dot { width: 8px; height: 8px; margin-left: auto; flex: none; background: #f97316; border-radius: 50%; box-shadow: 0 0 0 4px #fff7ed; }
.capsule-status { margin-left: auto; color: #64748b; font-size: 9px; white-space: nowrap; }
.capsule-status.analyzing { display: inline-flex; align-items: center; gap: 3px; color: #2b7fe3; }
.compact-close {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 22px;
  height: 22px;
  z-index: 2;
  display: grid;
  place-items: center;
  color: #94a3b8;
  background: rgba(248, 250, 252, 0.92);
  border: 0;
  border-radius: 50%;
  -webkit-app-region: no-drag;
}

.plugin-panel {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 116px minmax(0, 1fr);
  padding: 0 14px 18px;
  overflow: hidden;
  color: #1e293b;
  background:
    radial-gradient(circle at 91% 8%, rgba(255, 237, 213, .55), transparent 23%),
    #fffdfa;
  border: 1px solid #fdba74;
  border-radius: 24px;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.16);
}
.plugin-patient-header {
  min-width: 0;
  padding: 17px 39px 8px 8px;
  position: relative;
}
.patient-main-row { min-width: 0; display: flex; align-items: flex-start; gap: 10px; }
.patient-avatar { width: 45px; height: 45px; flex: none; object-fit: cover; border: 3px solid #eff6ff; border-radius: 50%; }
.patient-summary { min-width: 0; padding-top: 4px; display: grid; gap: 13px; }
.patient-primary { min-width: 0; display: flex; align-items: center; gap: 7px; }
.patient-title { min-width: 0; display: flex; align-items: baseline; gap: 5px; }
.patient-title strong { max-width: 92px; overflow: hidden; color: #0f172a; font-size: 19px; text-overflow: ellipsis; white-space: nowrap; }
.patient-title span { color: #64748b; font-size: 12px; white-space: nowrap; }
.header-tag, .due-tag, .neutral-tag { flex: none; padding: 4px 6px; border-radius: 5px; font-size: 9px; white-space: nowrap; }
.header-tag { color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; }
.due-tag { display: inline-flex; align-items: center; gap: 3px; color: #c2410c; background: #fff7ed; border: 1px solid #fed7aa; }
.neutral-tag { color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; }
.close-panel { position: absolute; top: 13px; right: 4px; width: 34px; height: 34px; z-index: 5; display: grid; place-items: center; color: #94a3b8; background: rgba(241,245,249,.92); border: 0; border-radius: 50%; -webkit-app-region: no-drag; }

.public-health-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.public-health-row > svg { flex: none; color: #10b981; }
.contract-label, .health-status { display: inline-flex; align-items: center; }
.health-status::before { margin-right: 6px; color: #94a3b8; content: "·"; }
.health-status.clinical { color: #64748b; font-weight: 500; }
.health-empty { color: #94a3b8; }
.panel-robot { position: absolute; right: 4px; bottom: -3px; width: 72px; height: 72px; z-index: 4; object-fit: contain; pointer-events: none; }

.plugin-body-card {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  background: rgba(255,255,255,.98);
  border: 1px solid #e5eaf1;
  border-radius: 14px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, .035);
}
.panel-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; background: transparent; }
.panel-scroll::-webkit-scrollbar { width: 5px; }
.panel-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.accordion-section { margin: 0 12px; border-bottom: 1px solid #eef2f6; }
.accordion-section:last-child { border-bottom: 0; }
.accordion-trigger {
  width: 100%;
  min-height: 72px;
  padding: 14px 0;
  display: grid;
  grid-template-columns: 31px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 10px;
  color: #1e293b;
  text-align: left;
  background: transparent;
  border: 0;
  -webkit-app-region: no-drag;
}
.clinical-section .accordion-trigger { min-height: 44px; }
.accordion-trigger:hover { background: #fbfdff; }
.section-number { width: 28px; height: 28px; display: grid; place-items: center; color: #fff; background: #2b7fe3; border-radius: 50%; box-shadow: 0 2px 6px rgba(43,127,227,.18); font-size: 13px; font-weight: 700; }
.accordion-trigger > svg { color: #64748b; }
.section-copy { min-width: 0; display: grid; gap: 7px; }
.section-title { font-size: 15px; font-weight: 700; }
.section-summary { overflow: hidden; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.accordion-content { padding: 0 0 16px 41px; background: transparent; }
.refill-section .accordion-content, .clinical-section .accordion-content { padding-left: 0; }
.visit-meta { padding: 0 3px 9px; display: grid; gap: 5px; color: #475569; font-size: 10px; }
.visit-meta b { margin-right: 5px; color: #64748b; }
.segmented { display: flex; border-bottom: 1px solid #e2e8f0; }
.segmented button { flex: 1; padding: 8px 10px; color: #64748b; background: #fff; border: 0; border-bottom: 2px solid transparent; font-size: 11px; }
.segmented button.active { color: #2b7fe3; border-bottom-color: #2b7fe3; font-weight: 700; }
.text-action { margin-top: 6px; padding: 0; display: inline-flex; align-items: center; gap: 3px; color: #2b7fe3; background: transparent; border: 0; font-size: 10px; }
.empty-section { padding: 14px 8px; color: #64748b; background: #f8fafc; border-radius: 6px; font-size: 11px; line-height: 1.6; }
.existing-group { margin-top: 14px; }
.existing-group > strong { color: #475569; font-size: 10px; }
.risk-row { margin-top: 6px; padding: 7px; color: #475569; background: #fff7ed; border-radius: 5px; font-size: 9px; line-height: 1.5; }
.risk-row span { margin-right: 5px; color: #c2410c; font-weight: 700; }
.existing-actions { margin-top: 12px; display: grid; gap: 7px; }
.existing-actions button { width: 100%; padding: 8px 9px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 7px; color: #1e293b; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
.existing-actions button > span { display: grid; gap: 2px; }
.existing-actions strong { font-size: 10px; }
.existing-actions small { color: #64748b; font-size: 8px; }
.pathway-summary { display: grid; gap: 15px; }
.pathway-card { width: 100%; min-height: 76px; padding: 10px; display: grid; grid-template-columns: 42px minmax(0, 1fr) 20px; align-items: center; gap: 9px; color: #1e293b; text-align: left; background: linear-gradient(135deg, #fbfaff, #f7f5ff); border: 1px solid #ddd6fe; border-radius: 10px; }
.pathway-card:hover { border-color: #a78bfa; box-shadow: 0 0 0 2px rgba(139,92,246,.08); }
.pathway-icon { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid #e4ddff; border-radius: 50%; }
.pathway-icon.hypertension, .pathway-icon.type2_diabetes { color: #6d3bd1; background: #f6f2ff; }
.pathway-copy { min-width: 0; display: grid; gap: 6px; }
.pathway-title { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; color: #1e293b; }
.pathway-title b { font-size: 12px; }
.pathway-title small { padding: 2px 5px; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; font-size: 8px; font-weight: 500; }
.pathway-title small.verify-pill { color: #c2410c; background: #fff7ed; border-color: #fed7aa; }
.pathway-copy > span:last-child { overflow: hidden; color: #64748b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.pathway-card > svg { color: #7c3aed; }
.ai-boundary { padding: 9px 3px 0; display: flex; align-items: center; gap: 5px; color: #64748b; font-size: 10px; }

.plugin-footer { min-height: 97px; padding: 18px 14px 10px; background: rgba(255,255,255,.98); border-top: 1px solid #eef2f6; box-sizing: border-box; }
.panel-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.action-button { min-height: 40px; padding: 7px 4px; display: flex; align-items: center; justify-content: center; gap: 5px; border-radius: 7px; font-size: 11px; font-weight: 650; }
.action-button.followup { color: #fff; background: #f97316; border: 1px solid #f97316; }
.action-button.followup:disabled { color: #94a3b8; background: #e2e8f0; border-color: #e2e8f0; cursor: not-allowed; }
.action-button.prescription { color: #fff; background: #2b7fe3; border: 1px solid #2b7fe3; }
.action-button.assessment { color: #2b7fe3; background: #fff; border: 1px solid #93c5fd; }
.action-button.prescription:disabled, .action-button.assessment:disabled { color: #94a3b8; background: #f8fafc; border-color: #cbd5e1; cursor: not-allowed; }
.version-row { margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 7px; color: #94a3b8; font-size: 9px; }

@media (prefers-reduced-motion: no-preference) {
  .plugin-panel { animation: panel-in .18s ease-out; }
  @keyframes panel-in { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: scale(1); } }
}
</style>
