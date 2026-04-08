<template>
  <div
    class="rc-root"
    :style="{ border: '2px solid ' + borderColor }"
    data-tauri-drag-region
  >
    <!-- Close -->
    <div class="rc-close" @click="trackClick('reception_close'); $emit('close')">
      <Icon icon="lucide:x" size="14" />
    </div>

    <!-- Header row -->
    <div class="rc-header">
      <!-- Avatar -->
      <div class="rc-avatar">
        <Icon :icon="gender === 'F' ? 'mdi:human-female' : 'mdi:human-male'" :color="gender === 'F' ? '#ff9a9e' : '#79c2ff'" size="30" />
      </div>

      <!-- Info -->
      <div class="rc-info">
        <div class="rc-name-row">
          <span class="rc-name">{{ patientName }}</span>
          <span class="rc-meta">{{ gender === 'F' ? '女' : '男' }}</span>
          <span class="rc-meta">{{ age }}岁</span>
        </div>
        <div class="rc-badge-row">
          <span v-if="analyzing" class="rc-badge rc-badge--blue">
            <span class="rc-dot"></span>
            正在评估...
          </span>
          <span v-else-if="risks.length > 0" class="rc-badge rc-badge--orange">
            <Icon icon="lucide:alert-circle" size="14" />
            {{ risks.length }}项健康风险
          </span>
          <span v-else class="rc-badge rc-badge--green">
            <Icon icon="lucide:thumbs-up" size="14" />
            健康状态良好
          </span>
        </div>
      </div>

      <!-- Expand toggle -->
      <div
        v-if="risks.length > 0 && !analyzing"
        class="rc-toggle"
        @click="toggle"
      >
        <Icon :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="18" />
      </div>
    </div>

    <!-- Risk items -->
    <div v-if="expanded && risks.length > 0" class="rc-risks">
      <div v-for="(r, i) in risks" :key="i" class="rc-risk-row">
        <span
          class="rc-tag"
          :style="{ color: tagColor(r.category), borderColor: tagColor(r.category) }"
        >{{ tagLabel(r.category) }}</span>
        <span class="rc-risk-text">{{ r.content }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Icon from './Icon.vue';
import { trackClick, startTimedOperation } from '../services/operationTracker';

export interface RiskItem {
  level: 1 | 2 | 3;
  category: string;
  content: string;
}

const props = defineProps<{
  patientName: string;
  gender: 'M' | 'F';
  age: number;
  risks: RiskItem[];
  analyzing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggle-expand', expanded: boolean): void;
}>();

const expanded = ref(false);
let endTimer: ((s?: boolean, d?: Record<string, any>) => void) | null = null;

const borderColor = computed(() => {
  if (props.analyzing) return '#93c5fd';
  if (props.risks.length > 0) return '#fb923c';
  return '#4ade80';
});

watch(() => props.analyzing, (now, was) => {
  if (now && !was) endTimer = startTimedOperation('reception_risk_analysis');
  else if (!now && was && endTimer) {
    endTimer(true, { riskCount: props.risks.length, patientName: props.patientName });
    endTimer = null;
  }
});

watch(() => props.risks, (r) => {
  const open = r.length > 0;
  expanded.value = open;
  emit('toggle-expand', open);
}, { immediate: true });

function toggle() {
  expanded.value = !expanded.value;
  trackClick('reception_toggle_risk_detail', { expanded: expanded.value, riskCount: props.risks.length });
  emit('toggle-expand', expanded.value);
}

const CATEGORY_COLORS: Record<string, string> = {
  allergy: '#dc2626',
  chronic: '#ea580c',
  medication: '#d97706',
  population: '#2563eb',
  vital: '#16a34a',
  other: '#64748b',
};
const CATEGORY_LABELS: Record<string, string> = {
  allergy: '过敏',
  chronic: '慢病',
  medication: '用药',
  population: '人群',
  vital: '体征',
  other: '其他',
};

function tagColor(cat: string) { return CATEGORY_COLORS[cat] || '#64748b'; }
function tagLabel(cat: string) { return CATEGORY_LABELS[cat] || '其他'; }
</script>

<style scoped>
.rc-root {
  position: absolute;
  inset: 0;
  background: #ffffff !important;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* ---- close ---- */
.rc-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #94a3b8;
  z-index: 2;
  -webkit-app-region: no-drag;
}
.rc-close:hover { background: rgba(0,0,0,0.12); color: #475569; }

/* ---- header ---- */
.rc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.rc-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e8eaf6, #d1d5e8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rc-info { flex: 1; min-width: 0; }

.rc-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.rc-name { font-size: 17px; font-weight: 700; color: #1e293b; }
.rc-meta { font-size: 14px; color: #94a3b8; }

/* ---- badge ---- */
.rc-badge-row { display: flex; }

.rc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.rc-badge--green { background: #dcfce7; color: #16a34a; }
.rc-badge--orange { background: #fff4e5; color: #ea580c; }
.rc-badge--blue { background: #dbeafe; color: #3b82f6; gap: 6px; }

.rc-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #3b82f6;
  animation: rc-pulse 1s infinite alternate;
}
@keyframes rc-pulse { 0%{opacity:1} 100%{opacity:.3} }

/* ---- toggle ---- */
.rc-toggle {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: rgba(0,0,0,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.rc-toggle:hover { background: rgba(0,0,0,0.08); color: #1e293b; }

/* ---- risk list ---- */
.rc-risks {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
}

.rc-risk-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rc-tag {
  flex-shrink: 0;
  padding: 2px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  border: 1.5px solid;
  background: transparent;
  white-space: nowrap;
}

.rc-risk-text {
  font-size: 15px;
  color: #334155;
}
</style>
