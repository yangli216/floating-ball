<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getMedicineCollapsedSummary,
  getSuggestedMatchName,
  getTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentSpec,
  hasProbableMatch,
} from '@features/clinical-result';
import {
  ManualMatchPicker,
  TreatmentRecommendationCard,
  type ManualMatchCandidate,
} from '@features/consultation-result';
import type { TreatmentPlanRecommendationSection } from '../model/useTreatmentPlanRecommendations';

const props = defineProps<{
  section: TreatmentPlanRecommendationSection;
  selectedCount: number;
  totalCount: number;
  isPharmacyRequired: (item: TreatmentRecommendation) => boolean;
  getPharmacyDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredPharmacy: (item: TreatmentRecommendation) => boolean;
  isExecDeptRequired: (item: TreatmentRecommendation) => boolean;
  getExecDeptDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredExecDept: (item: TreatmentRecommendation) => boolean;
  getBodySiteDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredBodySite: (item: TreatmentRecommendation) => boolean;
  isSecondarySelectorOpen: (item: TreatmentRecommendation, field: 'pharmacy' | 'execDept' | 'bodySite') => boolean;
  getPharmacySearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredPharmacyOptions: (item: TreatmentRecommendation) => Array<{ key: string; text: string; mcode?: string }>;
  getExecDeptSearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredExecDeptOptions: (item: TreatmentRecommendation) => Array<{ key: string; text: string; mcode?: string }>;
  getBodySiteSearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredBodySiteOptions: (item: TreatmentRecommendation) => Array<{ key: string; text: string; mcode?: string }>;
  isManualMatchOpen: (item: TreatmentRecommendation) => boolean;
  getManualMatchKeyword: (item: TreatmentRecommendation) => string;
  getManualMatchCandidates: (item: TreatmentRecommendation) => ManualMatchCandidate[];
}>();

const emit = defineEmits<{
  toggle: [item: TreatmentRecommendation];
  confirmMatch: [item: TreatmentRecommendation];
  openPharmacy: [item: TreatmentRecommendation, event?: Event];
  openExecDept: [item: TreatmentRecommendation, event?: Event];
  openBodySite: [item: TreatmentRecommendation, event?: Event];
  closeSecondarySelector: [item: TreatmentRecommendation, field: 'pharmacy' | 'execDept' | 'bodySite', event: FocusEvent];
  updatePharmacyKeyword: [item: TreatmentRecommendation, event: Event];
  selectPharmacy: [item: TreatmentRecommendation, option: { key: string; text: string; mcode?: string }];
  clearPharmacy: [item: TreatmentRecommendation];
  updateExecDeptKeyword: [item: TreatmentRecommendation, event: Event];
  selectExecDept: [item: TreatmentRecommendation, option: { key: string; text: string; mcode?: string }];
  clearExecDept: [item: TreatmentRecommendation];
  updateBodySiteKeyword: [item: TreatmentRecommendation, event: Event];
  selectBodySite: [item: TreatmentRecommendation, option: { key: string; text: string; mcode?: string }];
  clearBodySite: [item: TreatmentRecommendation];
  toggleManualMatch: [item: TreatmentRecommendation];
  updateManualMatchKeyword: [item: TreatmentRecommendation, value: string];
  selectManualMatchCandidate: [item: TreatmentRecommendation, candidate: ManualMatchCandidate];
}>();

function getTypeBadge(item: TreatmentRecommendation): string {
  switch (item.type) {
    case 'medicine':
      return '药';
    case 'exam':
      return '查';
    case 'lab_test':
      return '验';
    case 'procedure':
      return '处';
    default:
      return '项';
  }
}

function getMatchTone(item: TreatmentRecommendation): 'default' | 'warning' | 'success' {
  if (item.matchStatus === 'probable' || item.matchStatus === 'unmatched' || !item.matchedItem) {
    return 'warning';
  }
  if (item.matchStatus === 'manual' || item.matchStatus === 'confirmed' || item.matchStatus === 'exact') {
    return 'success';
  }
  return 'default';
}

