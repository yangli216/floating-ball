<template>
  <div class="result-page">
    <!-- 患者信息头部（与问诊页面一致） -->
    <header class="patient-header" data-tauri-drag-region>
      <div class="patient-card">
        <!-- Avatar -->
        <div class="avatar">
          <Icon icon="mdi:account-circle" color="#ff9a9e" size="48" />
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
          <Icon icon="lucide:check" size="16" />
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
                  <FactCheckHighlight :issue="getIssueForDiagnosis(diag.name)">
                    <span class="item-name">{{ diag.name }}</span>
                  </FactCheckHighlight>
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
                    <FactCheckHighlight :issue="getIssueForMedicine(med.name)">
                      <span class="med-name">{{ med.name }}</span>
                    </FactCheckHighlight>
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
                  <FactCheckHighlight :issue="getIssueForExam(exam.name)">
                    <span class="item-name">{{ exam.name }}</span>
                  </FactCheckHighlight>
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

    <!-- Fact Check Notification -->
    <FactCheckNotification
      v-model="showFactCheckNotification"
      :result="factCheckResult"
      @confirm="showFactCheckNotification = false"
      @view-details="showFactCheckNotification = false"
    />

    <!-- Fact Check Widget (Right Bottom Corner) -->
    <FactCheckWidget
      :visible="showFactCheckWidget"
      :status="factCheckWidgetStatus"
      :issues="factCheckWidgetIssues"
      :progress="factCheckProgress"
      :checked-count="factCheckCheckedCount"
      :total-count="factCheckTotalCount"
      @close="showFactCheckWidget = false"
      @view-all="showFactCheckWidget = false"
      @issue-click="(issue) => console.log('Issue clicked:', issue)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { medicalDataService } from '../services/medicalData';
import Icon from './Icon.vue';
import FactCheckNotification from './FactCheckNotification.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import FactCheckWidget from './FactCheckWidget.vue';
import { checkDiagnosis, checkMedicine, checkExamination, checkMedicalRecord, type FactCheckResult, type FactCheckIssue } from '../services/factChecker';

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

// Fact Check State
const showFactCheckNotification = ref(false);
const factCheckResult = ref<FactCheckResult | null>(null);
const diagnosisFactChecks = ref<Map<string, FactCheckResult>>(new Map());
const medicineFactChecks = ref<Map<string, FactCheckResult>>(new Map());
const examFactChecks = ref<Map<string, FactCheckResult>>(new Map());

// Fact Check Widget State
const showFactCheckWidget = ref(false);
const factCheckWidgetStatus = ref<'idle' | 'checking' | 'completed'>('idle');
const factCheckWidgetIssues = ref<FactCheckIssue[]>([]);
const factCheckProgress = ref(0);
const factCheckCheckedCount = ref(0);
const factCheckTotalCount = ref(0);

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

    // Perform automatic fact checking after data is loaded
    performMedicalRecordFactCheck(newVal);
  }
}, { immediate: true });

// Fact Check Functions
const performMedicalRecordFactCheck = async (rec: GeneratedRecord) => {
  if (!rec) return;

  // Calculate total checks
  const diagCount = rec.diagnosisList?.length || 0;
  const medCount = rec.medications?.length || 0;
  const examCount = rec.examinations?.length || 0;
  const totalChecks = diagCount + medCount + examCount + 1; // +1 for overall record check

  // Show widget in checking state
  showFactCheckWidget.value = true;
  factCheckWidgetStatus.value = 'checking';
  factCheckTotalCount.value = totalChecks;
  factCheckCheckedCount.value = 0;
  factCheckProgress.value = 0;
  factCheckWidgetIssues.value = [];

  try {
    // Check overall medical record consistency
    const result = await checkMedicalRecord({
      chiefComplaint: rec.chiefComplaint,
      historyOfPresentIllness: rec.historyOfPresentIllness,
      diagnoses: rec.diagnosisList?.map(d => d.name) || [],
      medicines: rec.medications?.map(m => m.name) || [],
      examinations: rec.examinations?.map(e => e.name) || []
    });

    if (result.hasIssues) {
      factCheckWidgetIssues.value.push(...result.issues);
    }

    factCheckCheckedCount.value = 1;
    factCheckProgress.value = Math.round((1 / totalChecks) * 100);

    // Check each diagnosis individually
    if (rec.diagnosisList && rec.diagnosisList.length > 0) {
      for (let i = 0; i < rec.diagnosisList.length; i++) {
        const diag = rec.diagnosisList[i];
        const diagResult = await checkDiagnosis({
          diagnosis: diag.name,
          chiefComplaint: rec.chiefComplaint,
          historyOfPresentIllness: rec.historyOfPresentIllness
        });
        diagnosisFactChecks.value.set(diag.name, diagResult);

        if (diagResult.hasIssues) {
          factCheckWidgetIssues.value.push(...diagResult.issues);
        }

        factCheckCheckedCount.value = 1 + i + 1;
        factCheckProgress.value = Math.round(((1 + i + 1) / totalChecks) * 100);
      }
    }

    // Check each medicine
    if (rec.medications && rec.medications.length > 0) {
      for (let i = 0; i < rec.medications.length; i++) {
        const med = rec.medications[i];
        const medResult = await checkMedicine({
          medicineName: med.name,
          specification: med.spec,
          dosage: med.dosage,
          frequency: med.frequency,
          diagnosis: rec.diagnosisList?.[0]?.name
        });
        medicineFactChecks.value.set(med.name, medResult);

        if (medResult.hasIssues) {
          factCheckWidgetIssues.value.push(...medResult.issues);
        }

        const currentCount = 1 + diagCount + i + 1;
        factCheckCheckedCount.value = currentCount;
        factCheckProgress.value = Math.round((currentCount / totalChecks) * 100);
      }
    }

    // Check each examination
    if (rec.examinations && rec.examinations.length > 0) {
      for (let i = 0; i < rec.examinations.length; i++) {
        const exam = rec.examinations[i];
        const examResult = await checkExamination({
          examinationName: exam.name,
          diagnosis: rec.diagnosisList?.[0]?.name
        });
        examFactChecks.value.set(exam.name, examResult);

        if (examResult.hasIssues) {
          factCheckWidgetIssues.value.push(...examResult.issues);
        }

        const currentCount = 1 + diagCount + medCount + i + 1;
        factCheckCheckedCount.value = currentCount;
        factCheckProgress.value = Math.round((currentCount / totalChecks) * 100);
      }
    }

    // Update widget to completed state
    factCheckWidgetStatus.value = 'completed';
  } catch (e) {
    console.error('Failed to perform medical record fact check:', e);
    factCheckWidgetStatus.value = 'completed';
  }
};

