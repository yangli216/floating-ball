# 语音问诊重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用新的 VoiceConsultationNew.vue 替换 20000+ 行的 VoiceConsultationPage.vue，实现语音录制 -> 意图识别 -> 自动填充病历 -> 医生确认/AI推荐 -> 提交的完整流程。

**Architecture:** VoiceCapsule 录音完成后，通过 useVoiceIntentRecognition composable 进行意图识别和医疗数据匹配，结果传递给新的 VoiceConsultationNew 页面。页面采用全宽两栏布局（左栏病历、右栏诊断治疗），复用现有的 DiagnosisRecommendationPrompt 和 TreatmentRecommendationPrompt 进行 AI 推荐，通过 complete_consultation Tauri 命令提交。

**Tech Stack:** Vue 3 (Composition API) + TypeScript + Tauri 2.0

**Spec:** `docs/superpowers/specs/2026-04-13-voice-consultation-redesign.md`

> 注：本文是 2026-04-13 的历史执行计划，保留当时的路径语境；当前 `VoiceConsultationResult.vue` 已删除，语音结果入口为 `src/components/VoiceConsultationNew.vue`，共享结果能力沉淀在 `src/features/consultation-result` 与 `src/features/clinical-result`。

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/VoiceConsultationNew.vue` | 语音问诊病历编辑页面（全宽两栏布局） |
| Modify | `src/App.vue` | 替换 VoiceConsultationPage 为 VoiceConsultationNew，修改 handleVoiceStop 流程 |
| Modify | `src/composables/useVoiceConsultation.ts` | 改造 handleVoiceStop：加入意图识别，跳转 voice-consultation 而非 voice-result |
| Delete | `src/components/VoiceConsultationPage.vue` | 旧的 20000+ 行组件 |

复用不修改的文件：
- `src/composables/useVoiceIntentRecognition.ts`
- `src/prompts/voiceIntentPrompts.ts`
- `src/prompts/prompts.ts`
- `src/services/medicalData.ts`
- `src/components/VoiceCapsule.vue`
- `src/types/consultation.ts`

---

### Task 1: 改造 useVoiceConsultation — 加入意图识别

**Files:**
- Modify: `src/composables/useVoiceConsultation.ts`

当前 `handleVoiceStop` 直接调用 LLM 生成完整病历（`MedicalRecordGenerationPrompt`），然后跳转到 `voice-result` 视图。需要改为：调用 `useVoiceIntentRecognition.processTranscript` 进行意图识别，成功后保存结果并跳转到 `voice-consultation` 视图。

- [ ] **Step 1: 重写 useVoiceConsultation.ts**

将 `src/composables/useVoiceConsultation.ts` 的内容替换为以下代码。核心变更：
1. 引入 `useVoiceIntentRecognition` 
2. `handleVoiceStop` 改为调用意图识别而非直接 LLM 生成
3. 新增 `intentResult` ref 暴露给 App.vue
4. 跳转目标从 `voice-result` 改为 `voice-consultation`

```typescript
/**
 * 语音问诊业务逻辑 Composable
 *
 * 管理语音问诊的完整流程：
 * - 语音录制停止后进行意图识别
 * - 将识别结果传递给 VoiceConsultationNew 页面
 * - 处理结果确认与提交
 */

