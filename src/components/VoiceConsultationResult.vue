<template>
  <div class="result-page">
    <VoiceResultHeader
      :patient-info="patientInfo"
      :confirm-disabled="!record"
      @cancel="handleCancel"
      @confirm="handleConfirm"
    />

    <!-- 提示信息 -->
    <div class="info-banner" v-if="record">
      <span class="info-icon">💡</span>
      <span>以下内容由 AI 根据医患对话自动生成，请审核确认后提交</span>
    </div>

    <VoiceRigidBlockBanner
      :alerts="rigidBlockAlerts"
      :is-acknowledged="isRigidBlockAcknowledged"
      @acknowledge="acknowledgeRigidBlock"
    />

    <VoiceSafetyReviewPanel
      :status="safetyReviewStatus"
      :issues="safetyReviewIssues"
      :error-message="safetyReviewError"
      :get-action-label="getSafetyIssueActionLabel"
      @acknowledge="acknowledgeSafetyIssue"
      @dismiss="dismissSafetyIssue"
      @apply="applySafetyIssue"
    />

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
              <textarea v-model="record.chiefComplaint" rows="2" class="full-width" @blur="trackFieldEdit('chiefComplaint')"></textarea>
            </div>
            <div class="field-group">
              <label>现病史 (HPI)</label>
              <textarea v-model="record.historyOfPresentIllness" rows="8" class="full-width" @blur="trackFieldEdit('historyOfPresentIllness')"></textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="section-title">
              <span class="icon">🕒</span> 既往史 (Past History)
            </div>
             <textarea v-model="record.pastMedicalHistory" rows="5" class="full-width" @blur="trackFieldEdit('pastMedicalHistory')"></textarea>
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
                    <span class="item-name">
                      <span v-if="diag.isTCM" class="tcm-badge">中</span>
                      {{ diag.name }}
                    </span>
                  </FactCheckHighlight>
                  <span class="item-code" v-if="diag.code">({{ diag.code }})</span>
                  <span class="match-tag" v-if="diag.matched" title="已匹配本地数据">✓</span>
                </div>
                <!-- 中医证候和治法 -->
                <div v-if="diag.isTCM" class="tcm-detail">
                  <div v-if="diag.syndrome" class="tcm-syndrome">
                    <span class="tcm-label">证候:</span>
                    <span class="tcm-value">{{ diag.syndrome }}</span>
                    <span class="item-code" v-if="diag.syndromeCode">({{ diag.syndromeCode }})</span>
                    <span class="match-tag" v-if="diag.syndromeMatched" title="已匹配证候数据">✓</span>
                  </div>
                  <div v-if="diag.treatment" class="tcm-treatment">
                    <span class="tcm-label">治法:</span>
                    <span class="tcm-value">{{ diag.treatment }}</span>
                    <span class="item-code" v-if="diag.treatmentCode">({{ diag.treatmentCode }})</span>
                    <span class="match-tag" v-if="diag.treatmentMatched" title="已匹配治法数据">✓</span>
                  </div>
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
              <div class="sub-title">检查项目</div>
              <div class="list-container">
                <div v-for="(exam, idx) in record.examinations" :key="idx" class="list-item exam-item">
                  <FactCheckHighlight :issue="getIssueForExam(exam.name)">
                    <span class="item-name">{{ exam.name }}</span>
                  </FactCheckHighlight>
                  <span class="match-tag" v-if="exam.matched">✓</span>
                </div>
              </div>
            </div>

            <!-- Lab Tests -->
            <div class="sub-section" v-if="record.labTests?.length">
              <div class="sub-title">检验项目</div>
              <div class="list-container">
                <div v-for="(test, idx) in record.labTests" :key="idx" class="list-item exam-item">
                  <span class="item-name">{{ test.name }}</span>
                  <span class="match-tag" v-if="test.matched">✓</span>
                </div>
              </div>
            </div>

            <!-- Procedures -->
            <div class="sub-section" v-if="record.procedures?.length">
              <div class="sub-title">临床处置</div>
              <div class="list-container">
                <div v-for="(proc, idx) in record.procedures" :key="idx" class="list-item exam-item">
                  <span class="item-name">{{ proc.name }}</span>
                  <span class="match-tag" v-if="proc.matched">✓</span>
                </div>
              </div>
            </div>

            <!-- Other Treatment -->
            <div class="sub-section" v-if="record.treatmentPlan">
              <div class="sub-title">其他处理</div>
              <textarea v-model="record.treatmentPlan" rows="3" class="full-width small-text" @blur="trackFieldEdit('treatmentPlan')"></textarea>
            </div>
          </div>

          <!-- Health Education -->
          <div class="form-section">
            <div class="section-title">
              <span class="icon">📢</span> 健康宣教 (Education)
            </div>
            <textarea v-model="record.healthEducation" rows="4" class="full-width" @blur="trackFieldEdit('healthEducation')"></textarea>
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

    <!-- Knowledge Panel Toggle Button -->
    <button
      v-if="hasKnowledgeResults || knowledgeLoading"
      class="knowledge-toggle-btn"
      :class="{ loading: knowledgeLoading, active: showKnowledgePanel }"
      @click="toggleKnowledgePanel"
      :title="knowledgeLoading ? '正在搜索相关文献...' : '查看相关医学文献'"
    >
      <span v-if="knowledgeLoading" class="spinner-small"></span>
      <span v-else class="knowledge-icon">📚</span>
      <span v-if="!knowledgeLoading && hasKnowledgeResults" class="knowledge-badge">!</span>
    </button>

    <!-- Knowledge Panel -->
    <KnowledgePanel
      v-model:visible="showKnowledgePanel"
      :loading="knowledgeLoading"
      :results="knowledgeResults"
      @close="showKnowledgePanel = false"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { trackClick } from '../services/operationTracker';