const getIssueForDiagnosis = (diagName: string): FactCheckIssue | undefined => {
  const check = diagnosisFactChecks.value.get(diagName);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0];
};

const getIssueForMedicine = (medName: string): FactCheckIssue | undefined => {
  const check = medicineFactChecks.value.get(medName);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0];
};

const getIssueForExam = (examName: string): FactCheckIssue | undefined => {
  const check = examFactChecks.value.get(examName);
  if (!check || !check.hasIssues || check.issues.length === 0) return undefined;
  return check.issues[0];
};

const handleConfirm = () => {
  emit('confirm', record.value);
};
</script>

<style scoped>
.result-page {
  width: 100%;
  height: 100%;
  background: var(--color-background);
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
  pointer-events: none; /* Allow drag through */
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

/* 提示信息 */
.info-banner {
  background: var(--color-warning-bg);
  border-bottom: 1px solid var(--color-warning);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-warning-text);
}

.info-icon {
  font-size: 16px;
}

.title-group h2 {
  margin: 0;
  font-size: 18px;
  color: var(--color-text-strong);
}

.sub-title {
  font-size: 13px;
  color: var(--color-text-muted);
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
  transition: all var(--duration-normal) var(--ease-out);
}

.btn.primary {
  background: var(--color-cta);
  color: white;
  box-shadow: 0 4px 12px var(--color-primary-200);
}

.btn.primary:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn.secondary {
  background: var(--color-background-gray);
  color: var(--color-text-muted);
}

.btn.secondary:hover {
  background: var(--color-background-hover);
  color: var(--color-text-strong);
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
  background: var(--color-background-white);
  padding: 16px;
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border-light);
}

.sub-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--color-border-light);
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-strong);
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
  color: var(--color-text-muted);
  margin-bottom: 4px;
  font-weight: 500;
}

/* Text Areas */
textarea.full-width {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border-medium);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-strong);
  resize: vertical;
  background: var(--color-background);
  transition: all var(--duration-normal) var(--ease-out);
  box-sizing: border-box;
}

textarea.full-width:focus {
  outline: none;
  border-color: var(--color-primary);
  background: var(--color-background-white);
  box-shadow: 0 0 0 3px var(--color-primary-100);
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
  background: var(--color-background);
  border: 1px solid var(--color-border-light);
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
  color: var(--color-text-strong);
}

.item-code {
  color: var(--color-text-muted);
  font-size: 12px;
  background: var(--color-background-gray);
  padding: 1px 6px;
  border-radius: 4px;
}

.match-tag {
  margin-left: auto;
  color: var(--color-success);
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
  color: var(--color-text-strong);
}

.med-spec {
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-background-gray);
  padding: 1px 6px;
  border-radius: 4px;
}

.item-detail {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--color-text-medium);
}

.med-count {
  margin-left: auto;
  color: var(--color-text-muted);
}

.exam-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-text {
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
  padding: 10px;
  background: var(--color-background);
  border-radius: 6px;
  border: 1px dashed var(--color-border-medium);
}

/* Loading State */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
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
  background: var(--color-border-medium);
  border-radius: 3px;
}

/* Content Body */
.content-body {
  flex: 1;
  padding: 16px;
  overflow: hidden;
}
</style>
