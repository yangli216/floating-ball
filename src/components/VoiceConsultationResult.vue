<template>
  <div class="result-page">
    <!-- 患者信息头部（与问诊页面一致） -->
    <header class="patient-header" data-tauri-drag-region>
      <div class="patient-card">
        <!-- Avatar -->
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="#ff9a9e"/>
          </svg>
        </div>
        
        <!-- Name -->
        <div class="patient-name">{{ patientInfo?.naPi || patientInfo?.name || '未知患者' }}</div>
        
        <!-- Basic Info -->
        <div class="patient-basic" v-if="patientInfo">
          <span>{{ patientInfo.sdSexText || patientInfo.sex || '' }}</span>
          <span class="divider" v-if="patientInfo.ageText || patientInfo.age"></span>
          <span>{{ patientInfo.ageText || patientInfo.age || '' }}</span>
        </div>

        <!-- AI 生成标签 -->
        <div class="tag-ai">🤖 AI 生成</div>

        <!-- Contact Info -->
        <div class="contact-info" v-if="patientInfo?.idCard">
          <span>身份证号：{{ patientInfo.idCard }}</span>
        </div>
      </div>

      <!-- Header Actions -->
      <div class="header-actions">
        <button class="header-btn" @click="emit('cancel')">放弃</button>
        <button class="header-btn primary" @click="handleConfirm" :disabled="!record">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          确认提交
        </button>
      </div>
    </header>

    <!-- 提示信息 -->
    <div class="info-banner" v-if="record">
      <span class="info-icon">💡</span>
      <span>以下内容由 AI 根据医患对话自动生成，请审核确认后提交</span>
    </div>

    <div class="content-body" v-if="record">
      <div class="form-section">
        <div class="section-title">
          <span class="icon">📝</span> 主诉 &amp; 现病史
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

export interface PatientInfo {
  naPi?: string;
  name?: string;
  sdSexText?: string;
  sex?: string;
  ageText?: string;
  age?: string;
  idCard?: string;
  mobilePhone?: string;
}

const props = defineProps<{
  initialRecord: GeneratedRecord | null;
  patientInfo?: PatientInfo | null;
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
  font-size: 14px;
  overflow: hidden;
}

/* 患者信息头部 - 与问诊页面一致 */
.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: linear-gradient(to right, #ffffff, #f0f9ff);
  padding: 10px 16px;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.08);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: 1px solid #e6f7ff;
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
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff0f1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffe4e6;
  flex-shrink: 0;
}

.avatar svg {
  width: 24px;
  height: 24px;
}

.patient-name {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #4b5563;
}

.divider {
  width: 1px;
  height: 12px;
  background: #d1d5db;
}

.tag-ai {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
  color: #6b7280;
}

/* Header Actions - 与问诊页面一致 */
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.header-btn {
  padding: 8px 18px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.header-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.header-btn.primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  color: white;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.header-btn.primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
}

.header-btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-btn svg {
  width: 16px;
  height: 16px;
}

/* 提示信息 */
.info-banner {
  background: #fffbeb;
  border-bottom: 1px solid #fde68a;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #92400e;
}

.info-icon {
  font-size: 16px;
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
