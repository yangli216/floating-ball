<template>
  <header class="patient-header" data-tauri-drag-region>
    <div class="patient-card">
      <div class="avatar">
        <Icon icon="mdi:account-circle" color="#ff9a9e" size="48" />
      </div>

      <div class="patient-name">{{ displayName }}</div>

      <div class="patient-basic" v-if="patientInfo">
        <span>{{ gender }}</span>
        <span class="divider" v-if="gender && age"></span>
        <span>{{ age }}</span>
      </div>

      <div class="tag-ai">🤖 AI 生成</div>

      <div class="contact-info" v-if="patientInfo?.idCard">
        <span>身份证号：{{ patientInfo.idCard }}</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="header-btn" @click="emit('cancel')">放弃</button>
      <button class="header-btn primary" @click="emit('confirm')" :disabled="confirmDisabled">
        <Icon icon="lucide:check" size="16" />
        确认提交
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import type { PatientInfo } from '../types/voiceResult';
import { getPatientContextAgeText, getPatientContextGenderText, getPatientContextName } from '../utils/patientContext';

const props = defineProps<{
  patientInfo?: PatientInfo | null;
  confirmDisabled?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const displayName = computed(() => getPatientContextName(props.patientInfo as any) || '未知患者');
const gender = computed(() => getPatientContextGenderText(props.patientInfo as any) || '');
const age = computed(() => getPatientContextAgeText(props.patientInfo as any) || '');
</script>

<style scoped>
.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: var(--surface-glass);
  padding: 10px 16px;
  box-shadow: var(--shadow-sm);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border-light);
  cursor: grab;
}

.patient-header:active {
  cursor: grabbing;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  margin-right: 16px;
  pointer-events: none;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-error-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.avatar svg {
  width: 24px;
  height: 24px;
}

.patient-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-strong);
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-medium);
}

.divider {
  width: 1px;
  height: 12px;
  background: var(--color-border-medium);
}

.tag-ai {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-muted);
  pointer-events: auto;
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.header-btn {
  padding: 8px 18px;
  border: 1px solid var(--color-border-medium);
  border-radius: 8px;
  background: var(--color-background-white);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--duration-normal) var(--ease-out);
}

.header-btn:hover {
  background: var(--color-background-hover);
  border-color: var(--color-border-strong);
}

.header-btn.primary {
  background: linear-gradient(135deg, var(--color-cta) 0%, var(--color-cta-dark) 100%);
  border: none;
  color: white;
  box-shadow: 0 4px 12px var(--color-primary-200);
}

.header-btn.primary:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px var(--color-primary-200);
}

.header-btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-btn svg {
  width: 16px;
  height: 16px;
}
</style>