import { ref, type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import type { ViewType } from '../constants/windowSizes';
import { WINDOW_SIZES } from '../constants/windowSizes';
import { trackClick, trackError, trackRecommendationAction, startTimedOperation } from '../services/operationTracker';
import type { GeneratedRecord } from '../components/VoiceConsultationResult.vue';
import type { AppPatient } from '../types/appState';
import { useVoiceIntentRecognition, type VoiceIntentResult } from './useVoiceIntentRecognition';

export interface VoiceConsultationOptions {
  appWindow: Ref<TauriWindow | null>;
  currentView: Ref<ViewType>;
  generatedRecord: Ref<GeneratedRecord | null>;
  currentPatient: Ref<AppPatient | null>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  windowMgmt: {
    smartExpand: (width: number, height: number) => Promise<void>;
  };
  workMode: {
    enterWorkMode: (customW?: number, customH?: number) => Promise<void>;
    exitWork: (sessionStatus?: 'completed' | 'cancelled' | 'error') => Promise<void>;
  };
}

export function useVoiceConsultation(options: VoiceConsultationOptions) {
  const {
    appWindow,
    currentView,
    generatedRecord,
    currentPatient,
    showToast,
    windowMgmt,
    workMode,
  } = options;

  const { smartExpand } = windowMgmt;
  const { enterWorkMode, exitWork } = workMode;

  // 意图识别
  const intentRecognition = useVoiceIntentRecognition();
  const intentResult = ref<VoiceIntentResult | null>(null);

  function resolveConsultationId(patient: AppPatient | null): string {
    return String(patient?.idPi || patient?.patientId || patient?.id || 'unknown');
  }

  /**
   * 处理语音停止事件
   *
   * 流程：
   * 1. 调用意图识别提取结构化信息
   * 2. 匹配医疗数据库
   * 3. 跳转到 voice-consultation 视图
   */
  async function handleVoiceStop(audioBlob: Blob, transcribedText: string): Promise<void> {
    console.log('[VoiceConsultation] handleVoiceStop received blob:', audioBlob?.size, 'bytes');
    console.log('[VoiceConsultation] Transcribed text:', transcribedText);

    if (!transcribedText || transcribedText.trim().length === 0) {
      showToast('未能识别到有效语音', 'error');
      exitWork('error');
      return;
    }

    // 显示处理中状态 - 先切换到 voice-consultation 并调整窗口
    intentResult.value = null;
    currentView.value = 'voice-consultation';

    if (appWindow.value) {
      try {
        await appWindow.value.setResizable(true);
        await appWindow.value.setSize(
          new LogicalSize(WINDOW_SIZES.VOICE_CONSULTATION.width, WINDOW_SIZES.VOICE_CONSULTATION.height)
        );
        await smartExpand(WINDOW_SIZES.VOICE_CONSULTATION.width, WINDOW_SIZES.VOICE_CONSULTATION.height);
      } catch (e) {
        console.error('[VoiceConsultation] Failed to resize:', e);
      }
    } else {
      await enterWorkMode(WINDOW_SIZES.VOICE_CONSULTATION.width, WINDOW_SIZES.VOICE_CONSULTATION.height);
    }

    const finishTimer = startTimedOperation('voice_intent_recognition');
    try {
      // 意图识别 + 医疗数据匹配
      intentRecognition.addTranscript(transcribedText);
      const result = await intentRecognition.processTranscript(transcribedText);

      if (!result) {
        const errorMsg = intentRecognition.processingError.value || '意图识别失败';
        showToast(errorMsg, 'error');
        finishTimer(false, { errorMessage: errorMsg });
        setTimeout(() => exitWork('error'), 2000);
        return;
      }

      intentResult.value = result;
      console.log('[VoiceConsultation] Intent recognition success:', result);
      finishTimer(true, {
        transcriptionLength: transcribedText.length,
        symptomCount: result.symptoms.length,
        treatmentCount: result.treatments.length,
      });
    } catch (err: unknown) {
      console.error('[VoiceConsultation] Intent recognition failed:', err);
      trackError('voice_intent_failed', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      finishTimer(false, { errorMessage: errMessage });
      showToast(`意图识别失败: ${errMessage}`, 'error');
      setTimeout(() => exitWork('error'), 2000);
    }
  }

  function handleVoiceError(err: unknown): void {
    trackError('voice_recording_error', err);
    showToast('录音出错: ' + err, 'error');
    exitWork('error');
  }

  async function handleResultConfirm(record: GeneratedRecord): Promise<void> {
    console.log('[VoiceConsultation] Confirmed record:', record);
    trackClick('voice_result_confirm');
    trackRecommendationAction('record', 'voice-record', 'adopted');

    try {
      const requestId = `voice-record-${Date.now()}`;
      await invoke('complete_consultation', {
        result: {
          consultationId: resolveConsultationId(currentPatient.value),
          timestamp: Date.now(),
          resultType: 'final-report',
          requestId,
          ...record,
        },
      });
      showToast('病历已生成并回传系统', 'success');
      await exitWork();
    } catch (e: unknown) {
      console.error('[VoiceConsultation] Failed to save result:', e);
      trackError('voice_result_submit_failed', e);
      showToast('回传失败: ' + e, 'error');
    }
  }

  async function cancelVoiceResult(): Promise<void> {
    trackClick('voice_result_cancel');
    trackRecommendationAction('record', 'voice-record', 'rejected');
    await exitWork('cancelled');
  }

  return {
    intentResult,
    handleVoiceStop,
    handleVoiceError,
    handleResultConfirm,
    cancelVoiceResult,
  };
}
```

- [ ] **Step 2: 验证类型正确**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && npx vue-tsc --noEmit 2>&1 | head -30`

Expected: 可能有关于 VoiceConsultationNew 不存在的错误（因为还没创建），但 useVoiceConsultation.ts 本身不应有类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/composables/useVoiceConsultation.ts
git commit -m "refactor: rewrite useVoiceConsultation to use intent recognition

Replace direct LLM medical record generation with useVoiceIntentRecognition
composable. handleVoiceStop now extracts structured intent (chief complaint,
symptoms, treatment hints) and navigates to voice-consultation view."
```

---

### Task 2: 创建 VoiceConsultationNew.vue — 页面骨架和病历左栏

**Files:**
- Create: `src/components/VoiceConsultationNew.vue`

先搭建页面骨架：患者信息栏 + 左栏（主诉、现病史、既往史）。右栏在 Task 3 实现。

- [ ] **Step 1: 创建 VoiceConsultationNew.vue 骨架**

```vue
<template>
  <div class="voice-consultation-new">
    <!-- Top: Patient Info -->
    <header class="patient-header">
      <div class="patient-card">
        <div class="avatar" :style="{ background: avatarConfig.bgColor }">
          <Icon :icon="avatarConfig.icon" :color="avatarConfig.color" size="18" />
        </div>
        <div class="patient-name">{{ patientInfo.naPi }}</div>
        <div class="patient-basic">
          <span>{{ patientInfo.sdSexText }}</span>
          <span class="divider"></span>
          <span>{{ patientInfo.ageText }}</span>
        </div>
        <div class="contact-info">
          <span>身份证号：{{ patientInfo.idCard }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" @click="$emit('close')">取消</button>
        <button
          class="header-btn primary"
          :disabled="!canSubmit"
          @click="handleBatchWriteBack"
        >确认提交</button>
      </div>
    </header>

    <!-- Loading overlay for intent processing -->
    <div v-if="!intentResult" class="loading-overlay">
      <div class="ai-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-core"></div>
      </div>
      <p class="loading-title">AI 正在识别语音意图...</p>
    </div>

    <!-- Main content: two columns -->
    <div v-else class="record-content">
      <!-- Left: Medical Record -->
      <div class="record-panel left-panel">
        <div class="panel-header">
          <h3>主诉 & 现病史</h3>
        </div>
        <div class="panel-body">
          <div class="record-field">
            <label>主诉 (Chief Complaint)</label>
            <textarea v-model="chiefComplaint" rows="2"></textarea>
          </div>
          <div class="record-field">
            <label>现病史 (HPI)</label>
            <textarea v-model="historyOfPresentIllness" rows="10"></textarea>
          </div>
          <div class="record-field">
            <label>既往史 (Past History)</label>
            <textarea v-model="pastMedicalHistory" rows="2"></textarea>
          </div>
        </div>
      </div>

      <!-- Right: Diagnosis & Treatment (Task 3) -->
      <div class="record-panel right-panel">
        <div class="panel-header">
          <h3>诊断 & 治疗方案</h3>
        </div>
        <div class="panel-body">
          <!-- Diagnosis section -->
          <div class="diagnosis-section">
            <div class="section-title-row">
              <h4>初步诊断 (Diagnosis)</h4>
              <button
                class="ai-recommend-btn"
                :disabled="isRecommendingDiagnosis"
                @click="fetchAIDiagnosis"
              >
                <span v-if="isRecommendingDiagnosis">推荐中...</span>
                <span v-else>AI推荐诊断</span>
              </button>
            </div>
            <div v-if="isRecommendingDiagnosis" class="loading-inline">
              AI 正在分析病例...
            </div>
            <div v-if="diagnosisError" class="error-text">{{ diagnosisError }}</div>
            <div v-if="diagnoses.length > 0" class="diagnosis-list">
              <div
                v-for="(diag, idx) in diagnoses"
                :key="idx"
                class="diagnosis-item"
                :class="{ active: selectedDiagnosis?.code === diag.code }"
                @click="handleDiagnosisSelect(diag)"
              >
                <div class="selected-mark" v-if="selectedDiagnosis?.code === diag.code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="diag-content">
                  <span class="diag-name">{{ diag.name }}</span>
                  <span class="diag-rate">{{ diag.rate }}</span>
                </div>
                <div class="diag-rationale">{{ diag.rationale }}</div>
              </div>
            </div>
          </div>

          <!-- Treatment section -->
          <div class="treatment-section-group">
            <div class="section-title-row">
              <h4>治疗方案 (Treatment)</h4>
              <button
                v-if="selectedDiagnosis && !hasTreatmentsFromVoice"
                class="ai-recommend-btn"
                :disabled="isRecommendingTreatment"
                @click="fetchAITreatment"
              >
                <span v-if="isRecommendingTreatment">推荐中...</span>
                <span v-else>AI推荐方案</span>
              </button>
            </div>
            <div v-if="isRecommendingTreatment" class="loading-inline">
              AI 正在生成治疗方案...
            </div>
            <div v-if="treatmentError" class="error-text">{{ treatmentError }}</div>

            <!-- Medicine section -->
            <section v-if="medications.length > 0" class="treatment-section">
              <div class="treatment-section-header">
                <h5>药品</h5>
                <span class="treatment-section-pill">{{ medications.filter(m => m.selected).length }}/{{ medications.length }} 已选</span>
              </div>
              <div class="treatment-list">
                <div
                  v-for="(med, idx) in medications"
                  :key="idx"
                  class="treatment-item"
                  :class="{ active: med.selected }"
                  @click="med.selected = !med.selected"
                >
                  <div class="selected-mark" v-if="med.selected">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="rec-content">
                    <div class="rec-header">
                      <span class="rec-tag medicine">药品</span>
                      <span class="rec-name">{{ med.name }}</span>
                      <span v-if="med.matchedItem" class="matched-inline">
                        <span class="match-icon">OK</span>
                        <span class="match-name">{{ med.matchedItem.name }}</span>
                        <span class="match-spec">{{ med.matchedItem.spec }}</span>
                      </span>
                      <span v-else class="unmatched-icon" title="未匹配标准库">!</span>
                    </div>
                    <div v-if="med.usage" class="rec-usage">{{ med.usage }}</div>
                    <div v-if="med.reason" class="rec-reason">{{ med.reason }}</div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Exam section -->
            <section v-if="examinations.length > 0" class="treatment-section">
              <div class="treatment-section-header">
                <h5>检查项目</h5>
                <span class="treatment-section-pill">{{ examinations.filter(e => e.selected).length }}/{{ examinations.length }} 已选</span>
              </div>
              <div class="treatment-list">
                <div
                  v-for="(exam, idx) in examinations"
                  :key="idx"
                  class="treatment-item"
                  :class="{ active: exam.selected }"
                  @click="exam.selected = !exam.selected"
                >
                  <div class="selected-mark" v-if="exam.selected">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="rec-content">
                    <div class="rec-header">
                      <span class="rec-tag exam">检查</span>
                      <span class="rec-name">{{ exam.name }}</span>
                      <span v-if="exam.matchedItem" class="matched-inline">
                        <span class="match-icon">OK</span>
                        <span class="match-name">{{ exam.matchedItem.name }}</span>
                      </span>
                      <span v-else class="unmatched-icon" title="未匹配标准库">!</span>
                    </div>
                    <div v-if="exam.reason" class="rec-reason">{{ exam.reason }}</div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Lab test section -->
            <section v-if="labTests.length > 0" class="treatment-section">
              <div class="treatment-section-header">
                <h5>检验项目</h5>
                <span class="treatment-section-pill">{{ labTests.filter(l => l.selected).length }}/{{ labTests.length }} 已选</span>
              </div>
              <div class="treatment-list">
                <div
                  v-for="(lab, idx) in labTests"
                  :key="idx"
                  class="treatment-item"
                  :class="{ active: lab.selected }"
                  @click="lab.selected = !lab.selected"
                >
                  <div class="selected-mark" v-if="lab.selected">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="rec-content">
                    <div class="rec-header">
                      <span class="rec-tag lab_test">检验</span>
                      <span class="rec-name">{{ lab.name }}</span>
                      <span v-if="lab.matchedItem" class="matched-inline">
                        <span class="match-icon">OK</span>
                        <span class="match-name">{{ lab.matchedItem.name }}</span>
                      </span>
                      <span v-else class="unmatched-icon" title="未匹配标准库">!</span>
                    </div>
                    <div v-if="lab.reason" class="rec-reason">{{ lab.reason }}</div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Procedure section -->
            <section v-if="procedures.length > 0" class="treatment-section">
              <div class="treatment-section-header">
                <h5>处置项目</h5>
                <span class="treatment-section-pill">{{ procedures.filter(p => p.selected).length }}/{{ procedures.length }} 已选</span>
              </div>
              <div class="treatment-list">
                <div
                  v-for="(proc, idx) in procedures"
                  :key="idx"
                  class="treatment-item"
                  :class="{ active: proc.selected }"
                  @click="proc.selected = !proc.selected"
                >
                  <div class="selected-mark" v-if="proc.selected">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="rec-content">
                    <div class="rec-header">
                      <span class="rec-tag procedure">处置</span>
                      <span class="rec-name">{{ proc.name }}</span>
                      <span v-if="proc.matchedItem" class="matched-inline">
                        <span class="match-icon">OK</span>
                        <span class="match-name">{{ proc.matchedItem.name }}</span>
                      </span>
                      <span v-else class="unmatched-icon" title="未匹配标准库">!</span>
                    </div>
                    <div v-if="proc.reason" class="rec-reason">{{ proc.reason }}</div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Empty state when no treatments from voice and no AI recommendation yet -->
            <div
              v-if="medications.length === 0 && examinations.length === 0 && labTests.length === 0 && procedures.length === 0 && !isRecommendingTreatment"
              class="empty-treatment"
            >
              <p v-if="!selectedDiagnosis">请先选择或推荐诊断，再获取AI治疗方案推荐</p>
              <p v-else>点击上方"AI推荐方案"获取治疗建议</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.vue';
import type { Patient, Diagnosis, TreatmentRecommendation } from '../types/consultation';
import type { VoiceIntentResult, MatchedTreatment } from '../composables/useVoiceIntentRecognition';
import { chat, type ChatMessage } from '../services/llm';
import { PROMPTS } from '../prompts';
import { medicalDataService } from '../services/medicalData';
import { trackClick, trackError, startTimedOperation } from '../services/operationTracker';

const props = defineProps<{
  initialPatientData?: Patient;
  intentResult: VoiceIntentResult | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

// -- Patient info --
const patientInfo = ref<Patient>({
  naPi: '',
  sdSex: '',
  sdSexText: '',
  ageText: '',
  idCard: '',
});

const avatarConfig = computed(() => {
  const isMale = patientInfo.value.sdSexText === '男';
  return {
    icon: isMale ? 'lucide:user' : 'lucide:user',
    color: isMale ? '#4A90D9' : '#D94A8C',
    bgColor: isMale ? '#EBF5FF' : '#FFEBF5',
  };
});

// -- Medical record fields (editable) --
const chiefComplaint = ref('');
const historyOfPresentIllness = ref('');
const pastMedicalHistory = ref('');

// -- Diagnosis --
const diagnoses = ref<Diagnosis[]>([]);
const selectedDiagnosis = ref<Diagnosis | null>(null);
const isRecommendingDiagnosis = ref(false);
const diagnosisError = ref('');

// -- Treatment (4 categories) --
interface TreatmentItem extends TreatmentRecommendation {
  matchedItem?: { id: string; name: string; spec?: string; code?: string } | null;
}

const medications = ref<TreatmentItem[]>([]);
const examinations = ref<TreatmentItem[]>([]);
const labTests = ref<TreatmentItem[]>([]);
const procedures = ref<TreatmentItem[]>([]);
const isRecommendingTreatment = ref(false);
const treatmentError = ref('');

const hasTreatmentsFromVoice = computed(() => {
  return medications.value.length > 0
    || examinations.value.length > 0
    || labTests.value.length > 0
    || procedures.value.length > 0;
});

const canSubmit = computed(() => {
  return chiefComplaint.value.trim().length > 0
    && (selectedDiagnosis.value !== null || hasTreatmentsFromVoice.value);
});

// -- Initialize from props --
watch(() => props.initialPatientData, (data) => {
  if (data) {
    patientInfo.value = {
      ...patientInfo.value,
      ...data,
      naPi: data.naPi || (data as any).name || '',
    };
  }
}, { immediate: true });

watch(() => props.intentResult, (result) => {
  if (!result) return;
  chiefComplaint.value = result.chiefComplaint;
  historyOfPresentIllness.value = result.historyOfPresentIllness;
  pastMedicalHistory.value = result.pastMedicalHistory;
  initTreatmentsFromIntent(result);
}, { immediate: true });

function initTreatmentsFromIntent(result: VoiceIntentResult) {
  // Clear previous
  medications.value = [];
  examinations.value = [];
  labTests.value = [];
  procedures.value = [];

  for (const t of result.treatments) {
    const item: TreatmentItem = {
      type: t.type === 'examination' ? 'exam'
        : t.type === 'labTest' ? 'lab_test'
        : t.type as any,
      name: t.matchedItem?.name || t.name,
      reason: `医生口述: "${t.text}"`,
      usage: t.type === 'medicine' ? [t.dosage, t.frequency, t.usage].filter(Boolean).join(', ') : undefined,
      matchedItem: t.matchedItem || null,
      selected: !!t.matchedItem, // auto-select matched items
    };

    switch (t.type) {
      case 'medicine': medications.value.push(item); break;
      case 'examination': examinations.value.push(item); break;
      case 'labTest': labTests.value.push(item); break;
      case 'procedure': procedures.value.push(item); break;
    }
  }
}

// -- AI Diagnosis Recommendation --
async function fetchAIDiagnosis() {
  if (!chiefComplaint.value.trim()) {
    diagnosisError.value = '请先确认主诉内容';
    return;
  }

  isRecommendingDiagnosis.value = true;
  diagnosisError.value = '';
  const finishTimer = startTimedOperation('voice_ai_diagnosis');

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.consultation.diagnosisRecommendation.system },
      {
        role: 'user',
        content: PROMPTS.consultation.diagnosisRecommendation.buildUserPrompt({
          patientName: patientInfo.value.naPi,
          gender: patientInfo.value.sdSexText || '',
          age: patientInfo.value.ageText || '',
          chiefComplaint: chiefComplaint.value,
          historyOfPresentIllness: historyOfPresentIllness.value,
        }),
      },
    ];

    const jsonStr = await chat(messages);
    let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    const parsed: Array<{ name: string; code: string; rate: string; rationale: string }> = JSON.parse(cleanJson);

    // Match against local diagnosis database
    diagnoses.value = parsed.map((d) => {
      const matched = medicalDataService.matchDiagnosis(d.name);
      return {
        name: matched?.name || d.name,
        code: matched?.code || d.code,
        rate: d.rate,
        rationale: d.rationale,
        id: matched?.id,
      };
    });

    finishTimer(true, { count: diagnoses.value.length });
  } catch (err: unknown) {
    trackError('voice_ai_diagnosis_failed', err);
    diagnosisError.value = `诊断推荐失败: ${err instanceof Error ? err.message : String(err)}`;
    finishTimer(false, { errorMessage: diagnosisError.value });
  } finally {
    isRecommendingDiagnosis.value = false;
  }
}

function handleDiagnosisSelect(diag: Diagnosis) {
  trackClick('voice_select_diagnosis');
  if (selectedDiagnosis.value?.code === diag.code) {
    selectedDiagnosis.value = null;
  } else {
    selectedDiagnosis.value = diag;
  }
}

// -- AI Treatment Recommendation --
async function fetchAITreatment() {
  if (!selectedDiagnosis.value) {
    treatmentError.value = '请先选择诊断';
    return;
  }

  isRecommendingTreatment.value = true;
  treatmentError.value = '';
  const finishTimer = startTimedOperation('voice_ai_treatment');

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.consultation.treatmentRecommendation.system },
      {
        role: 'user',
        content: PROMPTS.consultation.treatmentRecommendation.buildUserPrompt({
          patientName: patientInfo.value.naPi,
          gender: patientInfo.value.sdSexText || '',
          age: patientInfo.value.ageText || '',
          diagnosisName: selectedDiagnosis.value.name,
          diagnosisCode: selectedDiagnosis.value.code,
          chiefComplaint: chiefComplaint.value,
        }),
      },
    ];

    const jsonStr = await chat(messages);
    let cleanJson = jsonStr.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) cleanJson = jsonMatch[0];

    const parsed: Array<{ type: string; name: string; reason: string; usage?: string }> = JSON.parse(cleanJson);

    // Match against local medical database and distribute to categories
    for (const rec of parsed) {
      const item: TreatmentItem = {
        type: rec.type as any,
        name: rec.name,
        reason: rec.reason,
        usage: rec.usage,
        matchedItem: null,
        selected: false,
      };

      // Match to local database
      if (rec.type === 'medicine') {
        const matched = medicalDataService.matchMedicine(rec.name);
        if (matched) {
          item.matchedItem = { id: matched.id, name: matched.name, spec: matched.spec };
          item.name = matched.name;
          item.selected = true;
        }
        medications.value.push(item);
      } else if (rec.type === 'exam') {
        const matched = medicalDataService.matchExamItem(rec.name);
        if (matched) {
          item.matchedItem = { id: matched.id, name: matched.name };
          item.name = matched.name;
          item.selected = true;
        }
        examinations.value.push(item);
      } else if (rec.type === 'lab_test') {
        const matched = medicalDataService.matchLabTestItem(rec.name);
        if (matched) {
          item.matchedItem = { id: matched.id, name: matched.name };
          item.name = matched.name;
          item.selected = true;
        }
        labTests.value.push(item);
      } else if (rec.type === 'procedure') {
        const matched = medicalDataService.matchProcedureItem(rec.name);
        if (matched) {
          item.matchedItem = { id: matched.id, name: matched.name };
          item.name = matched.name;
          item.selected = true;
        }
        procedures.value.push(item);
      }
    }

    finishTimer(true, { count: parsed.length });
  } catch (err: unknown) {
    trackError('voice_ai_treatment_failed', err);
    treatmentError.value = `治疗推荐失败: ${err instanceof Error ? err.message : String(err)}`;
    finishTimer(false, { errorMessage: treatmentError.value });
  } finally {
    isRecommendingTreatment.value = false;
  }
}

