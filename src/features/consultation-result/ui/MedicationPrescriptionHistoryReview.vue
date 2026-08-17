<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { RecentPrescriptionHistory } from '@/types/consultation';

const props = defineProps<{
  history: RecentPrescriptionHistory;
  currentTotalQty?: string;
  currentTotalUnit?: string;
}>();

const expanded = ref(false);

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '日期未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function formatAmount(quantity?: string, unit?: string): string {
  return quantity?.trim() ? `${quantity.trim()}${unit?.trim() || ''}` : '';
}

function formatDose(dosage?: string, dosageUnit?: string): string {
  return dosage?.trim() ? `${dosage.trim()}${dosageUnit?.trim() || ''}` : '';
}

function normalizeUnit(unit?: string): string {
  return unit?.replace(/\s+/g, '').toLowerCase() || '';
}

const entries = computed(() => props.history.entries);
const latestEntry = computed(() => entries.value[0]);
const currentAmount = computed(() => formatAmount(props.currentTotalQty, props.currentTotalUnit));
const aggregate = computed(() => {
  if (props.history.matchBasis === 'ambiguous-name') return null;
  const quantities = entries.value
    .map((entry) => ({
      quantity: Number(entry.totalQty),
      unit: entry.totalUnit?.trim() || '',
      normalizedUnit: normalizeUnit(entry.totalUnit),
    }))
    .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0 && entry.normalizedUnit);
  if (quantities.length === 0) return null;
  const units = new Set(quantities.map((entry) => entry.normalizedUnit));
  if (units.size !== 1) return null;
  const total = Number(quantities.reduce((sum, entry) => sum + entry.quantity, 0).toFixed(6));
  return `${total}${quantities[0].unit}`;
});
const hasMixedUnits = computed(() => {
  const units = new Set(
    entries.value
      .filter((entry) => Number(entry.totalQty) > 0)
      .map((entry) => normalizeUnit(entry.totalUnit))
      .filter((unit): unit is string => Boolean(unit)),
  );
  return units.size > 1;
});

const summary = computed(() => {
  if (entries.value.length === 0) {
    return `近${props.history.lookbackDays}天未找到同品开药记录`;
  }
  const parts = [`近${props.history.lookbackDays}天开药 ${entries.value.length} 次`];
  if (latestEntry.value) {
    parts.push(`最近 ${formatDate(latestEntry.value.prescribedAt)}`);
    if (latestEntry.value.days) parts.push(`${latestEntry.value.days}天`);
    const latestAmount = formatAmount(latestEntry.value.totalQty, latestEntry.value.totalUnit);
    if (latestAmount) parts.push(latestAmount);
  }
  if (aggregate.value) parts.push(`同单位累计 ${aggregate.value}`);
  return parts.join(' · ');
});

function buildUsage(entry: RecentPrescriptionHistory['entries'][number]): string {
  return [
    formatDose(entry.dosage, entry.dosageUnit),
    entry.frequency,
    entry.route,
    entry.days ? `${entry.days}天` : '',
  ].filter(Boolean).join(' · ');
}
</script>

<template>
  <section class="prescription-history-review" @click.stop>
    <button
      class="prescription-history-summary"
      type="button"
      :aria-expanded="expanded"
      :disabled="entries.length === 0"
      @click="expanded = !expanded"
    >
      <span class="summary-main">
        <Icon icon="lucide:history" :size="15" aria-hidden="true" />
        <span>{{ summary }}</span>
      </span>
      <span v-if="currentAmount" class="current-amount">本次拟开 {{ currentAmount }}</span>
      <Icon
        v-if="entries.length > 0"
        :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
        :size="15"
        aria-hidden="true"
      />
    </button>

    <div v-if="expanded && entries.length > 0" class="prescription-history-details">
      <div v-if="history.matchBasis === 'ambiguous-name'" class="history-warning">
        同名历史记录包含不同药品标识，以下记录仅供逐笔核查，不合并总量。
      </div>
      <div v-else-if="hasMixedUnits" class="history-warning">
        历史总量单位不一致，未自动累计，请逐笔核查。
      </div>

      <div class="history-table" role="table" aria-label="近期开药明细">
        <div v-for="(entry, index) in entries" :key="`${entry.visitId || entry.prescribedAt}:${entry.orderId || index}`" class="history-row" role="row">
          <div class="history-date" role="cell">{{ formatDate(entry.prescribedAt) }}</div>
          <div class="history-content" role="cell">
            <div class="history-name-line">
              <span class="history-name">{{ entry.name }}</span>
              <span v-if="entry.spec" class="history-spec">{{ entry.spec }}</span>
            </div>
            <div class="history-meta">
              <span v-if="entry.deptName">{{ entry.deptName }}</span>
              <span v-if="buildUsage(entry)">{{ buildUsage(entry) }}</span>
            </div>
          </div>
          <div class="history-amount" role="cell">
            {{ formatAmount(entry.totalQty, entry.totalUnit) || '总量未记录' }}
          </div>
        </div>
      </div>

      <p class="review-note">
        医保周期和限量以院内实时规则为准，请结合本次拟开量核查。
      </p>
    </div>
  </section>
</template>

<style scoped>
.prescription-history-review {
  margin-top: 8px;
  border: 1px solid #cfe0f5;
  border-radius: 9px;
  overflow: hidden;
  background: #f8fbff;
}

.prescription-history-summary {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: #315b87;
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.prescription-history-summary:disabled {
  cursor: default;
}

.summary-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.current-amount {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  color: #9a5b08;
  background: #fff4dd;
  font-weight: 600;
}

.prescription-history-details {
  padding: 0 10px 10px;
  border-top: 1px solid #dce8f6;
}

.history-warning {
  margin: 8px 0 6px;
  color: #9a5b08;
  font-size: 12px;
}

.history-table {
  max-height: 210px;
  overflow-y: auto;
}

.history-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 8px 0;
  border-bottom: 1px dashed #dce6f2;
  font-size: 12px;
}

.history-date,
.history-meta,
.history-spec {
  color: #64748b;
}

.history-name-line,
.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.history-name {
  color: #243b53;
  font-weight: 600;
}

.history-amount {
  color: #243b53;
  font-weight: 600;
  white-space: nowrap;
}

.review-note {
  margin: 8px 0 0;
  color: #7c5a1f;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 820px) {
  .prescription-history-summary {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .history-row {
    grid-template-columns: 76px minmax(0, 1fr);
  }

  .history-amount {
    grid-column: 2;
  }
}
</style>
