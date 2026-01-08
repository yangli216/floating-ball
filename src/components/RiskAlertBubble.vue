<template>
  <Transition name="bubble">
    <div v-if="visible" class="risk-bubble" :class="{ 'has-critical': hasCriticalRisk }">
      <!-- Patient Header -->
      <div class="bubble-header">
        <div class="patient-info">
          <span class="patient-name">{{ patientName }}</span>
          <span class="patient-meta">{{ genderText }} · {{ age }}岁</span>
        </div>
        <button 
          v-if="!hasCriticalRisk" 
          class="close-btn" 
          @click="handleClose"
          title="关闭"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Risk Tags -->
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

      <!-- Confirm Button (for critical risks) -->
      <div v-if="hasCriticalRisk" class="confirm-area">
        <button class="confirm-btn" @click="handleConfirm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          我已知悉
        </button>
      </div>

      <!-- Auto-close countdown -->
      <div v-else-if="countdown > 0" class="countdown">
        {{ countdown }}秒后自动关闭
      </div>

      <!-- Bubble Arrow -->
      <div class="bubble-arrow"></div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';

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
  visible: boolean;
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
watch(() => props.visible, (newVal) => {
  if (newVal && !hasCriticalRisk.value) {
    countdown.value = 10;
    countdownTimer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        if (countdownTimer) clearInterval(countdownTimer);
        emit('close');
      }
    }, 1000);
  } else {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }
}, { immediate: true });

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});
</script>

<style scoped>
.risk-bubble {
  position: fixed;
  top: 130px;  /* 悬浮球容器 160px 中心偏下 */
  left: 10px;  /* 左侧对齐，留出边距 */
  width: 260px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.6);
  padding: 14px;
  z-index: 1000;
}

.risk-bubble.has-critical {
  border: 2px solid #ef4444;
  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08);
}

.bubble-arrow {
  position: absolute;
  top: -8px;
  left: 70px;  /* 指向悬浮球中心（约80px） */
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 10px solid rgba(255, 255, 255, 0.98);
}

.risk-bubble.has-critical .bubble-arrow {
  border-bottom-color: #fef2f2;
}

.bubble-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.patient-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn svg {
  width: 14px;
  height: 14px;
  color: #64748b;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.close-btn:hover svg {
  color: #ef4444;
}

.risk-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.risk-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
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
  font-size: 12px;
  line-height: 1;
}

.risk-content {
  flex: 1;
}

.confirm-area {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.confirm-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.confirm-btn svg {
  width: 16px;
  height: 16px;
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.confirm-btn:active {
  transform: translateY(0);
}

.countdown {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

/* Transition animations */
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px) scale(0.9);
}
</style>
