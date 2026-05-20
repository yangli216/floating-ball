<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emitTo } from '@tauri-apps/api/event';
import Icon from './Icon.vue';
import type {
  ReportInterpretationWindowPayload,
  ReportInterpretationWindowStateEvent,
} from '../types/reportInterpretation';

const appWindow = getCurrentWindow();
const MAIN_WINDOW_LABEL = 'main';
const payload = ref<ReportInterpretationWindowPayload | null>(null);
const isLoading = ref(true);
const statusPhase = ref<'preparing' | 'generating' | 'rendering' | 'success' | 'error'>('preparing');
const statusMessage = ref('正在准备报告解读窗口...');
const statusDetail = ref('正在连接主窗口与独立结果页。');

let unlistenPayload: (() => void) | null = null;
let unlistenStatus: (() => void) | null = null;

const urgencyToneMap = {
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const;

const loadingTitle = computed(() => {
  if (statusPhase.value === 'error') {
    return '报告解读失败';
  }

  if (statusPhase.value === 'rendering') {
    return '正在渲染解读结果';
  }

  if (statusPhase.value === 'generating') {
    return '正在生成报告解读';
  }

  return '正在准备报告解读';
});

async function closeWindow(): Promise<void> {
  try {
    await appWindow.close();
  } catch (error) {
    console.warn('[ReportInterpretationWindow] close() failed, fallback to hide():', error);
    await appWindow.hide();
  }
}

async function handleHeaderMouseDown(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('.close-btn')) {
    return;
  }

  await appWindow.startDragging();
}

onMounted(async () => {
  console.info('[ReportInterpretationWindow] Mounting window:', appWindow.label);

  unlistenPayload = await appWindow.listen<ReportInterpretationWindowPayload>('report-interpretation:update', ({ payload: nextPayload }) => {
    console.info('[ReportInterpretationWindow] Received payload update:', {
      requestId: nextPayload?.requestId,
      taskId: nextPayload?.taskId,
    });
    payload.value = nextPayload;
    isLoading.value = false;
    statusPhase.value = 'success';
    statusMessage.value = '';
    statusDetail.value = '';
  });

  unlistenStatus = await appWindow.listen<ReportInterpretationWindowStateEvent>('report-interpretation:status', ({ payload: nextState }) => {
    console.info('[ReportInterpretationWindow] Received status update:', nextState);
    isLoading.value = Boolean(nextState?.loading);
    statusPhase.value = nextState?.phase || (isLoading.value ? 'preparing' : 'success');
    statusMessage.value = nextState?.message || '';
    statusDetail.value = nextState?.detail || '';

    if (nextState?.clearPayload) {
      payload.value = null;
    }
  });

  console.info('[ReportInterpretationWindow] Listeners registered, notifying main window');
  await emitTo(MAIN_WINDOW_LABEL, 'report-interpretation:ready', { label: appWindow.label });
});

onUnmounted(() => {
  unlistenPayload?.();
  unlistenStatus?.();
});
</script>