function getDisplayMatchLabel(item: TreatmentRecommendation): string {
  return item.matchedItem || item.matchStatus === 'probable'
    ? getTreatmentMatchLabel(item, 'detailed') || '未匹配标准库'
    : '未匹配标准库';
}

function getManualMatchTitle(sectionTitle: string): string {
  return `从标准库选择${sectionTitle.replace(/^推荐/, '').replace('项目', '')}`;
}

function getUsageToken(item: TreatmentRecommendation): string {
  if (item.type === 'medicine') return '';
  return item.usage || '';
}

function getInlineSummary(item: TreatmentRecommendation): string {
  if (item.type === 'medicine') {
    return getMedicineCollapsedSummary(item, []);
  }
  return '';
}
</script>

<template>
  <section class="plan-group">
    <header class="plan-group-header">
      <div class="plan-group-title">
        <h3>{{ section.title }}</h3>
      </div>
      <div class="plan-group-stats">
        <span>{{ totalCount }} 项推荐</span>
        <span>{{ selectedCount }} 项已选</span>
      </div>
    </header>

    <div v-if="section.loading" class="plan-group-state">
      <Icon icon="lucide:loader-2" :size="18" class="spin" aria-hidden="true" />
      <span>正在生成{{ section.title }}...</span>
    </div>

    <div v-else-if="section.error" class="plan-group-state is-error">
      <Icon icon="lucide:circle-alert" :size="18" aria-hidden="true" />
      <span>{{ section.error }}</span>
    </div>

    <div v-else-if="section.items.length === 0" class="plan-group-state">
      <span>当前暂无推荐项目</span>
    </div>

    <div v-else class="plan-list">
      <TreatmentRecommendationCard
        v-for="item in section.items"
        :key="`${item.type}:${item.matchedItem?.id || item.name}`"
        :rec="item"
        :selected="!!item.selected"
        :locked="!item.matchedItem"
        :matching="props.isManualMatchOpen(item)"
        :spec="getTreatmentSpec(item)"
        :match-label="getDisplayMatchLabel(item)"
        :match-tone="getMatchTone(item)"
        :show-exec-dept-chip="props.isExecDeptRequired(item)"
        :exec-dept-display="props.getExecDeptDisplay(item)"
        :exec-dept-missing="!props.hasRequiredExecDept(item)"
        :exec-dept-title="props.hasRequiredExecDept(item) ? '点击调整执行科室' : '执行科室为空，点击设置后才能选中'"
        :show-pharmacy-chip="props.isPharmacyRequired(item)"
        :pharmacy-display="props.getPharmacyDisplay(item)"
        :pharmacy-missing="!props.hasRequiredPharmacy(item)"
        :pharmacy-title="props.hasRequiredPharmacy(item) ? '点击调整发药药房' : '发药药房未设置或不在当前药品可用药房列表，点击选择'"
        :usage-token="getUsageToken(item)"
        :probable-match-name="hasProbableMatch(item) ? getSuggestedMatchName(item) : ''"
        :original-name="getTreatmentOriginalName(item)"
        :inline-summary="getInlineSummary(item)"
        :show-feedback="false"
        :show-manual-match-button="!item.matchedItem"
        :manual-match-title="props.isManualMatchOpen(item) ? '收起手动匹配' : '手动匹配标准库项目'"
        :manual-match-button-text="props.isManualMatchOpen(item) ? '收起匹配' : '手动匹配'"
        @toggle="emit('toggle', item)"
        @open-pharmacy="emit('openPharmacy', item, $event)"
        @open-exec-dept="emit('openExecDept', item, $event)"
        @confirm-probable-match="emit('confirmMatch', item)"
        @toggle-manual-match="emit('toggleManualMatch', item)"
      >
        <template #title-prefix>
          <span class="type-badge">{{ getTypeBadge(item) }}</span>
        </template>

        <template #actions>
          <button
            v-if="item.type === 'exam'"
            class="body-site-chip"
            :class="{ missing: !props.hasRequiredBodySite(item) }"
            type="button"
            :title="props.hasRequiredBodySite(item) ? '点击调整检查部位' : '检查部位为空，点击设置后才能选中'"
            @click.stop="emit('openBodySite', item, $event)"
          >
            <span v-if="!props.hasRequiredBodySite(item)" class="body-site-chip-label">检查部位</span>
            <span class="body-site-chip-value">{{ props.getBodySiteDisplay(item) || '待设置' }}</span>
          </button>
        </template>

        <template #body>
          <div
            v-if="props.isSecondarySelectorOpen(item, 'pharmacy') || props.isSecondarySelectorOpen(item, 'execDept') || props.isSecondarySelectorOpen(item, 'bodySite')"
            class="plan-attribute-editors"
            @click.stop
          >
            <div
              v-if="props.isPharmacyRequired(item) && props.isSecondarySelectorOpen(item, 'pharmacy')"
              class="field-editor route-field-editor"
              @focusout="emit('closeSecondarySelector', item, 'pharmacy', $event)"
            >
              <input
                :value="props.getPharmacySearchKeyword(item)"
                type="text"
                placeholder="输入名称筛选药房"
                class="edit-input"
                @input="emit('updatePharmacyKeyword', item, $event)"
              />
              <div class="route-option-list" role="listbox" aria-label="药房候选项">
                <button
                  v-if="item.pharmacy"
                  class="route-option-item route-option-clear"
                  type="button"
                  @mousedown.prevent.stop="emit('clearPharmacy', item)"
                >
                  <span class="route-option-text">清空当前值</span>
                </button>
                <button
                  v-for="option in props.getFilteredPharmacyOptions(item).slice(0, 8)"
                  :key="option.key"
                  class="route-option-item"
                  type="button"
                  @mousedown.prevent.stop="emit('selectPharmacy', item, option)"
                >
                  <span class="route-option-text">{{ option.text }}</span>
                  <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                </button>
                <div v-if="props.getFilteredPharmacyOptions(item).length === 0" class="route-option-empty">未找到匹配药房</div>
              </div>
            </div>

            <div
              v-if="props.isExecDeptRequired(item) && props.isSecondarySelectorOpen(item, 'execDept')"
              class="field-editor route-field-editor"
              @focusout="emit('closeSecondarySelector', item, 'execDept', $event)"
            >
              <input
                :value="props.getExecDeptSearchKeyword(item)"
                type="text"
                placeholder="输入名称筛选科室"
                class="edit-input"
                @input="emit('updateExecDeptKeyword', item, $event)"
              />
              <div class="route-option-list" role="listbox" aria-label="执行科室候选项">
                <button
                  v-if="item.execDept"
                  class="route-option-item route-option-clear"
                  type="button"
                  @mousedown.prevent.stop="emit('clearExecDept', item)"
                >
                  <span class="route-option-text">清空当前值</span>
                </button>
                <button
                  v-for="option in props.getFilteredExecDeptOptions(item).slice(0, 8)"
                  :key="option.key"
                  class="route-option-item"
                  type="button"
                  @mousedown.prevent.stop="emit('selectExecDept', item, option)"
                >
                  <span class="route-option-text">{{ option.text }}</span>
                  <span v-if="option.key !== option.text" class="route-option-meta">{{ option.key }}</span>
                </button>
                <div v-if="props.getFilteredExecDeptOptions(item).length === 0" class="route-option-empty">未找到匹配科室</div>
              </div>
            </div>

            <div
              v-if="item.type === 'exam' && props.isSecondarySelectorOpen(item, 'bodySite')"
              class="field-editor route-field-editor"
              @focusout="emit('closeSecondarySelector', item, 'bodySite', $event)"
            >
              <input
                :value="props.getBodySiteSearchKeyword(item)"
                type="text"
                placeholder="输入名称筛选部位"
                class="edit-input"
                @input="emit('updateBodySiteKeyword', item, $event)"
              />
              <div class="route-option-list" role="listbox" aria-label="检查部位候选项">
                <button
                  v-if="item.bodySite"
                  class="route-option-item route-option-clear"
                  type="button"
                  @mousedown.prevent.stop="emit('clearBodySite', item)"
                >
                  <span class="route-option-text">清空当前值</span>
                </button>
                <button
                  v-for="option in props.getFilteredBodySiteOptions(item).slice(0, 8)"
                  :key="option.key"
                  class="route-option-item"
                  type="button"
                  @mousedown.prevent.stop="emit('selectBodySite', item, option)"
                >
                  <span class="route-option-text">{{ option.text }}</span>
                  <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                </button>
                <div v-if="props.getFilteredBodySiteOptions(item).length === 0" class="route-option-empty">暂无可选部位</div>
              </div>
            </div>
          </div>
        </template>

        <template #manual-match>
          <ManualMatchPicker
            v-if="!item.matchedItem && props.isManualMatchOpen(item)"
            :title="getManualMatchTitle(section.title)"
            :keyword="props.getManualMatchKeyword(item)"
            :candidates="props.getManualMatchCandidates(item)"
            @update:keyword="emit('updateManualMatchKeyword', item, $event)"
            @select="emit('selectManualMatchCandidate', item, $event)"
          />
        </template>
      </TreatmentRecommendationCard>
    </div>
  </section>
