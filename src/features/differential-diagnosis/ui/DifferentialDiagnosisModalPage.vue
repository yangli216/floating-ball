<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { PROMPTS } from '@/prompts';
import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import {
  buildDiagnosisChecklistMismatchError,
  buildDiagnosisChecklistRiskIssues,
  normalizeDiagnosisChecklistItems,
  parseDiagnosisChecklistResponse,
  type DiagnosisChecklistItem,
  type DiagnosisChecklistRiskIssue,
} from '@features/clinical-result';
import type { AppPatient } from '@/types/appState';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import SvgIcon from "@/components/svgIcon.vue";

const props = defineProps<{
  patient: AppPatient | null;
}>();

const emit = defineEmits(['close']);

const showToast = inject<(msg: string, type?: string) => void>('showToast');

const isChecklistLoading = ref(false);
const checklistItems = ref<DiagnosisChecklistItem[]>([]);
const riskIssues = ref<DiagnosisChecklistRiskIssue[]>([]);
const hasRequested = ref(false);
const generationError = ref('');
const isCollapsed = ref(false);

const diagnosisName = computed(() => (
  props.patient?.diagnosis
  || props.patient?.clinical?.diagnosis
  || ''
).trim());
const chiefComplaint = computed(() => (
  props.patient?.chiefComplaint
  || props.patient?.clinical?.chiefComplaint
  || ''
).trim());
const historyOfPresentIllness = computed(() => (
  props.patient?.historyOfPresentIllness
  || props.patient?.clinical?.historyOfPresentIllness
  || ''
).trim());
const matchedDiagnosis = computed(() => medicalDataService.matchDiagnosis(diagnosisName.value));
const displayDiagnosisName = computed(() => matchedDiagnosis.value?.name || diagnosisName.value || '当前诊断');

async function generateChecklist(): Promise<void> {
  if (isChecklistLoading.value) {
    return;
  }

  isCollapsed.value = false;

  if (!diagnosisName.value || !chiefComplaint.value || !historyOfPresentIllness.value) {
    generationError.value = '当前缺少诊断、主诉或现病史，无法生成鉴别排查建议。';
    checklistItems.value = [];
    riskIssues.value = [];
    isCollapsed.value = true;
    return;
  }

  isChecklistLoading.value = true;
  generationError.value = '';
  checklistItems.value = [];
  riskIssues.value = [];
  hasRequested.value = true;

  try {
    const userPrompt = PROMPTS.consultation.diagnosisChecklist.buildUserPrompt({
      diagnosisName: displayDiagnosisName.value,
      chiefComplaint: chiefComplaint.value,
      historyOfPresentIllness: historyOfPresentIllness.value,
    });

    const response = await chat([
      { role: 'system', content: PROMPTS.consultation.diagnosisChecklist.system },
      { role: 'user', content: userPrompt },
    ], undefined, undefined, undefined, {
      traceContext: {
        scene: 'standalone-differential-diagnosis-checklist',
        sourceModule: 'differential_diagnosis_modal',
        operationModule: 'consultation',
        operationAction: 'generate_diagnosis_checklist',
        title: '独立鉴别诊断生成鉴别排查建议',
      },
    });

    const parsed = parseDiagnosisChecklistResponse(response);
    const mismatchError = buildDiagnosisChecklistMismatchError(parsed);
    if (mismatchError) {
      generationError.value = mismatchError;
      checklistItems.value = [];
      riskIssues.value = buildDiagnosisChecklistRiskIssues(parsed, displayDiagnosisName.value);
      isCollapsed.value = false;
      return;
    }

    checklistItems.value = normalizeDiagnosisChecklistItems(parsed);
    if (checklistItems.value.length === 0) {
      showToast?.('当前诊断暂无需要复核或鉴别排查的提示。', 'info');
    }
  } catch (error: unknown) {
    checklistItems.value = [];
    riskIssues.value = [];
    generationError.value = formatUserFacingError(error, {
      context: '诊断鉴别生成失败',
      fallback: '请稍后重试。',
    });
    showToast?.(generationError.value, 'error');
  } finally {
    isChecklistLoading.value = false;
  }
}

watch(
  () => [diagnosisName.value, chiefComplaint.value, historyOfPresentIllness.value],
  () => {
    if (!hasRequested.value) {
      return;
    }
    void generateChecklist();
  },
);


onMounted(() => {
  void generateChecklist();
});
</script>