<template>
  <section class="report-window">
    <header class="window-header" @mousedown.left="handleHeaderMouseDown">
      <div class="header-copy">
        <h1>报告解读</h1>
      </div>
      <button class="close-btn" type="button" title="关闭" @click.stop="closeWindow">
        <Icon icon="lucide:x" size="18" />
      </button>
    </header>

    <div class="window-stage">
      <div v-if="payload" class="window-body" :class="{ 'window-body--loading': isLoading }">
        <!-- 1. 左侧栏: 患者背景 & 原始报告 -->
        <aside class="facts-panel">
          <!-- 患者画像 -->
          <section class="card-panel patient-card">
            <div class="panel-head">
              <h3>患者画像</h3>
            </div>
            
            <div v-if="payload.patient" class="patient-profile">
              <div class="patient-base-info">
                <span class="patient-tag name-tag">{{ payload.patient.patientName || '无名氏' }}</span>
                <span class="patient-tag sex-tag" v-if="payload.patient.genderText">{{ payload.patient.genderText }}</span>
                <span class="patient-tag age-tag" v-if="payload.patient.ageText">{{ payload.patient.ageText }}</span>
              </div>
              <div class="patient-details">
                <div class="detail-item" v-if="payload.patient.chiefComplaint">
                  <span class="detail-label">主诉</span>
                  <span class="detail-val">{{ payload.patient.chiefComplaint }}</span>
                </div>
                <div class="detail-item" v-if="payload.patient.historyOfPresentIllness">
                  <span class="detail-label">现病史</span>
                  <span class="detail-val">{{ payload.patient.historyOfPresentIllness }}</span>
                </div>
                <div class="detail-item" v-if="payload.patient.pastMedicalHistory">
                  <span class="detail-label">既往史</span>
                  <span class="detail-val">{{ payload.patient.pastMedicalHistory }}</span>
                </div>
                <div class="detail-item text-allergy" v-if="payload.patient.allergyHistory">
                  <span class="detail-label">过敏史</span>
                  <span class="detail-val">{{ payload.patient.allergyHistory }}</span>
                </div>
                <div class="detail-item" v-if="payload.patient.diagnosis">
                  <span class="detail-label">当前诊断</span>
                  <span class="detail-val">{{ payload.patient.diagnosis }}</span>
                </div>
              </div>
            </div>
            <p v-else class="patient-summary-text">{{ payload.patientSummary }}</p>
          </section>

          <!-- 原始报告 -->
          <section class="card-panel raw-report-card">
            <div class="panel-head">
              <h3>原始报告原文</h3>
              <span class="report-kind-tag">{{ payload.reportKindLabel }}</span>
            </div>
            <div class="raw-content-wrapper">
              <pre>{{ payload.sourceQuery }}</pre>
            </div>
          </section>
        </aside>

        <!-- 2. 中间栏: AI 智能解读 -->
        <main class="interpretation-panel">
          <!-- 快速概览 -->
          <section class="summary-panel hero-panel">
            <p class="section-tag">快速概览</p>
            <h2>{{ payload.summary }}</h2>
            <p class="conclusion-text">{{ payload.conclusion }}</p>
            <div class="meta-row">
              <span class="generated-time">解读时间: {{ payload.generatedAt }}</span>
            </div>
          </section>

          <!-- 关键判断点 -->
          <section class="key-points-panel card-panel">
            <div class="panel-head">
              <h3>核心异常指标</h3>
              <span class="badge">{{ payload.keyPoints.length }} 条异常</span>
            </div>
            <ul class="key-point-list">
              <li v-for="item in payload.keyPoints" :key="`${item.title}-${item.detail}`" class="key-point-item" :class="`key-point-item--${urgencyToneMap[item.urgency || 'medium']}`">
                <div class="key-point-header">
                  <span class="urgency-indicator" :class="`urgency-indicator--${item.urgency || 'medium'}`"></span>
                  <strong>{{ item.title }}</strong>
                  <span class="urgency-chip" :class="`urgency-chip--${item.urgency || 'medium'}`">
                    {{ item.urgency === 'high' ? '危急' : item.urgency === 'low' ? '提示' : '警示' }}
                  </span>
                </div>
                <p class="key-point-detail">{{ item.detail }}</p>
              </li>
            </ul>
          </section>

          <!-- 结构化分析说明 -->
          <section class="section-panel card-panel" v-if="payload.sections && payload.sections.length > 0">
            <div class="panel-head">
              <h3>结构化分析说明</h3>
              <span>结合背景阅读</span>
            </div>
            <div class="section-list">
              <article v-for="item in payload.sections" :key="`${item.title}-${item.content}`" class="text-block">
                <span class="block-title">{{ item.title }}</span>
                <p>{{ item.content }}</p>
              </article>
            </div>
          </section>
        </main>

        <!-- 3. 右侧栏: 建议行动与处置指南 -->
        <aside class="decision-panel">
          <!-- 下一步行动建议 -->
          <section class="card-panel list-panel action-card">
            <div class="panel-head">
              <div class="head-title">
                <Icon icon="lucide:check-circle" size="16" class="icon-accent" />
                <h3>建议下一步行动</h3>
              </div>
            </div>
            <ul class="action-list">
              <li v-for="item in payload.recommendations" :key="item">{{ item }}</li>
            </ul>
          </section>

          <!-- 注意事项 -->
          <section class="card-panel list-panel caution-card">
            <div class="panel-head">
              <div class="head-title">
                <Icon icon="lucide:alert-circle" size="16" class="icon-caution" />
                <h3>注意事项</h3>
              </div>
            </div>
            <ul class="caution-list">
              <li v-for="item in payload.cautions" :key="item">{{ item }}</li>
            </ul>
          </section>
        </aside>
      </div>

      <div v-else-if="!isLoading" class="empty-state" :class="{ 'empty-state--error': statusPhase === 'error' }">
        <Icon :icon="statusPhase === 'error' ? 'lucide:triangle-alert' : 'lucide:file-text'" size="34" />
        <h2>{{ loadingTitle }}</h2>
        <p>{{ statusMessage || '等待主窗口传入报告内容。' }}</p>
        <p v-if="statusDetail" class="status-detail">{{ statusDetail }}</p>
        <p v-if="statusPhase !== 'error'">请从 HIS SDK 或本地桥接接口发起报告解读请求，结果会在此窗口展示。</p>
      </div>

      <div v-if="isLoading" class="loading-state" :class="{ 'loading-state--overlay': !!payload }">
        <div class="loading-spinner" aria-hidden="true"></div>
        <h2>{{ loadingTitle }}</h2>
        <p>{{ statusMessage || '正在生成结构化解读，请稍候。' }}</p>
        <p v-if="statusDetail" class="status-detail">{{ statusDetail }}</p>
        <p v-if="!payload" class="loading-hint">解读结果会在当前窗口直接刷新显示。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.report-window {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(230, 240, 255, 0.35), transparent 30%),
    radial-gradient(circle at right center, rgba(120, 185, 255, 0.15), transparent 28%),
    linear-gradient(180deg, #f4f7fc 0%, #e8eff9 100%);
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(104, 132, 170, 0.12);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  cursor: grab;
  z-index: 10;
}