</template>

<style scoped>
.plan-group {
  --voice-border: #dbe3ee;
  --voice-border-strong: #cbd5e1;
  --voice-surface: #fff;
  --voice-surface-soft: #f8fafc;
  --voice-accent: #2469f2;
  --voice-accent-soft: rgba(36, 105, 242, 0.18);
  --voice-accent-softer: rgba(36, 105, 242, 0.08);
  --voice-accent-strong: #1d4ed8;
  --voice-warning: #b45309;
  --voice-success: #15803d;
  --voice-text: #111827;
  --voice-text-muted: #64748b;
  --voice-font-min: 12px;
  --voice-font-strong: 15px;
  overflow: visible;
}

.plan-group + .plan-group {
  margin-top: 14px;
}

.plan-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.plan-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
}

.plan-group-title h3 {
  margin: 0;
  color: var(--voice-text);
  font-size: var(--voice-font-strong);
  font-weight: 700;
  line-height: 1.4;
}

.plan-group-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
}

.plan-group-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 76px;
  padding: 18px;
  color: #64748b;
  font-size: 14px;
}

.plan-group-state.is-error {
  color: #b45309;
  background: #fff7ed;
}

.spin {
  animation: spin 0.9s linear infinite;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.body-site-chip {
  min-height: 28px;
  border-radius: 999px;
  white-space: nowrap;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid #8bb7ff;
  border-radius: 5px;
  color: #2469f2;
  font-weight: 700;
  font-size: 13px;
  line-height: 1;
  background: #f1f6ff;
}

.plan-attribute-editors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.field-editor {
  position: relative;
}

.edit-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  color: #1f2937;
  font-size: 13px;
  background: #fff;
}

.edit-input:focus {
  border-color: #2469f2;
  outline: 2px solid rgba(36, 105, 242, 0.16);
}

.route-option-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: min(320px, 72vw);
  max-height: 230px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.14);
}

.route-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  color: #1f2937;
  font-size: 13px;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.route-option-item:hover {
  background: #f1f6ff;
  color: #2469f2;
}

.route-option-clear {
  color: #64748b;
}

.route-option-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-option-meta {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 12px;
}

.route-option-empty {
  padding: 9px 8px;
  color: #94a3b8;
  font-size: 13px;
}

.body-site-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 150px;
  padding: 0 9px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(248, 250, 252, 0.96);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.body-site-chip:hover {
  border-color: #2469f2;
  background: rgba(37, 99, 235, 0.1);
}

.body-site-chip.missing {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(255, 247, 237, 0.92);
  color: #b45309;
}

.body-site-chip-label {
  flex-shrink: 0;
}

.body-site-chip-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
