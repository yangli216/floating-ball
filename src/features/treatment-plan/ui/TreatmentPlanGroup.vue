<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getSuggestedMatchName,
  getTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentSpec,
  hasProbableMatch,
} from '@features/clinical-result';
import { ManualMatchPicker, type ManualMatchCandidate } from '@features/consultation-result';
import type { TreatmentPlanRecommendationSection } from '../model/useTreatmentPlanRecommendations';

const props = defineProps<{
  section: TreatmentPlanRecommendationSection;
  selectedCount: number;
  totalCount: number;
  isManualMatchOpen: (item: TreatmentRecommendation) => boolean;
  getManualMatchKeyword: (item: TreatmentRecommendation) => string;
  getManualMatchCandidates: (item: TreatmentRecommendation) => ManualMatchCandidate[];
}>();

const emit = defineEmits<{
  toggle: [item: TreatmentRecommendation];
  confirmMatch: [item: TreatmentRecommendation];
  toggleManualMatch: [item: TreatmentRecommendation];
  updateManualMatchKeyword: [item: TreatmentRecommendation, value: string];
  selectManualMatchCandidate: [item: TreatmentRecommendation, candidate: ManualMatchCandidate];
}>();

const sectionIcon = computed(() => {
  switch (props.section.itemType) {
    case 'medicine':
      return 'lucide:shield-check';
    case 'exam':
      return 'lucide:monitor-up';
    case 'lab_test':
      return 'lucide:file-text';
    case 'procedure':
      return 'lucide:workflow';
    default:
      return 'lucide:list';
  }
});

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

function getMatchedName(item: TreatmentRecommendation): string {
  return item.matchedItem?.name || item.name;
}

function getMatchTone(item: TreatmentRecommendation): string {
  if (item.matchStatus === 'probable' || item.matchStatus === 'unmatched' || !item.matchedItem) {
    return 'warning';
  }
  if (item.matchStatus === 'manual' || item.matchStatus === 'confirmed' || item.matchStatus === 'exact') {
    return 'success';
  }
  return 'default';
}

function getDisplayMatchLabel(item: TreatmentRecommendation): string {
  return getTreatmentMatchLabel(item, 'detailed') || '未匹配标准库';
}

function getManualMatchTitle(sectionTitle: string): string {
  return `从标准库选择${sectionTitle.replace(/^推荐/, '').replace('项目', '')}`;
}

function getMetaText(item: TreatmentRecommendation): string {
  if (item.type === 'medicine') {
    return [
      getTreatmentSpec(item),
      [item.dosage, item.dosageUnit].filter(Boolean).join(''),
      item.frequency,
      item.route,
      item.days ? `${item.days}天` : '',
      item.totalQty && item.totalUnit ? `总量${item.totalQty}${item.totalUnit}` : '',
    ].filter(Boolean).join(' / ');
  }

  return [
    item.execDept ? `执行科室：${item.execDept}` : '',
    item.bodySite ? `部位：${item.bodySite}` : '',
    item.totalQty && item.totalUnit ? `数量：${item.totalQty}${item.totalUnit}` : '',
  ].filter(Boolean).join(' / ');
}
</script>