.window-header:active {
  cursor: grabbing;
}

.header-copy h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

.window-stage {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.window-body {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.3fr) minmax(280px, 0.95fr);
  gap: 16px;
  padding: 16px 16px 20px;
  overflow: hidden;
}

.window-body--loading {
  filter: saturate(0.92) contrast(0.98);
  pointer-events: none;
}

/* 三栏布局面板独立滚动 */
.facts-panel,
.interpretation-panel,
.decision-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

/* 自定义面板滚动条 */
.facts-panel::-webkit-scrollbar,
.interpretation-panel::-webkit-scrollbar,
.decision-panel::-webkit-scrollbar {
  width: 6px;
}
.facts-panel::-webkit-scrollbar-thumb,
.interpretation-panel::-webkit-scrollbar-thumb,
.decision-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(107, 134, 181, 0.15);
}
.facts-panel::-webkit-scrollbar-thumb:hover,
.interpretation-panel::-webkit-scrollbar-thumb:hover,
.decision-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 134, 181, 0.3);
}

/* 卡片基础设计 - 极致磨砂质感 */
.summary-panel,
.card-panel {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 4px 20px rgba(52, 94, 156, 0.04);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.summary-panel:hover,
.card-panel:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(52, 94, 156, 0.08);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(107, 134, 181, 0.08);
  padding-bottom: 10px;
}

.panel-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.panel-head span {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

/* 1. 左侧栏样式 */
.patient-card {
  padding: 16px;
  flex: 0 0 auto;
}

.patient-profile {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.patient-base-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.patient-tag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
}

.name-tag {
  font-size: 13px;
  background: rgba(74, 144, 226, 0.12);
  color: #1d4ed8;
}

.sex-tag,
.age-tag {
  background: rgba(107, 134, 181, 0.08);
  color: #475569;
}

.patient-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: rgba(107, 134, 181, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(107, 134, 181, 0.05);
}

.detail-label {
  font-size: 12px;
  font-weight: 800;
  color: #64748b;
  letter-spacing: 0.02em;
}

.detail-val {
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
}

.text-allergy {
  border-left: 3px solid #ef4444;
}

.text-allergy .detail-val {
  color: #ef4444;
  font-weight: 600;
}

.patient-summary-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #475569;
}

/* 原始报告卡片 */
.raw-report-card {
  padding: 16px;
  flex: 1 1 0%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.report-kind-tag {
  font-size: 12px;
  padding: 2px 8px;
  background: rgba(107, 134, 181, 0.1);
  color: #475569;
  border-radius: 6px;
  font-weight: 700;
}

.raw-content-wrapper {
  flex: 1;
  overflow-y: auto;
  margin-top: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid rgba(107, 134, 181, 0.08);
}

.raw-content-wrapper::-webkit-scrollbar {
  width: 5px;
}
.raw-content-wrapper::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(107, 134, 181, 0.15);
}

.raw-content-wrapper pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "SFMono-Regular", Monaco, Consolas, "Liberation Mono", Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}

