<template>
  <div class="risk-alert-panel">
    <!-- Patient Header -->
    <div class="patient-header">
      <div class="patient-avatar">
        <Icon :icon="avatarIcon" :color="avatarColor" size="48" />
      </div>
      <div class="patient-info">
        <span class="patient-name">{{ patientName }}</span>
        <span class="patient-meta">{{ genderText }} · {{ age }}岁</span>
      </div>
    </div>

    <!-- Risk List -->
    <div class="risk-list">
      <div 
        v-for="(risk, index) in sortedRisks" 
        :key="index"
        class="risk-tag"
        :class="getRiskClass(risk.level)"
      >
        <span class="risk-icon">{{ getRiskIcon(risk.level) }}</span>
        <span class="risk-content">{{ risk.content }}</span>
      </div>
    </div>

    <!-- Confirm Button -->
    <div class="action-area">
      <button v-if="hasCriticalRisk" class="confirm-btn" @click="handleConfirm">
        <Icon icon="lucide:check" size="20" />
        我已知悉
      </button>
      <div v-else class="countdown-area">
        <span class="countdown-text">{{ countdown }}秒后自动关闭</span>
        <button class="close-btn-text" @click="handleClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';

export interface RiskItem {
  level: 1 | 2 | 3;
  category: 'allergy' | 'chronic' | 'medication' | 'population' | 'vital' | 'other';
  content: string;
}

interface Props {
  patientName: string;
  gender: 'M' | 'F';
  age: number;
  risks: RiskItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();

const countdown = ref(10);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

// Check if there are level 1 or 2 risks (critical)
const hasCriticalRisk = computed(() => {
  return props.risks.some(r => r.level === 1 || r.level === 2);
});

// Sort risks by level (1 first, then 2, then 3)
const sortedRisks = computed(() => {
  return [...props.risks].sort((a, b) => a.level - b.level);
});

const genderText = computed(() => props.gender === 'F' ? '女' : '男');

const avatarIcon = computed(() => props.gender === 'F' ? 'mdi:human-female' : 'mdi:human-male');
const avatarColor = computed(() => props.gender === 'F' ? '#ff9a9e' : '#79c2ff');

const getRiskClass = (level: number) => {
  switch (level) {
    case 1: return 'level-1';
    case 2: return 'level-2';
    case 3: return 'level-3';
    default: return '';
  }
};

const getRiskIcon = (level: number) => {
  switch (level) {
    case 1: return '🔴';
    case 2: return '🟠';
    case 3: return '🟡';
    default: return '⚪';
  }
};

const handleClose = () => {
  emit('close');
};

const handleConfirm = () => {
  emit('confirm');
};

// Auto-close countdown for non-critical risks
onMounted(() => {
  if (!hasCriticalRisk.value) {
    countdown.value = 10;
    countdownTimer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        if (countdownTimer) clearInterval(countdownTimer);
        emit('close');
      }
    }, 1000);
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});
</script>

<style scoped>
.risk-alert-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.patient-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.patient-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.patient-avatar svg {
  width: 24px;
  height: 24px;
}

.patient-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.patient-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.patient-meta {
  font-size: 13px;
  color: #64748b;
}

.risk-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.risk-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
}

.risk-tag.level-1 {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.risk-tag.level-2 {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #ea580c;
}

.risk-tag.level-3 {
  background: #fefce8;
  border: 1px solid #fef08a;
  color: #ca8a04;
}

.risk-icon {
  font-size: 14px;
  line-height: 1;
}

.risk-content {
  flex: 1;
}

.action-area {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.confirm-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all var(--duration-normal) var(--ease-out);
}

.confirm-btn svg {
  width: 18px;
  height: 18px;
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--color-primary-200);
}

.confirm-btn:active {
  transform: translateY(0);
}

.countdown-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.countdown-text {
  font-size: 13px;
  color: #94a3b8;
}

.close-btn-text {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.04);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.close-btn-text:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #1e293b;
}
</style>