<template>
  <section class="plan-group">
    <header class="plan-group-header">
      <div class="plan-group-title">
        <Icon :icon="sectionIcon" :size="17" class="plan-group-icon" aria-hidden="true" />
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

    <ul v-else class="plan-list">
      <li
        v-for="item in section.items"
        :key="`${item.type}:${item.matchedItem?.id || item.name}`"
        class="plan-item"
        :class="{ 'is-selected': item.selected }"
      >
        <label class="plan-check">
          <input
            type="checkbox"
            :checked="!!item.selected"
            @change="emit('toggle', item)"
          />
          <span class="check-box">
            <Icon v-if="item.selected" icon="lucide:check" :size="13" aria-hidden="true" />
          </span>
        </label>

        <div class="plan-body">
          <div class="plan-main-line">
            <span class="type-badge">{{ getTypeBadge(item) }}</span>
            <strong class="plan-name">{{ getMatchedName(item) }}</strong>
            <span
              class="match-badge"
              :class="[`match-${item.matchStatus || 'unmatched'}`, `tone-${getMatchTone(item)}`]"
            >
              {{ getDisplayMatchLabel(item) }}
            </span>
            <span v-if="getTreatmentOriginalName(item)" class="original-name">
              原：{{ getTreatmentOriginalName(item) }}
            </span>
          </div>

          <div v-if="getMetaText(item)" class="plan-meta">
            {{ getMetaText(item) }}
          </div>

          <div v-if="hasProbableMatch(item)" class="match-action-row">
            <span class="suggested-match">
              候选标准项：{{ getSuggestedMatchName(item) }}
            </span>
            <button class="link-action" type="button" @click.stop="emit('confirmMatch', item)">
              确认匹配
            </button>
            <button class="link-action muted" type="button" @click.stop="emit('toggleManualMatch', item)">
              手动匹配
            </button>
          </div>

          <div v-else-if="!item.matchedItem" class="match-action-row">
            <span class="suggested-match is-warning">未匹配标准库，匹配后才可回写</span>
            <button class="link-action" type="button" @click.stop="emit('toggleManualMatch', item)">
              {{ props.isManualMatchOpen(item) ? '收起匹配' : '手动匹配' }}
            </button>
          </div>

          <ManualMatchPicker
            v-if="!item.matchedItem && props.isManualMatchOpen(item)"
            :title="getManualMatchTitle(section.title)"
            :keyword="props.getManualMatchKeyword(item)"
            :candidates="props.getManualMatchCandidates(item)"
            @update:keyword="emit('updateManualMatchKeyword', item, $event)"
            @select="emit('selectManualMatchCandidate', item, $event)"
          />

          <p class="plan-reason">{{ item.reason || item.goal || '基于当前诊断与病历信息推荐。' }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.plan-group {
  overflow: hidden;
  border: 1px solid #d8dde6;
  border-radius: 8px;
  background: #fff;
}

.plan-group + .plan-group {
  margin-top: 14px;
}

.plan-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid #d8dde6;
  background: linear-gradient(90deg, #f8fafc 0%, #eef3f8 100%);
}

.plan-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.plan-group-icon {
  color: #2469f2;
  flex-shrink: 0;
}

.plan-group-title h3 {
  font-size: 16px;
  line-height: 1.3;
  color: #1f2937;
}

.plan-group-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  color: #475569;
  font-size: 14px;
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
  list-style: none;
}

.plan-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.plan-item:last-child {
  border-bottom: none;
}

.plan-item.is-selected {
  background: #f8fbff;
}

.plan-check {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
  cursor: pointer;
}

.plan-check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.check-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #fff;
  background: #fff;
}

.plan-item.is-selected .check-box {
  border-color: #2469f2;
  background: #2469f2;
}

.plan-body {
  min-width: 0;
  flex: 1;
}

.plan-main-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.plan-name {
  color: #111827;
  font-size: 16px;
  line-height: 1.35;
}

.match-badge,
.original-name {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 13px;
  line-height: 1.2;
}

.match-badge {
  border: 1px solid #86efac;
  color: #15803d;
  background: #f0fdf4;
}

.match-probable {
  border-color: #fdba74;
  color: #c2410c;
  background: #fff7ed;
}

.match-unmatched {
  border-color: #d1d5db;
  color: #64748b;
  background: #f8fafc;
}

.tone-warning {
  border-color: #fdba74;
  color: #c2410c;
  background: #fff7ed;
}

.tone-success {
  border-color: #86efac;
  color: #15803d;
  background: #f0fdf4;
}

.original-name {
  color: #64748b;
  background: #f8fafc;
}

.match-action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.suggested-match {
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
}

.suggested-match.is-warning {
  color: #c2410c;
}

.link-action {
  height: 24px;
  padding: 0 8px;
  border: 1px solid #8bb7ff;
  border-radius: 5px;
  color: #2469f2;
  font-size: 13px;
  line-height: 1;
  background: #f1f6ff;
  cursor: pointer;
}

.link-action:hover {
  border-color: #2469f2;
  background: #e7f0ff;
}

.link-action.muted {
  border-color: #cbd5e1;
  color: #475569;
  background: #f8fafc;
}

.plan-meta {
  margin-top: 6px;
  color: #334155;
  font-size: 14px;
  line-height: 1.5;
}

.plan-reason {
  margin-top: 6px;
  color: #1f2937;
  font-size: 14px;
  line-height: 1.6;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
