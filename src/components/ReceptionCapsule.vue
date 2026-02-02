<template>
  <div class="reception-layout">
    <!-- Main Capsule Bar -->
    <div class="reception-capsule" :class="{ 'is-expanded': showDetail && riskCount > 0 }" data-tauri-drag-region>
      <!-- Left: Avatar -->
      <div class="avatar-section">
        <div class="avatar-wrapper">
          <Icon :icon="avatarIcon" :color="avatarColor" size="40" />
        </div>
      </div>

      <!-- Center: Patient Info & Status -->
      <div class="info-section">
        <div class="patient-line">
          <span class="patient-name">{{ patientName }}</span>
          <span class="patient-meta">{{ genderText }} {{ age }}岁</span>
        </div>
        <div class="status-line">
          <span v-if="analyzing" class="status-analyzing">
            <span class="dot-flashing"></span> 正在评估健康风险...
          </span>
          <span v-else-if="riskCount > 0" class="status-risk" @click="toggleRiskDetail">
            <span class="risk-badge">⚠️ {{ riskCount }}项健康风险</span>
            <span class="risk-hint">{{ showDetail ? '收起详情' : '点击查看详情' }}</span>
          </span>
          <span v-else class="status-safe">
            ✅ 健康状况良好
          </span>
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="controls-section">
        <button class="control-btn primary" @click="trackClick('reception_close'); $emit('close')" title="结束接诊">
          <Icon icon="lucide:x" size="20" />
        </button>
      </div>
    </div>

    <!-- Risk Detail List (Expanded View) -->
    <div v-if="showDetail && riskCount > 0" class="risk-detail-panel">
      <div class="detail-header">风险详情</div>
      <div class="risk-list">
        <div v-for="(risk, idx) in risks" :key="idx" class="risk-item" :class="'level-' + risk.level">
          <span class="item-icon">{{ getRiskIcon(risk.level) }}</span>
          <div class="item-content-wrapper">
             <span class="item-cat">[{{ getRiskCategory(risk.category) }}]</span>
             <span class="item-text">{{ risk.content }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { trackClick, startTimedOperation } from '../services/operationTracker';

export interface RiskItem {
  level: 1 | 2 | 3;
  category: string;
  content: string;
}

interface Props {
  patientName: string;
  gender: 'M' | 'F';
  age: number;
  risks: RiskItem[];
  analyzing?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggle-expand', expanded: boolean): void;
}>();

const showDetail = ref(false);
let endAnalyzingTimer: ((success?: boolean, details?: Record<string, any>) => void) | null = null;

const genderText = computed(() => props.gender === 'F' ? '女' : '男');
const avatarIcon = computed(() => props.gender === 'F' ? 'mdi:human-female' : 'mdi:human-male');
const avatarColor = computed(() => props.gender === 'F' ? '#ff9a9e' : '#79c2ff');
const riskCount = computed(() => props.risks.length);

watch(() => props.analyzing, (isAnalyzing, wasAnalyzing) => {
  if (isAnalyzing && !wasAnalyzing) {
    endAnalyzingTimer = startTimedOperation('reception_risk_analysis');
  } else if (!isAnalyzing && wasAnalyzing && endAnalyzingTimer) {
    endAnalyzingTimer(true, { riskCount: props.risks.length, patientName: props.patientName });
    endAnalyzingTimer = null;
  }
});

watch(() => props.risks, (newRisks) => {
  if (newRisks.length > 0) {
    showDetail.value = true;
    emit('toggle-expand', true);
  } else {
    showDetail.value = false;
    emit('toggle-expand', false);
  }
}, { immediate: true });

const toggleRiskDetail = () => {
  if (riskCount.value === 0) return;
  showDetail.value = !showDetail.value;
  trackClick('reception_toggle_risk_detail', { expanded: showDetail.value, riskCount: riskCount.value });
  emit('toggle-expand', showDetail.value);
};

const getRiskIcon = (level: number) => {
  switch (level) {
    case 1: return '🔴';
    case 2: return '🟠';
    case 3: return '🟡';
    default: return '⚪';
  }
};

const getRiskCategory = (cat: string) => {
    const map: Record<string, string> = {
        'allergy': '过敏',
        'chronic': '慢病',
        'medication': '用药',
        'population': '人群',
        'vital': '体征',
        'other': '其他'
    };
    return map[cat] || '其他';
};
</script>

<style scoped>
/* ... layout ... */
.reception-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.reception-capsule {
  width: 100%;
  height: 80px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 12px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 40px; 
  position: relative;
  z-index: 2;
  transition: border-radius var(--duration-normal) var(--ease-out); /* Smooth transition */
}

/* When expanded, remove bottom border radius to merge with detail panel */
.reception-capsule.is-expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom: 1px solid #f1f5f9; /* Subtle separator */
}

.avatar-section {
  flex-shrink: 0;
  margin-right: 12px;
}

.avatar-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}

.avatar-wrapper svg {
  width: 28px;
  height: 28px;
}

.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.patient-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.patient-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.patient-meta {
  font-size: 12px;
  color: #64748b;
}

.status-line {
  font-size: 12px;
  display: flex;
  align-items: center;
  height: 20px;
}

.status-analyzing {
  color: var(--color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

/** Flashing dot animation **/
.dot-flashing {
  position: relative;
  width: 6px;
  height: 6px;
  border-radius: 5px;
  background-color: var(--color-primary);
  color: var(--color-primary);
  animation: dot-flashing 1s infinite linear alternate;
  animation-delay: 0.5s;
}

@keyframes dot-flashing {
  0% { background-color: var(--color-primary); }
  50%, 100% { background-color: rgba(59, 130, 246, 0.2); }
}

.status-risk {
  color: #ea580c;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background var(--duration-normal) var(--ease-out);
  user-select: none;
}

.status-risk:hover {
  background: #fff7ed;
}

.risk-badge {
  font-weight: 600;
}

.risk-hint {
  color: #94a3b8;
  font-size: 10px;
}

.status-safe {
  color: #10b981;
  font-weight: 500;
}

.controls-section {
  flex-shrink: 0;
  margin-left: 12px;
}

.control-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  background: #f1f5f9;
  color: #64748b;
}

.control-btn:hover {
  background: #cbd5e1;
  color: #1e293b;
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

/* Detail Panel */
.risk-detail-panel {
  flex: 1;
  background: #fff;
  /* border-top removed, handled by capsule bottom border */
  padding: 12px 16px;
  overflow-y: auto;
  box-shadow: inset 0 4px 6px -4px rgba(0,0,0,0.1);
  animation: slide-down 0.2s ease-out;
}

@keyframes slide-down {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.detail-header {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 8px;
}

.risk-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.risk-item {
  display: flex;
  align-items: start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.risk-item.level-1 { background: #fef2f2; color: #b91c1c; }
.risk-item.level-2 { background: #fff7ed; color: #c2410c; }
.risk-item.level-3 { background: #fefce8; color: #a16207; }

.item-icon {
  font-size: 14px;
  margin-top: 2px;
}

.item-content-wrapper {
    display: flex;
    flex-direction: column;
}

.item-cat {
    font-size: 11px;
    opacity: 0.8;
    margin-bottom: 2px;
}

.item-text {
    font-weight: 500;
}
</style>