<template>
  <div ref="dialogRef" class="voice-consultation-new differential-modal-page" data-tauri-drag-region>
    <div class="confirm-overlay checklist-overlay differential-checklist-overlay" data-tauri-drag-region>
      <div :class="['checklist-dialog', 'pane-card', generationError ? 'error-dialog' : '', isCollapsed ? 'collapsed' : '']" role="dialog" aria-modal="true" aria-labelledby="standalone-checklist-title" data-tauri-drag-region>
        <div class="checklist-dialog-head">
          <div>
            <img class="checklist-dialog-icon" :src="generationError ? '/error.png' : '/normal.png'" alt="">
          </div>
          <div>
            <p id="standalone-checklist-title" class="confirm-dialog-title">
              {{ generationError ? `发现${Math.max(riskIssues.length, 1)}个问题` : '诊断鉴别' }}
            </p>
            <p v-if="isCollapsed" class="checklist-dialog-subtitle">点击展开查看详情</p>
          </div>
          <div v-if="generationError" class="checklist-dialog-down" @click="isCollapsed = !isCollapsed">
            <svgIcon file="/down.svg" :color="'#2469F2'" :hoverColor="'#2469F2'" :fontSize="'16px'" :class="{'down-icon': true, 'rotate-icon': isCollapsed }"></svgIcon>
          </div>
        </div>

        <div class="checklist-dialog-content" v-show="!isCollapsed">
          <div v-if="isChecklistLoading" class="loading-inline checklist-loading">
            <div class="ai-spinner small">
              <div class="spinner-ring"></div>
              <div class="spinner-core"></div>
            </div>
            <span>正在生成鉴别排查建议...</span>
          </div>

          <div v-else-if="generationError" class="risk-issue-list">
            <div
              v-for="(issue, index) in riskIssues.length > 0 ? riskIssues : [{ issue: generationError, target: displayDiagnosisName }]"
              :key="`${index}-${issue.issue}`"
              class="risk-issue-item"
            >
              <span class="risk-issue-badge">高风险</span>
              <div class="risk-issue-content">
                <div class="risk-issue-text">{{ issue.issue }}</div>
                <div v-if="issue.target" class="risk-issue-target">{{ issue.target }}</div>
              </div>
            </div>
          </div>

          <div v-else-if="checklistItems.length > 0" class="checklist-dialog-body">
            <div class="checklist-intro">
              <div>
                <svgIcon file="/ico_alert_warn.svg" :color="'#E5710B'" :hoverColor="'#E5710B'" :fontSize="'15px'"></svgIcon>
              </div>
              <div>为防止诊断与病历不匹配或高危疾病漏诊，系统建议进一步复核以下要点：</div>
            </div>
            <div class="checklist-items">
              <div v-for="(item, index) in checklistItems" :key="`${index}-${item.question}`" class="checklist-item-label">
                <span class="checklist-text">{{ item.question }}</span>
                <span v-if="item.recordText" class="checklist-record-text">{{ item.recordText }}</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-text checklist-empty">当前诊断暂无需要复核或鉴别排查的提示。</div>
        </div>
      </div>
      <button class="checklist-close-btn" type="button" aria-label="关闭" @click="emit('close')">
        <Icon icon="lucide:x" size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped src="../../consultation-result/ui/ClinicalResultEditor.css"></style>

<style scoped>
.differential-modal-page,
.voice-consultation-new.differential-modal-page {
  padding: 20px;
  box-sizing: border-box;
  width: 360px;
  background: transparent;
  overflow: visible;
  height: auto;
}

.differential-checklist-overlay {
  position: relative;
  padding: 0;
  background: transparent;
}

.checklist-dialog {
  width: 100%;
  box-shadow: none;
  background: linear-gradient( 182deg, #E2EBFF 0%, #E5F3FF 14.29%, #FFFFFF 30.23%, #FFFFFF 95.71%);
  border-radius: 8px;
  border: 1px solid #2469F2;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 600px;
  min-height: 88px;
}

.checklist-dialog.error-dialog {
  background: linear-gradient( 180deg, #FFEBE2 0%, #FFFFFF 100%);
  border: 1px solid #F25C2C;
}

.checklist-dialog-head {
  position: relative;
  justify-content: flex-start;
  align-items: center;
  gap: 4px;
  padding-bottom: 16px;
  border-bottom: 1px solid #DBDBDB;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.checklist-dialog.error-dialog .checklist-dialog-head {
  border-bottom-style: dashed;
}

.checklist-dialog-icon {
  width: 48px;
  height: 48px;
}

.checklist-close-btn {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  background: #FFFFFF;
  border: 1px solid #999999;
  border-radius: 50%;
  color: #999999;
  z-index: 10;
}

.checklist-dialog-subtitle {
  margin-top: 0;
}

.checklist-dialog-down {
  margin-left: auto;
  width: 19px;
  height: 19px;
  color: #2469F2;
  border: 1px solid #2469F2;
  border-radius: 50%;
  line-height: 16px;
}

.checklist-dialog-down img {
  width: 16px;
  height: 16px;
  color: #2469F2;
}

.checklist-dialog.collapsed {
  height: 88px;
}

.down-icon {
  transform: rotateZ(180deg);
}

.rotate-icon {
  transform: rotateZ(0deg);
}

.checklist-intro {
  display: flex;
  gap: 8px;
  background: #FFF5EB;
  border-radius: 8px;
  padding: 8px;
  font-family: Microsoft YaHei, Microsoft YaHei;
  font-weight: 400;
  font-size: 14px;
  color: #262626;
}

.checklist-dialog-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.risk-issue-list {
  display: flex;
  flex-direction: column;
}

.risk-issue-item {
  padding: 16px 0 18px;
  border-bottom: 1px dashed rgba(224, 83, 84, 0.24);
}

.risk-issue-item:first-child {
  padding-top: 0;
}

.risk-issue-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.risk-issue-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 2px 12px;
  border: 1px solid #E16A76;
  border-radius: 999px;
  color: #E16A76;
  background: rgba(255, 245, 246, 0.8);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.risk-issue-content {
  margin-top: 14px;
}

.risk-issue-text {
  color: #404040;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.65;
}

.risk-issue-target {
  margin-top: 10px;
  color: #8C8C8C;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.55;
}

.checklist-dialog-content::-webkit-scrollbar {
  width: 4px;
}

.checklist-dialog-content::-webkit-scrollbar-thumb {
  background: rgba(36, 105, 242, 0.3);
  border-radius: 2px;
}

.checklist-dialog-content::-webkit-scrollbar-track {
  background: transparent;
}
</style>
