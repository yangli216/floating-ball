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
      <div class="main-layout">
        <!-- Left Column: Medical History -->
        <div class="left-col">
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
              <textarea v-model="record.historyOfPresentIllness" rows="8" class="full-width"></textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="section-title">
              <span class="icon">🕒</span> 既往史 (Past History)
            </div>
             <textarea v-model="record.pastMedicalHistory" rows="5" class="full-width"></textarea>
          </div>
        </div>

        <!-- Right Column: Diagnosis & Treatment -->
        <div class="right-col">
          <!-- Diagnosis List -->
          <div class="form-section">
            <div class="section-title">
              <span class="icon">🔍</span> 初步诊断 (Diagnosis)
            </div>
            <div class="list-container">
              <div v-for="(diag, idx) in record.diagnosisList" :key="idx" class="list-item diagnosis-item">
                <div class="item-content">
                  <span class="item-name">{{ diag.name }}</span>
                  <span class="item-code" v-if="diag.code">({{ diag.code }})</span>
                  <span class="match-tag" v-if="diag.matched" title="已匹配本地数据">✓</span>
                </div>
              </div>
              <div v-if="!record.diagnosisList?.length" class="empty-text">暂无诊断信息</div>
            </div>
          </div>

          <!-- Treatment Plan -->
          <div class="form-section">
            <div class="section-title">
              <span class="icon">💊</span> 治疗方案 (Treatment)
            </div>
            
            <!-- Medications -->
            <div class="sub-section" v-if="record.medications?.length">
              <div class="sub-title">药品清单</div>
              <div class="list-container">
                <div v-for="(med, idx) in record.medications" :key="idx" class="list-item med-item">
                  <div class="item-header">
                    <span class="med-name">{{ med.name }}</span>
                    <span class="med-spec" v-if="med.spec">{{ med.spec }}</span>
                    <span class="match-tag" v-if="med.matched">✓</span>
                  </div>
                  <div class="item-detail">
                    <span v-if="med.dosage">每次 {{ med.dosage }}</span>
                    <span v-if="med.frequency">{{ med.frequency }}</span>
                    <span v-if="med.usage">{{ med.usage }}</span>
                    <span v-if="med.count" class="med-count">共 {{ med.count }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Examinations -->
            <div class="sub-section" v-if="record.examinations?.length">
              <div class="sub-title">检验检查</div>
              <div class="list-container">
                <div v-for="(exam, idx) in record.examinations" :key="idx" class="list-item exam-item">
                  <span class="item-name">{{ exam.name }}</span>
                  <span class="match-tag" v-if="exam.matched">✓</span>
                </div>
              </div>
            </div>

            <!-- Other Treatment -->
            <div class="sub-section" v-if="record.treatmentPlan">
              <div class="sub-title">其他处理</div>
              <textarea v-model="record.treatmentPlan" rows="3" class="full-width small-text"></textarea>
            </div>
          </div>

          <!-- Health Education -->
          <div class="form-section">
            <div class="section-title">
              <span class="icon">📢</span> 健康宣教 (Education)
            </div>
            <textarea v-model="record.healthEducation" rows="4" class="full-width"></textarea>
          </div>
        </div>
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
import { medicalDataService } from '../services/medicalData';

export interface DiagnosisEntry {
  name: string;
  code?: string;
  matched?: boolean;
}

export interface MedicationEntry {
  name: string;
  spec?: string;
  dosage?: string;
  frequency?: string;
  usage?: string;
  count?: string;
  matched?: boolean;
}

export interface ExamEntry {
  name: string;
  goal?: string;
  matched?: boolean;
}

export interface GeneratedRecord {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  diagnosisList: DiagnosisEntry[];
  medications: MedicationEntry[];
  examinations: ExamEntry[];
  treatmentPlan?: string;
  healthEducation?: string;
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

// Match data with local database
const matchLocalData = (rec: GeneratedRecord) => {
  // 1. Match Diagnoses
  if (rec.diagnosisList) {
    rec.diagnosisList.forEach(d => {
      if (!d.code) { // Only match if no code provided by LLM (or if we want to override/validate)
        const match = medicalDataService.matchDiagnosis(d.name);
        if (match) {
          d.name = match.name; // Normalize name
          d.code = match.code;
          d.matched = true;
        }
      }
    });
  }

  // 2. Match Medications
  if (rec.medications) {
    rec.medications.forEach(m => {
      const match = medicalDataService.matchMedicine(m.name);
      if (match) {
        m.name = match.name; // Normalize name
        if (!m.spec) m.spec = match.spec;
        m.matched = true;
      }
    });
  }

  // 3. Match Examinations
  if (rec.examinations) {
    rec.examinations.forEach(e => {
        const match = medicalDataService.matchItem(e.name);
        if (match) {
            e.name = match.name;
            e.matched = true;
        }
    });
  }
};

watch(() => props.initialRecord, (val) => {
  if (val) {
    const newVal = JSON.parse(JSON.stringify(val));
    matchLocalData(newVal);
    record.value = newVal;
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
  pointer-events: none; /* Allow drag through */
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
  pointer-events: auto; /* Re-enable for text selection if needed, though usually not needed for drag */
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

/* Main Layout */
.main-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  gap: 16px;
}

.left-col {
  flex: 1; /* 50% */
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 4px;
}

.right-col {
  flex: 1; /* 50% */
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 4px;
}

/* Sections */
.form-section {
  background: white;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.sub-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 12px;
}

.icon {
  font-size: 16px;
}

.field-group {
  margin-bottom: 12px;
}

.field-group:last-child {
  margin-bottom: 0;
}

label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
  font-weight: 500;
}

/* Text Areas */
textarea.full-width {
  width: 100%;
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
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

textarea.small-text {
  font-size: 13px;
  padding: 8px;
}

/* Lists */
.list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
}

.diagnosis-item .item-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  font-weight: 500;
  color: #1e293b;
}

.item-code {
  color: #64748b;
  font-size: 12px;
  background: #e2e8f0;
  padding: 1px 6px;
  border-radius: 4px;
}

.match-tag {
  margin-left: auto;
  color: #10b981;
  font-weight: bold;
  font-size: 12px;
}

.med-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.med-name {
  font-weight: 600;
  color: #1e293b;
}

.med-spec {
  font-size: 12px;
  color: #64748b;
  background: #e2e8f0;
  padding: 1px 6px;
  border-radius: 4px;
}

.item-detail {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #475569;
}

.med-count {
  margin-left: auto;
  color: #64748b;
}

.exam-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-text {
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}

/* Loading State */
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
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

</style>