/* 2. 中间栏样式 */
.hero-panel {
  padding: 20px;
  background:
    linear-gradient(135deg, rgba(239, 246, 255, 0.95), rgba(255, 255, 255, 0.95));
  flex: 0 0 auto;
}

.section-tag {
  margin: 0;
  color: #b45309;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.hero-panel h2 {
  margin: 6px 0 10px;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.4;
  color: #0f172a;
}

.conclusion-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: #334155;
}

.meta-row {
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

/* 关键判断点 */
.key-points-panel {
  padding: 16px;
  flex: 0 0 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
}

.key-point-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.key-point-item {
  padding: 12px 14px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

/* 高危 */
.key-point-item--high {
  background: hsl(4, 90%, 97%);
  border: 1px solid hsl(4, 75%, 92%);
}
.key-point-item--high strong {
  color: hsl(4, 70%, 36%);
}
.key-point-item--high .urgency-chip {
  background: hsl(4, 85%, 90%);
  color: hsl(4, 70%, 36%);
}

/* 中危 */
.key-point-item--medium {
  background: hsl(38, 100%, 97%);
  border: 1px solid hsl(38, 85%, 92%);
}
.key-point-item--medium strong {
  color: hsl(35, 75%, 32%);
}
.key-point-item--medium .urgency-chip {
  background: hsl(38, 90%, 90%);
  color: hsl(35, 75%, 32%);
}

/* 低危 */
.key-point-item--low {
  background: hsl(205, 100%, 98%);
  border: 1px solid hsl(205, 80%, 94%);
}
.key-point-item--low strong {
  color: hsl(205, 75%, 32%);
}
.key-point-item--low .urgency-chip {
  background: hsl(205, 80%, 92%);
  color: hsl(205, 75%, 32%);
}

.key-point-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.urgency-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.key-point-item--high .urgency-indicator { background: #ef4444; }
.key-point-item--medium .urgency-indicator { background: #f59e0b; }
.key-point-item--low .urgency-indicator { background: #3b82f6; }

.key-point-header strong {
  flex: 1;
  font-size: 15px;
}

.urgency-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.key-point-detail {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #475569;
}

/* 结构化说明 */
.section-panel {
  padding: 16px;
  flex: 1 1 auto;
}

.section-list {
  display: grid;
  gap: 12px;
}

.text-block {
  padding: 12px;
  border-radius: 12px;
  background: rgba(107, 134, 181, 0.03);
  border: 1px solid rgba(107, 134, 181, 0.06);
}

.block-title {
  display: inline-flex;
  margin-bottom: 6px;
  color: #1e3a8a;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.text-block p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #475569;
}

/* 3. 右侧栏样式 */
.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-accent {
  color: #2563eb;
}
.icon-caution {
  color: #d97706;
}

.list-panel {
  padding: 16px;
  flex: 0 0 auto;
}

.action-card {
  border-top: 4px solid #2563eb;
}
.caution-card {
  border-top: 4px solid #d97706;
}

.action-list,
.caution-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.action-list li,
.caution-list li {
  position: relative;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.65;
  color: #334155;
}

.action-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  top: 0px;
  color: #2563eb;
  font-weight: 900;
  font-size: 14px;
}

.caution-list li::before {
  content: '⚠';
  position: absolute;
  left: 0;
  top: 0px;
  color: #d97706;
  font-weight: 900;
  font-size: 13px;
}

/* 4. 加载、空状态 */
.loading-state,
.empty-state {
  place-self: center;
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 440px;
  padding: 30px;
  text-align: center;
  color: #64748b;
}

.loading-state {
  align-content: center;
}

.loading-state--overlay {
  position: absolute;
  inset: 0;
  align-content: center;
  place-self: stretch;
  justify-items: center;
  max-width: none;
  padding: 24px;
  background: rgba(244, 247, 252, 0.85);
  backdrop-filter: blur(8px);
  z-index: 100;
}

.empty-state--error {
  color: #ef4444;
}

.status-detail {
  max-width: 500px;
  color: #64748b;
  font-size: 12px;
}

.loading-hint {
  max-width: 320px;
  color: #94a3b8;
  font-size: 12px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(105, 134, 183, 0.15);
  border-top-color: #2563eb;
  animation: report-interpretation-spin 0.8s linear infinite;
}

@keyframes report-interpretation-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .window-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'hero'
      'points'
      'sections'
      'side';
  }
}
</style>