import FactCheckNotification from './FactCheckNotification.vue';
import FactCheckHighlight from './FactCheckHighlight.vue';
import FactCheckWidget from './FactCheckWidget.vue';
import KnowledgePanel from './KnowledgePanel.vue';
import VoiceSafetyReviewPanel from './VoiceSafetyReviewPanel.vue';
import VoiceRigidBlockBanner from './VoiceRigidBlockBanner.vue';
import VoiceResultHeader from './VoiceResultHeader.vue';
import { useVoiceCatalogMatching } from '../composables/useVoiceCatalogMatching';
import { useVoiceKnowledgeSearch } from '../composables/useVoiceKnowledgeSearch';
import { useVoiceResultRecord } from '../composables/useVoiceResultRecord';
import { useVoiceResultFactCheck } from '../composables/useVoiceResultFactCheck';
import { useVoiceSafetyReview } from '../composables/useVoiceSafetyReview';
import { useVoiceRigidBlock } from '../composables/useVoiceRigidBlock';
import { useSafetyIssueResolver } from '../composables/useSafetyIssueResolver';
import type { GeneratedRecord, PatientInfo, VoiceSafetyIssue } from '../types/voiceResult';

const props = defineProps<{
  initialRecord: GeneratedRecord | null;
  patientInfo?: PatientInfo | null;
}>();

const emit = defineEmits(['confirm', 'cancel']);

const { matchLocalData } = useVoiceCatalogMatching();
const {
  record,
  loadRecord,
  trackFieldEdit,
  trackConfirmAdoption,
} = useVoiceResultRecord();
const {
  showFactCheckNotification,
  factCheckResult,
  showFactCheckWidget,
  factCheckWidgetStatus,
  factCheckWidgetIssues,
  factCheckProgress,
  factCheckCheckedCount,
  factCheckTotalCount,
  performMedicalRecordFactCheck,
  getIssueForDiagnosis,
  getIssueForMedicine,
  getIssueForExam,
} = useVoiceResultFactCheck();
const {
  showKnowledgePanel,
  knowledgeLoading,
  knowledgeResults,
  hasKnowledgeResults,
  searchKnowledgeBase,
  toggleKnowledgePanel,
} = useVoiceKnowledgeSearch();
const {
  status: safetyReviewStatus,
  activeIssues: safetyReviewIssues,
  errorMessage: safetyReviewError,
  needsSubmitAwareness,
  runSafetyReview,
  acknowledgeIssue: acknowledgeSafetyIssue,
  dismissIssue: dismissSafetyIssue,
  acknowledgeAllHighRisk,
} = useVoiceSafetyReview();
const {
  alerts: rigidBlockAlerts,
  unacknowledgedBlocks,
  requiresConfirmation: requiresRigidConfirmation,
  evaluate: evaluateRigidBlocks,
  acknowledge: acknowledgeRigidBlock,
  acknowledgeAllBlocks: acknowledgeAllRigidBlocks,
  isAcknowledged: isRigidBlockAcknowledged,
} = useVoiceRigidBlock();

