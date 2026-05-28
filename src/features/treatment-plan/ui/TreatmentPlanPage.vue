<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { PatientHeader } from '@entities/patient';
import Icon from '@shared/ui/Icon.vue';
import type { AppPatient } from '@/types/appState';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { getHisAdapter } from '@/services/his';
import { medicalDataService } from '@/services/medicalData';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import {
  useBodySiteOptions,
  useManualMatchState,
  useMedicalDictionaries,
  useTreatmentGates,
  useTreatmentHydration,
  useTreatmentNormalization,
  useTreatmentPharmacyResolution,
  useTreatmentSelectionReadiness,
  type ManualMatchCandidate,
} from '@features/consultation-result';
import {
  applyManualMatchCandidate,
  findManualMatchCandidates,
  hasProbableMatch,
  toManualMatchCandidateView,
  type ManualMatchRawCandidate,
} from '@features/clinical-result';
import {
  useTreatmentPlanRecommendations,
} from '../model/useTreatmentPlanRecommendations';
import {
  useTreatmentPlanWriteback,
} from '../model/useTreatmentPlanWriteback';
import TreatmentPlanGroup from './TreatmentPlanGroup.vue';

const props = defineProps<{
  patient?: AppPatient | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const showToast = inject<((msg: string, type?: 'success' | 'error' | 'info') => void)>('showToast');

const currentDiagnosis = ref<Diagnosis | null>(null);
const treatments = ref<TreatmentRecommendation[]>([]);

const dictionaries = useMedicalDictionaries();
const {
  frequencyOptions,
  routeOptions,
  pharmacyOptions,
  execDeptOptions,
  loadFrequencyOptions,
  loadRouteOptions,
  loadPharmacyOptions,
  loadExecDeptOptions,
} = dictionaries;

const treatmentGates = useTreatmentGates({ pharmacyOptions, execDeptOptions });
const {
  getCandidatePharmaciesForMedicine,
  getDefaultPharmacyOption,
  ensureMedicineDefaultPharmacy,
  findMatchedPharmacyOption,
} = useTreatmentPharmacyResolution({
  pharmacyOptions: () => pharmacyOptions.value,
  treatmentGates,
  warn: (message, payload) => console.warn(`[TreatmentPlan] ${message}`, payload),
});

const treatmentNormalization = useTreatmentNormalization({
  frequencyOptions,
  routeOptions,
  ensurePharmacy: ensureMedicineDefaultPharmacy,
  isExecDeptSatisfied: (rec) => treatmentGates.hasRequiredExecDept(rec),
});

function normalizeTreatment(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return treatmentNormalization.normalize(rec);
}

const { applyMedicalItemPartOptions } = useBodySiteOptions();
const treatmentHydration = useTreatmentHydration({
  pharmacyOptions,
  getCandidatePharmaciesForMedicine,
  findFrequencyOptionByValue: treatmentNormalization.findFrequencyOptionByValue,
  findRouteOptionByValue: treatmentNormalization.findRouteOptionByValue,
  applyMedicalItemPartOptions,
  afterMedicalItemHydrated: syncTreatmentExecDeptSelections,
  logContext: 'TreatmentPlanPage',
  notify: (message) => showToast?.(message, 'info'),
});

const treatmentSelectionReadiness = useTreatmentSelectionReadiness({
  ensureMedicineSelectable: treatmentHydration.ensureMedicineSelectable,
  hydrateMedicalItemDetail: treatmentHydration.hydrateMatchedMedicalItemDetail,
  checkMedicineInventoryEnough: treatmentHydration.checkMedicineInventoryEnough,
  normalize: normalizeTreatment,
  hasRequiredPharmacy: treatmentGates.hasRequiredPharmacy,
  hasRequiredExecDept: treatmentGates.hasRequiredExecDept,
  hasRequiredBodySite: treatmentGates.hasRequiredBodySite,
  openPharmacySelector: () => {},
  openExecDeptSelector: () => {},
  openBodySiteSelector: () => {},
  expandTreatmentEditor: () => {},
  notify: (message, type) => showToast?.(message, type === 'error' ? 'error' : 'info'),
});

const recommendations = useTreatmentPlanRecommendations({
  patient: computed(() => props.patient ?? null),
  diagnosis: currentDiagnosis,
  treatments,
  normalizeTreatment,
});

const writeback = useTreatmentPlanWriteback({
  patient: computed(() => props.patient ?? null),
  diagnosis: currentDiagnosis,
  treatments,
  recordContext: recommendations.recordContext,
  execDeptOptions,
  normalizeTreatment,
  findFrequencyOptionByValue: treatmentNormalization.findFrequencyOptionByValue,
  findRouteOptionByValue: treatmentNormalization.findRouteOptionByValue,
  getDefaultPharmacyOption,
  findMatchedPharmacyOption,
  ensureMedicineSelectable: treatmentHydration.ensureMedicineSelectable,
  checkMedicineInventoryEnough: treatmentHydration.checkMedicineInventoryEnough,
  hydrateMedicalItemDetail: treatmentHydration.hydrateMatchedMedicalItemDetail,
  hasRequiredPharmacy: treatmentGates.hasRequiredPharmacy,
  hasRequiredExecDept: treatmentGates.hasRequiredExecDept,
  hasRequiredBodySite: treatmentGates.hasRequiredBodySite,
  notify: (message, type) => showToast?.(message, type),
});

const selectedCount = computed(() => recommendations.selectedTreatments.value.length);
const totalCount = computed(() => treatments.value.length);
const canRecommend = computed(() => recommendations.canRecommend.value);
const missingContextTipsText = computed(() => recommendations.missingContextTips.value.join('、'));
const recommendationSections = computed(() => recommendations.sections.value);
const recommendationsLoading = computed(() => recommendations.isLoading.value);
const selectedCountByType = computed(() => {
  const counts = new Map<TreatmentRecommendation['type'], number>();
  treatments.value.forEach((item) => {
    if (item.selected) {
      counts.set(item.type, (counts.get(item.type) || 0) + 1);
    }
  });
  return counts;
});
const bannerText = computed(() => writeback.writebackStatus.writebackBannerText.value);
const bannerTone = computed(() => writeback.writebackStatus.writebackBannerTone.value);
const canSubmit = computed(() => selectedCount.value > 0 && !writeback.writebackStatus.isWritebackBusy.value);
const submitButtonText = computed(() => writeback.writebackStatus.submitButtonText.value);
const manualMatchState = useManualMatchState();
const {
  closeManualMatch,
  getManualMatchKeyword,
  isManualMatchOpen,
  openManualMatch,
  setManualMatchKeyword,
  toggleManualMatch: toggleManualMatchState,
} = manualMatchState;

function syncTreatmentExecDeptSelections(): void {
  if (execDeptOptions.value.length === 0) return;

  const keyByText = new Map(execDeptOptions.value.map((option) => [option.text, option.key]));
  treatments.value.forEach((item) => {
    if (item.type === 'medicine') return;

    const currentValue = (item.execDept || '').trim();
    if (!currentValue || execDeptOptions.value.some((option) => option.key === currentValue)) {
      return;
    }

    item.execDept = keyByText.get(currentValue) || item.execDept;
  });
}

async function loadDictionaries(): Promise<void> {
  await Promise.all([
    loadFrequencyOptions(),
    loadRouteOptions(),
    loadPharmacyOptions(),
    loadExecDeptOptions(),
  ]);

  const his = getHisAdapter();
  const activeStoreIds = pharmacyOptions.value
    .map((option) => (option.idSto || '').trim())
    .filter((value): value is string => Boolean(value));
  if (!his || activeStoreIds.length === 0) {
    medicalDataService.setActivePharmacyStoreIds(null);
  } else {
    await medicalDataService.ensureMedicineCatalogForStoreIds(activeStoreIds, his);
  }
  syncTreatmentExecDeptSelections();
}

async function refreshRecommendations(): Promise<void> {
  if (!canRecommend.value) {
    showToast?.(`缺少${missingContextTipsText.value}，暂不能生成诊疗方案。`, 'info');
    return;
  }

  try {
    await loadDictionaries();
    await recommendations.refresh();
    await treatmentHydration.hydrateMatchedMedicalItemDetails(treatments.value);
  } catch (error) {
    console.error('[TreatmentPlan] refresh failed', error);
    showToast?.(formatUserFacingError(error, {
      context: '方案推荐失败',
      fallback: '请稍后重试。',
    }), 'error');
  }
}

function requiresManualMatchBeforeSelect(item: TreatmentRecommendation): boolean {
  return !item.matchedItem;
}

function getManualMatchPickerCandidates(item: TreatmentRecommendation): ManualMatchCandidate[] {
  return findManualMatchCandidates(item, getManualMatchKeyword(item))
    .map(toManualMatchCandidateView);
}

function findManualMatchRawCandidate(
  item: TreatmentRecommendation,
  candidate: ManualMatchCandidate,
): ManualMatchRawCandidate | undefined {
  return findManualMatchCandidates(item, getManualMatchKeyword(item))
    .find((raw) => raw.id === candidate.id);
}

async function ensureMatchedTreatmentSelectable(
  item: TreatmentRecommendation,
  labelName?: string,
): Promise<boolean> {
  return treatmentSelectionReadiness.ensureTreatmentSelectable(item, {
    labelName,
    showMedicineUnavailableWarning: true,
    medicineUnavailableMessage: `${labelName || item.name} 已完成标准库匹配，但当前药房无药品详情，暂不能选中`,
    pharmacyMissingMessage: `${labelName || item.name} 当前发药药房不可用，暂不能选中`,
    execDeptMissingMessage: `${labelName || item.name} 未设置执行科室，暂不能选中`,
    bodySiteMissingMessage: `${labelName || item.name} 未设置检查部位，暂不能选中`,
    hydrateNonMedicine: true,
  });
}

async function confirmSuggestedMatch(item: TreatmentRecommendation): Promise<void> {
  if (!item.suggestedMatchItem) {
    return;
  }

  item.originalName = item.originalName || item.name;
  item.matchedItem = { ...item.suggestedMatchItem };
  item.name = item.suggestedMatchItem.name || item.name;
  item.matchStatus = 'confirmed';
  item.manualMatched = false;
  item.selected = false;
  item.suggestedMatchItem = undefined;
  Object.assign(item, normalizeTreatment(item));

  if (!(await ensureMatchedTreatmentSelectable(item))) {
    return;
  }

  item.selected = true;
  closeManualMatch();
  showToast?.(`${item.name} 已确认匹配`, 'success');
}

async function applyManualMatch(item: TreatmentRecommendation, candidate: ManualMatchCandidate): Promise<void> {
  const raw = findManualMatchRawCandidate(item, candidate);
  if (!raw) {
    showToast?.('未找到可用的标准库候选，请调整关键字后重试。', 'info');
    return;
  }

  if (!applyManualMatchCandidate(item, raw)) {
    showToast?.('该标准库候选类型与当前推荐项不匹配。', 'info');
    return;
  }

  Object.assign(item, normalizeTreatment(item));

  if (!(await ensureMatchedTreatmentSelectable(item, candidate.name))) {
    return;
  }

  item.selected = true;
  closeManualMatch();
  showToast?.(`${candidate.name} 已完成标准库匹配`, 'success');
}

async function toggleTreatment(item: TreatmentRecommendation): Promise<void> {
  if (!item.selected && requiresManualMatchBeforeSelect(item)) {
    if (hasProbableMatch(item)) {
      showToast?.('该推荐存在候选标准项，请先确认匹配或改为手动匹配。', 'info');
      return;
    }

    openManualMatch(item);
    showToast?.('该推荐尚未匹配标准库，请先手动匹配。', 'info');
    return;
  }

  if (!item.selected) {
    if (!(await ensureMatchedTreatmentSelectable(item))) {
      return;
    }
  }

  item.selected = !item.selected;
  if (item.selected && item.type === 'medicine') {
    Object.assign(item, normalizeTreatment(item));
  }
  if (!item.selected) {
    treatmentHydration.clearMedicineInventoryWarning(item);
  }
}

function getGroupSelectedCount(type: TreatmentRecommendation['type']): number {
  return selectedCountByType.value.get(type) || 0;
}

onMounted(() => {
  void refreshRecommendations();
});
</script>

<template>
  <div class="treatment-plan-page">
    <PatientHeader :patient="patient ?? null" />

    <main class="plan-workspace">
      <section class="plan-card">
        <header class="plan-card-header">
          <div>
            <h2>
              推荐方案
              <span v-if="currentDiagnosis">（基于【{{ currentDiagnosis.name }}】）</span>
            </h2>
            <p v-if="canRecommend" class="plan-subtitle">
              勾选需要同步到 PHIS 的处置项目，一键回写会按所选项生成诊断和医嘱清单。
            </p>
            <p v-else class="plan-subtitle is-warning">
              缺少{{ missingContextTipsText }}，请先在 HIS 中补齐后重新触发。
            </p>
          </div>
          <button class="icon-action" title="刷新方案" :disabled="recommendationsLoading" @click="refreshRecommendations">
            <Icon icon="lucide:refresh-cw" :size="18" aria-hidden="true" />
          </button>
        </header>

        <div v-if="bannerText" :class="['writeback-banner', `is-${bannerTone}`]">
          {{ bannerText }}
        </div>

        <div class="plan-scroll">
          <TreatmentPlanGroup
            v-for="section in recommendationSections"
            :key="section.key"
            :section="section"
            :selected-count="getGroupSelectedCount(section.itemType)"
            :total-count="section.items.length"
            :is-manual-match-open="isManualMatchOpen"
            :get-manual-match-keyword="getManualMatchKeyword"
            :get-manual-match-candidates="getManualMatchPickerCandidates"
            @toggle="toggleTreatment"
            @confirm-match="confirmSuggestedMatch"
            @toggle-manual-match="toggleManualMatchState"
            @update-manual-match-keyword="setManualMatchKeyword"
            @select-manual-match-candidate="applyManualMatch"
          />
        </div>
      </section>
    </main>

    <footer class="plan-footer">
      <div class="selection-summary">
        <span>{{ totalCount }} 项推荐</span>
        <span>{{ selectedCount }} 项已选</span>
      </div>
      <div class="footer-actions">
        <button class="secondary-btn" @click="emit('close')">返回</button>
        <button
          class="primary-btn"
          :disabled="!canSubmit"
          @click="writeback.submit"
        >
          {{ submitButtonText }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.treatment-plan-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #eef3f8;
}

.plan-workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 24px 0 16px;
}

.plan-card {
  display: flex;
  flex-direction: column;
  width: min(930px, calc(100% - 64px));
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.plan-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e5e7eb;
}

.plan-card-header h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 1.4;
}

.plan-card-header h2 span {
  font-weight: 700;
}

.plan-subtitle {
  margin-top: 6px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

.plan-subtitle.is-warning {
  color: #c2410c;
}

.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  color: #2469f2;
  background: #f8fbff;
  cursor: pointer;
}

.icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.writeback-banner {
  margin: 14px 18px 0;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.writeback-banner.is-info {
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.writeback-banner.is-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.plan-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 20px;
}

.plan-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 22px;
  border-top: 1px solid #dbe3ee;
  background: rgba(255, 255, 255, 0.95);
}

.selection-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #475569;
  font-size: 14px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.secondary-btn,
.primary-btn {
  min-width: 84px;
  height: 34px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.secondary-btn {
  border: 1px solid #d1d5db;
  color: #334155;
  background: #fff;
}

.primary-btn {
  border: 1px solid #ea580c;
  color: #fff;
  background: #ea580c;
}

.primary-btn:disabled {
  border-color: #cbd5e1;
  color: #94a3b8;
  background: #f1f5f9;
  cursor: not-allowed;
}
</style>