// -- Submit --
function resolveConsultationId(): string {
  return String(patientInfo.value.idPi || (patientInfo.value as any).patientId || (patientInfo.value as any).id || 'unknown');
}

const showToast = inject<(msg: string, type?: string) => void>('showToast', () => {});

async function handleBatchWriteBack() {
  const requestId = `voice-batch-${Date.now()}`;

  const selectedMeds = medications.value.filter((m) => m.selected).map((m) => ({
    name: m.name,
    spec: m.matchedItem?.spec,
    usage: m.usage,
    idMedPro: m.matchedItem?.id,
  }));
  const selectedExams = examinations.value.filter((e) => e.selected).map((e) => ({
    name: e.name,
    idCli: e.matchedItem?.id,
  }));
  const selectedLabs = labTests.value.filter((l) => l.selected).map((l) => ({
    name: l.name,
    idCli: l.matchedItem?.id,
  }));
  const selectedProcs = procedures.value.filter((p) => p.selected).map((p) => ({
    name: p.name,
    idCli: p.matchedItem?.id,
  }));

  const diagnosisList = selectedDiagnosis.value
    ? [{ name: selectedDiagnosis.value.name, code: selectedDiagnosis.value.code }]
    : [];

  const treatmentPlanParts = [
    selectedMeds.length ? `建议用药：${selectedMeds.map((m) => m.name).join('；')}` : '',
    selectedExams.length ? `建议检查：${selectedExams.map((e) => e.name).join('；')}` : '',
    selectedLabs.length ? `建议检验：${selectedLabs.map((l) => l.name).join('；')}` : '',
    selectedProcs.length ? `建议处置：${selectedProcs.map((p) => p.name).join('；')}` : '',
  ].filter(Boolean);

  const result = {
    consultationId: resolveConsultationId(),
    timestamp: Date.now(),
    resultType: 'batch',
    requestId,
    chiefComplaint: chiefComplaint.value,
    historyOfPresentIllness: historyOfPresentIllness.value,
    pastMedicalHistory: pastMedicalHistory.value,
    diagnosisList,
    medications: selectedMeds,
    examinations: selectedExams,
    labTests: selectedLabs,
    procedures: selectedProcs,
    treatmentPlan: treatmentPlanParts.length > 0
      ? treatmentPlanParts.join('；')
      : '建议结合医生站规则完成最终确认。',
  };

  try {
    await invoke('complete_consultation', { result });
    trackClick('voice_batch_writeback');
    showToast('已提交到HIS系统', 'success');
    emit('close');
  } catch (e: unknown) {
    console.error('[VoiceConsultationNew] Submit failed:', e);
    trackError('voice_submit_failed', e);
    showToast('提交失败: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}
</script>
```

**Note:** `inject` 需要在 import 中加上。在 `<script setup>` 的 import 行中加入 `inject`:

```typescript
import { ref, computed, watch, onMounted, inject } from 'vue';
```

- [ ] **Step 2: 添加样式**

在组件末尾添加 `<style scoped>` 块。样式参考 ConsultationPage.vue 的 record 视图。

```vue
<style scoped>
.voice-consultation-new {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
  border-radius: 12px;
  overflow: hidden;
}

/* Patient Header - same as ConsultationPage */
.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  flex-shrink: 0;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.patient-name {
  font-size: 16px;
  font-weight: 600;
}

.patient-basic {
  font-size: 13px;
  opacity: 0.9;
  display: flex;
  gap: 4px;
}

.patient-basic .divider {
  opacity: 0.5;
}

.patient-basic .divider::before {
  content: '|';
}

.contact-info {
  font-size: 12px;
  opacity: 0.7;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.3);
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.header-btn.primary {
  background: #fff;
  color: #764ba2;
  border-color: transparent;
  font-weight: 600;
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading overlay */
.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
}

.ai-spinner {
  position: relative;
  width: 48px;
  height: 48px;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-core {
  position: absolute;
  inset: 8px;
  background: #667eea;
  border-radius: 50%;
  opacity: 0.2;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-title {
  font-size: 15px;
  color: #6b7280;
}

.loading-inline {
  padding: 12px;
  color: #6b7280;
  font-size: 13px;
}

/* Two-column layout */
.record-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 1px;
  background: #e5e7eb;
}

.record-panel {
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow-y: auto;
}

.left-panel {
  flex: 0 0 42%;
}

.right-panel {
  flex: 1;
}

.panel-header {
  padding: 14px 20px 10px;
  border-bottom: 1px solid #f0f0f0;
}

.panel-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.panel-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

/* Record fields */
.record-field {
  margin-bottom: 16px;
}

.record-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.record-field textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.record-field textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* Diagnosis section */
.diagnosis-section,
.treatment-section-group {
  margin-bottom: 20px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title-row h4 {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.ai-recommend-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #667eea;
  background: transparent;
  color: #667eea;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.ai-recommend-btn:hover:not(:disabled) {
  background: #667eea;
  color: #fff;
}

.ai-recommend-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: #ef4444;
  font-size: 13px;
  padding: 8px 0;
}

/* Diagnosis list */
.diagnosis-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnosis-item {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.diagnosis-item:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.diagnosis-item.active {
  border-color: #667eea;
  background: #eef2ff;
}

.diagnosis-item .selected-mark {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 20px;
  height: 20px;
  background: #667eea;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.diag-content {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.diag-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.diag-rate {
  font-size: 12px;
  color: #667eea;
  background: #eef2ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.diag-rationale {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

/* Treatment sections */
.treatment-section {
  margin-bottom: 14px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
}

.treatment-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #f0f0f0;
}

.treatment-section-header h5 {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.treatment-section-pill {
  font-size: 11px;
  color: #667eea;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 10px;
}

.treatment-list {
  display: flex;
  flex-direction: column;
}

.treatment-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.15s;
  position: relative;
}

.treatment-item:last-child {
  border-bottom: none;
}

.treatment-item:hover {
  background: #f9fafb;
}

.treatment-item.active {
  background: #f0fdf4;
}

.treatment-item .selected-mark {
  width: 20px;
  height: 20px;
  background: #22c55e;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  margin-top: 2px;
}

.rec-content {
  flex: 1;
  min-width: 0;
}

.rec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rec-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.rec-tag.medicine { background: #dbeafe; color: #1d4ed8; }
.rec-tag.exam { background: #fef3c7; color: #92400e; }
.rec-tag.lab_test { background: #e0e7ff; color: #3730a3; }
.rec-tag.procedure { background: #fce7f3; color: #9d174d; }

.rec-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.matched-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #16a34a;
}

.match-icon {
  font-size: 11px;
  font-weight: 700;
}

.match-name {
  font-weight: 500;
}

.match-spec {
  color: #6b7280;
}

.unmatched-icon {
  font-size: 12px;
  color: #f59e0b;
  cursor: help;
}

.rec-usage {
  font-size: 12px;
  color: #4b5563;
  margin-top: 4px;
}

.rec-reason {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

/* Empty state */
.empty-treatment {
  text-align: center;
  padding: 24px;
  color: #9ca3af;
  font-size: 13px;
}
</style>
```

- [ ] **Step 3: 验证组件无语法错误**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && npx vue-tsc --noEmit 2>&1 | head -30`

Expected: 可能有 App.vue 相关的错误（尚未接入），但 VoiceConsultationNew.vue 自身不应有类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/components/VoiceConsultationNew.vue
git commit -m "feat: create VoiceConsultationNew component

New voice consultation page with two-column layout:
- Left: editable chief complaint, HPI, past history (auto-filled from intent)
- Right: diagnosis selection + treatment plan (voice-spoken items auto-matched,
  AI recommendation buttons for missing items)

Supports doctor-spoken treatment priority and two-step AI recommendation
(diagnosis first, then treatment)."
```

---

### Task 3: 接入 App.vue — 替换旧组件

**Files:**
- Modify: `src/App.vue`

将 VoiceConsultationPage 替换为 VoiceConsultationNew，传递 intentResult prop。

- [ ] **Step 1: 修改 import**

在 `src/App.vue` 中，将第 18 行：
```typescript
import VoiceConsultationPage from "./components/VoiceConsultationPage.vue";
```
替换为：
```typescript
import VoiceConsultationNew from "./components/VoiceConsultationNew.vue";
```

- [ ] **Step 2: 暴露 intentResult**

在 `src/App.vue` 约第 183 行，解构 `voiceConsultation` 时添加 `intentResult`：

```typescript
// 解构语音问诊 API
const {
  intentResult,
  handleVoiceStop,
  handleVoiceError,
  handleResultConfirm,
  cancelVoiceResult,
} = voiceConsultation;
```

- [ ] **Step 3: 替换模板中的组件**

在 `src/App.vue` 约第 541-545 行，将：
```vue
          <VoiceConsultationPage
            v-if="currentView === 'voice-consultation'"
            :initialPatientData="currentPatient"
            @close="handleCollapse"
          />
```
替换为：
```vue
          <VoiceConsultationNew
            v-if="currentView === 'voice-consultation'"
            :initialPatientData="currentPatient"
            :intentResult="intentResult"
            @close="handleCollapse"
          />
```

- [ ] **Step 4: 验证构建通过**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build 2>&1 | tail -20`

Expected: 构建成功，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: wire VoiceConsultationNew into App.vue

Replace VoiceConsultationPage with VoiceConsultationNew. Pass intentResult
from useVoiceConsultation composable as prop. Voice flow now goes:
VoiceCapsule -> intent recognition -> VoiceConsultationNew."
```

---

### Task 4: 删除旧组件

**Files:**
- Delete: `src/components/VoiceConsultationPage.vue`

- [ ] **Step 1: 确认无其他引用**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && grep -r "VoiceConsultationPage" src/ --include="*.ts" --include="*.vue" | grep -v "node_modules"`

Expected: 仅有 App.vue 中的旧 import（已在 Task 3 中替换）。如果还有其他引用，需要先处理。

- [ ] **Step 2: 删除文件**

```bash
rm src/components/VoiceConsultationPage.vue
```

- [ ] **Step 3: 检查是否有关联的 composable 只被旧组件使用**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && grep -r "useVoiceConsultation\b" src/ --include="*.ts" --include="*.vue" | grep -v node_modules`

Expected: 只有 `App.vue` 和 `useVoiceConsultation.ts` 自身。（useVoiceConsultation 被 App.vue 使用，保留。）

- [ ] **Step 4: 验证构建通过**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build 2>&1 | tail -20`

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete VoiceConsultationPage.vue (20000+ lines)

Replaced by VoiceConsultationNew.vue with cleaner architecture:
intent recognition -> auto-fill -> doctor confirmation."
```

---

### Task 5: 端到端验证

**Files:** None (verification only)

- [ ] **Step 1: 类型检查**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && npx vue-tsc --noEmit 2>&1 | tail -20`

Expected: 无类型错误。

- [ ] **Step 2: 完整构建**

Run: `cd /Users/das/SourceCode/regional-ai-workspace/floating-ball && yarn build 2>&1 | tail -20`

Expected: 构建成功。

- [ ] **Step 3: 手动测试清单**

以下场景需要手动验证：

1. **录音 -> 意图识别**: 通过 HIS 发起语音问诊 (`POST /api/consultation/voice`)，VoiceCapsule 出现，录音后停止，观察是否跳转到 VoiceConsultationNew 页面
2. **意图结果填充**: 确认主诉、现病史、既往史自动填充
3. **口述治疗方案匹配（情况A）**: 录音中说出具体药品名称，确认右侧自动显示匹配结果
4. **AI推荐诊断（情况B）**: 录音中不说治疗方案，点击"AI推荐诊断"，确认推荐列表出现
5. **选中诊断后AI推荐治疗**: 选中一个诊断后，点击"AI推荐方案"，确认药品推荐出现
6. **提交**: 选择诊断和治疗项目后，点击"确认提交"，确认数据通过 `complete_consultation` 发送

- [ ] **Step 4: 修复构建或类型错误（如有）**

如果 Step 1 或 Step 2 有错误，根据错误信息修复后重新构建。

- [ ] **Step 5: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: address build/type errors from voice consultation redesign"
```