const { getPlan: getSafetyIssuePlan, applyPlan: applySafetyIssuePlan } = useSafetyIssueResolver({
  getRecord: () => record.value,
  onRecordUpdated: (next) => {
    matchLocalData(next);
    runSafetyReview(next, props.patientInfo);
    evaluateRigidBlocks(next, props.patientInfo);
  },
});

function getSafetyIssueActionLabel(issue: VoiceSafetyIssue): string {
  const plan = getSafetyIssuePlan(issue);
  return plan.kind === 'none' ? '' : plan.actionLabel;
}

function applySafetyIssue(issueId: string): void {
  const issue = safetyReviewIssues.value.find(i => i.id === issueId);
  if (!issue) return;
  const plan = applySafetyIssuePlan(issue);
  if (plan.kind === 'none') return;
  trackClick('voice_safety_issue_applied', {
    issueId,
    category: issue.category,
    actionKind: plan.kind,
    affected: plan.kind === 'remove_medications'
      ? plan.targetNames.length
      : plan.kind === 'add_lab_tests'
        ? plan.itemsToAdd.length
        : 0,
  });
  // 采纳后自动标记已知晓，避免医生再次手动点击
  acknowledgeSafetyIssue(issueId);
}

watch(() => props.initialRecord, (val) => {
  if (val) {
    const newVal = loadRecord(val);
    matchLocalData(newVal);
    performMedicalRecordFactCheck(newVal);
    runSafetyReview(newVal, props.patientInfo);
    evaluateRigidBlocks(newVal, props.patientInfo);
    searchKnowledgeBase(newVal);
  }
}, { immediate: true });

// 医生编辑诊断/处方/过敏史后重新评估刚性规则（同步、轻量）
watch(
  () => [
    record.value?.diagnosisList?.map(d => d.name).join('|'),
    record.value?.medications?.map(m => `${m.name}${m.spec || ''}${m.dosage || ''}`).join('|'),
    props.patientInfo?.allergyHistory,
    props.patientInfo?.sdSexText ?? props.patientInfo?.sex,
    props.patientInfo?.ageText ?? props.patientInfo?.age,
  ],
  () => {
    if (record.value) {
      evaluateRigidBlocks(record.value, props.patientInfo);
    }
  },
);

const handleConfirm = () => {
  if (requiresRigidConfirmation.value) {
    const titles = unacknowledgedBlocks.value.map(a => `• ${a.title}`).join('\n');
    const confirmed = window.confirm(
      `检测到以下刚性安全阻断项尚未确认：\n${titles}\n\n是否确认已知晓并继续提交？`,
    );
    if (!confirmed) return;
    acknowledgeAllRigidBlocks();
  }

  if (needsSubmitAwareness.value) {
    const confirmed = window.confirm('仍有高危安全提醒未处理，是否确认已知晓并继续提交？');
    if (!confirmed) return;
    acknowledgeAllHighRisk();
  }

  trackConfirmAdoption();
  emit('confirm', record.value);
};

const handleCancel = () => {
  trackClick('voice_result_cancel');
  emit('cancel');
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.tcm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #C9A063 0%, #B8860B 100%);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.tcm-detail {
  margin-top: 8px;
  margin-left: 24px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(201, 160, 99, 0.05) 0%, rgba(184, 134, 11, 0.05) 100%);
  border-left: 3px solid #C9A063;
  border-radius: 4px;
  font-size: 13px;
}

.tcm-syndrome,
.tcm-treatment {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.tcm-syndrome:last-child,
.tcm-treatment:last-child {
  margin-bottom: 0;
}

.tcm-label {
  color: #B8860B;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 40px;
}

.tcm-value {
  color: var(--color-text-strong);
  font-weight: 500;
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

/* Knowledge Panel Toggle Button */
.knowledge-toggle-btn {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
  z-index: 99;
}

.knowledge-toggle-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}

.knowledge-toggle-btn.active {
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
}

.knowledge-toggle-btn.loading {
  background: var(--color-background-gray);
  cursor: wait;
}

.knowledge-icon {
  font-size: 22px;
}

.knowledge-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  background: var(--color-success, #10b981);
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
