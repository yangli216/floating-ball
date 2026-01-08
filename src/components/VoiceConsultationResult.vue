<template>
  <div class="result-page">
    <header class="page-header" v-if="record">
      <div class="title-group">
        <h2>智能问诊生成结果</h2>
        <span class="sub-title">AI 根据医患对话自动生成，请审核</span>
      </div>
      <div class="actions">
        <button class="btn secondary" @click="emit('cancel')">放弃</button>
        <button class="btn primary" @click="handleConfirm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            确认
        </button>
      </div>
    </header>

    <div class="content-body" v-if="record">
      <div class="form-section">
        <div class="section-title">
          <span class="icon">📝</span> 主诉 & 现病史
        </div>
        <div class="field-group">
          <label>主诉 (Chief Complaint)</label>
          <textarea v-model="record.chiefComplaint" rows="2" class="full-width"></textarea>
        </div>
        <div class="field-group">
          <label>现病史 (HPI)</label>
          <textarea v-model="record.historyOfPresentIllness" rows="6" class="full-width"></textarea>
        </div>
      </div>

      <div class="form-split">
        <div class="form-section half">
          <div class="section-title">
            <span class="icon">🕒</span> 既往史 (Past History)
          </div>
           <textarea v-model="record.pastMedicalHistory" rows="5" class="full-width"></textarea>
        </div>
        <div class="form-section half">
          <div class="section-title">
            <span class="icon">🔍</span> 初步诊断 (Diagnosis)
          </div>
           <textarea v-model="record.diagnosis" rows="5" class="full-width"></textarea>
           <!-- TODO: Support structured diagnosis selection in future -->
        </div>
      </div>

      <div class="form-section">
        <div class="section-title">
          <span class="icon">💊</span> 处理意见 (Treatment Plan)
        </div>
        <textarea v-model="record.treatmentPlan" rows="4" class="full-width"></textarea>
      </div>
    </div>
    
    <div v-else class="loading-state">
      <div class="spinner"></div>
      <p>正在生成病历数据...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export interface GeneratedRecord {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  diagnosis: string;
  treatmentPlan: string;
}

const props = defineProps<{
  initialRecord: GeneratedRecord | null;
}>();

const emit = defineEmits(['confirm', 'cancel']);

const record = ref<GeneratedRecord | null>(null);

watch(() => props.initialRecord, (val) => {
  if (val) {
    record.value = JSON.parse(JSON.stringify(val)); // Deep copy to allow editing
  }
}, { immediate: true });

const handleConfirm = () => {
  emit('confirm', record.value);
};
</script>

<style scoped>
.result-page {
  width: 100%;
  height: 100%;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.title-group h2 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.sub-title {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
  display: block;
}

.actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn.primary {
  background: #3b82f6;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

.btn.primary:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.btn.secondary {
  background: #f1f5f9;
  color: #64748b;
}

.btn.secondary:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.content-body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.form-split {
  display: flex;
  gap: 20px;
}

.form-section.half {
  flex: 1;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 16px;
}

.icon {
  font-size: 16px;
}

.field-group {
  margin-bottom: 16px;
}

.field-group:last-child {
  margin-bottom: 0;
}

label {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 500;
}

textarea.full-width {
  width: 100%;
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: #1e293b;
  resize: vertical;
  background: #f8fafc;
  transition: all 0.2s;
  box-sizing: border-box;
}

textarea.full-width:focus {
  outline: none;
  border-color: #3b82f6;
  background: white;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Custom Scrollbar */
.content-body::-webkit-scrollbar {
  width: 6px;
}

.content-body::-webkit-scrollbar-track {
  background: transparent;
}

.content-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
</style>
