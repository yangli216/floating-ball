<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emitTo } from '@tauri-apps/api/event';
import Icon from '@shared/ui/Icon.vue';
import { useTauriWindowEventListeners } from '@shared/composables/useTauriWindowEventListeners';
import type {
  ReportInterpretationAbnormalItem,
  ReportInterpretationWindowPayload,
  ReportInterpretationWindowStateEvent,
} from '@/types/reportInterpretation';

const appWindow = getCurrentWindow();
const MAIN_WINDOW_LABEL = 'main';
type ReportInterpretationWindowPhase = 'preparing' | 'generating' | 'rendering' | 'success' | 'error';

const payload = ref<ReportInterpretationWindowPayload | null>(null);
const isLoading = ref(true);
const statusPhase = ref<ReportInterpretationWindowPhase>('preparing');
const statusMessage = ref('正在准备报告解读窗口...');
const statusDetail = ref('正在连接主窗口与独立结果页。');

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

const statusSteps = computed(() => [
  { key: 'preparing', label: '接收报告' },
  { key: 'generating', label: 'AI 解读' },
  { key: 'rendering', label: '渲染报告' },
] as const);

function stepState(step: 'preparing' | 'generating' | 'rendering'): 'done' | 'active' | 'pending' {
  const stepOrder: Array<'preparing' | 'generating' | 'rendering'> = ['preparing', 'generating', 'rendering'];

  if (statusPhase.value === 'success') {
    return 'done';
  }

  if (statusPhase.value === 'error') {
    return step === 'rendering' ? 'active' : 'done';
  }

  const currentIndex = Math.max(0, stepOrder.indexOf(statusPhase.value));
  const stepIndex = stepOrder.indexOf(step);

  if (stepIndex < currentIndex) {
    return 'done';
  }

  if (stepIndex === currentIndex) {
    return 'active';
  }

  return 'pending';
}

const reportSubtitle = computed(() => {
  const current = payload.value;
  if (!current) {
    return '';
  }

  const title = current.reportMeta?.reportTitle || current.reportMeta?.reportItem || current.reportKindLabel;
  return title === current.reportKindLabel ? current.reportKindLabel : `${title}（${current.reportKindLabel}）`;
});

const patientDisplay = computed(() => {
  const patient = payload.value?.patient;
  if (!patient) {
    return payload.value?.patientSummary || '未提供';
  }

  return [patient.patientName || '未命名患者', patient.genderText, patient.ageText].filter(Boolean).join(' ');
});

const abnormalItemsForDisplay = computed<ReportInterpretationAbnormalItem[]>(() => {
  const current = payload.value;
  if (!current) {
    return [];
  }

  if (current.abnormalItems?.length) {
    return current.abnormalItems;
  }

  return current.keyPoints.map((item) => ({
    name: item.title,
    result: item.detail,
    direction: item.urgency === 'high' ? 'abnormal' : 'neutral',
    meaning: item.detail,
    urgency: item.urgency,
  }));
});

function displayText(value: string | null | undefined): string {
  return value || '--';
}

function urgencyLabel(value: string | undefined): string {
  if (value === 'high') {
    return '重点';
  }

  if (value === 'low') {
    return '提示';
  }

  return '警示';
}

function directionText(item: ReportInterpretationAbnormalItem): string {
  if (item.direction === 'up') {
    return '↑';
  }

  if (item.direction === 'down') {
    return '↓';
  }

  if (item.direction === 'positive') {
    return '阳性';
  }

  if (item.direction === 'abnormal') {
    return '异常';
  }

  return '无';
}

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
  if (target instanceof Element && target.closest('.window-action-btn')) {
    return;
  }

  await appWindow.startDragging();
}

function buildShareText(): string {
  const current = payload.value;
  if (!current) {
    return '';
  }

  return [
    'AI 报告解读',
    reportSubtitle.value,
    `患者：${patientDisplay.value}`,
    `摘要：${current.summary}`,
    `结论：${current.conclusion}`,
    '',
    '异常项目：',
    ...abnormalItemsForDisplay.value.map((item) => `- ${item.name} ${item.result}${item.referenceRange ? `（${item.referenceRange}）` : ''}`),
    '',
    '综合判断：',
    ...current.keyPoints.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`),
    '',
    '建议：',
    ...current.recommendations.map((item) => `- ${item}`),
  ].filter(Boolean).join('\n');
}

async function copyReportText(): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildShareText());
  } catch (error) {
    console.warn('[ReportInterpretationWindow] copy report text failed:', error);
  }
}

function printReport(): void {
  window.print();
}

const windowEventListeners = useTauriWindowEventListeners({
  window: appWindow,
  logContext: 'ReportInterpretationWindow',
  listeners: [
    {
      eventName: 'report-interpretation:update',
      handler: ({ payload: nextPayload }) => {
        const nextReportPayload = nextPayload as ReportInterpretationWindowPayload;
        console.info('[ReportInterpretationWindow] Received payload update:', {
          requestId: nextReportPayload?.requestId,
          taskId: nextReportPayload?.taskId,
        });
        payload.value = nextReportPayload;
        isLoading.value = false;
        statusPhase.value = 'success';
        statusMessage.value = '';
        statusDetail.value = '';
      },
    },
    {
      eventName: 'report-interpretation:status',
      handler: ({ payload: nextState }) => {
        const state = nextState as ReportInterpretationWindowStateEvent | undefined;
        console.info('[ReportInterpretationWindow] Received status update:', state);
        isLoading.value = Boolean(state?.loading);
        statusPhase.value = state?.phase || (isLoading.value ? 'preparing' : 'success');
        statusMessage.value = state?.message || '';
        statusDetail.value = state?.detail || '';

        if (state?.clearPayload) {
          payload.value = null;
        }
      },
    },
  ],
});

onMounted(async () => {
  console.info('[ReportInterpretationWindow] Mounting window:', appWindow.label);

  await windowEventListeners.registerListeners();
  console.info('[ReportInterpretationWindow] Listeners registered, notifying main window');
  await emitTo(MAIN_WINDOW_LABEL, 'report-interpretation:ready', { label: appWindow.label });
});
</script>

<template>
  <section class="report-window">
    <header class="window-header" @mousedown.left="handleHeaderMouseDown">
      <div class="header-copy">
        <p class="eyebrow">Report Interpretation</p>
        <h1>AI 报告解读</h1>
        <span>{{ payload ? reportSubtitle : '检验/检查报告辅助解读' }}</span>
      </div>
      <div class="window-actions" @mousedown.stop>
        <button class="window-action-btn" type="button" title="打印/导出" :disabled="!payload" @click.stop="printReport">
          <Icon icon="lucide:download" size="18" />
        </button>
        <button class="window-action-btn" type="button" title="复制解读文本" :disabled="!payload" @click.stop="copyReportText">
          <Icon icon="lucide:copy" size="18" />
        </button>
        <button class="window-action-btn close-btn" type="button" title="关闭" @click.stop="closeWindow">
          <Icon icon="lucide:x" size="18" />
        </button>
      </div>
    </header>

    <div class="window-stage">
      <div v-if="payload" class="window-body" :class="{ 'window-body--loading': isLoading }">
        <main class="report-paper" aria-label="AI 报告解读结果">
          <section class="report-title-block">
            <h1>AI 报告解读</h1>
            <p>{{ reportSubtitle }}</p>
          </section>

          <section class="report-meta-block" aria-label="报告基础信息">
            <div class="meta-row meta-row--primary">
              <div class="meta-field meta-field--patient">
                <span class="meta-label">患者</span>
                <strong>{{ patientDisplay }}</strong>
              </div>
              <div class="meta-field">
                <span class="meta-label">门诊编号</span>
                <strong>{{ displayText(payload.reportMeta?.outpatientNo) }}</strong>
              </div>
              <div class="meta-field">
                <span class="meta-label">样本编号</span>
                <strong>{{ displayText(payload.reportMeta?.sampleNo) }}</strong>
              </div>
            </div>
            <div class="meta-row">
              <div class="meta-field">
                <span class="meta-label">送检医生</span>
                <strong>{{ displayText(payload.reportMeta?.submitDoctor) }}</strong>
              </div>
              <div class="meta-field">
                <span class="meta-label">申请时间</span>
                <strong>{{ displayText(payload.reportMeta?.requestTime || payload.reportMeta?.reportDate) }}</strong>
              </div>
              <div class="meta-field">
                <span class="meta-label">{{ payload.taskId === 'inspectReport' ? '检验时间' : '检查时间' }}</span>
                <strong>{{ displayText(payload.reportMeta?.resultTime) }}</strong>
              </div>
            </div>
            <div class="history-line">
              <span class="meta-label">病历</span>
              <p>{{ displayText(payload.reportMeta?.historyText || payload.patientSummary) }}</p>
            </div>
          </section>

          <section class="summary-block">
            <h2>{{ payload.summary }}</h2>
            <p>{{ payload.conclusion }}</p>
            <span>解读时间：{{ payload.generatedAt }}</span>
          </section>

          <section class="report-section abnormal-section">
            <h2>异常项目</h2>
            <div v-if="abnormalItemsForDisplay.length > 0" class="abnormal-table" role="table" aria-label="异常项目">
              <div class="abnormal-row abnormal-row--head" role="row">
                <span>项目</span>
                <span>结果</span>
                <span>方向</span>
                <span>参考范围 / 说明</span>
                <span>临床意义</span>
              </div>
              <div
                v-for="item in abnormalItemsForDisplay"
                :key="`${item.name}-${item.result}`"
                class="abnormal-row"
                :class="`abnormal-row--${item.urgency || 'medium'}`"
                role="row"
              >
                <strong>{{ item.name }}</strong>
                <span class="abnormal-result">{{ item.result }}</span>
                <span class="direction-mark" :class="`direction-mark--${item.direction || 'neutral'}`">
                  {{ directionText(item) }}
                </span>
                <span>{{ displayText(item.referenceRange) }}</span>
                <span>{{ displayText(item.meaning) }}</span>
              </div>
            </div>
            <p v-else class="empty-report-line">未从报告原文中提取到明确异常项目，请结合原始报告完整阅读。</p>
          </section>

          <section class="report-section judgement-section">
            <h2>综合判断</h2>
            <article
              v-for="(item, index) in payload.keyPoints"
              :key="`${item.title}-${item.detail}`"
              class="judgement-item"
              :class="`judgement-item--${item.urgency || 'medium'}`"
            >
              <h3>{{ index + 1 }}. {{ item.title }}（{{ urgencyLabel(item.urgency) }}）：</h3>
              <p>{{ item.detail }}</p>
            </article>
            <div v-if="payload.sections && payload.sections.length > 0" class="analysis-list">
              <article v-for="item in payload.sections" :key="`${item.title}-${item.content}`">
                <strong>{{ item.title }}</strong>
                <p>{{ item.content }}</p>
              </article>
            </div>
          </section>

          <section class="report-section advice-section">
            <div>
              <h2>建议下一步行动</h2>
              <ul>
                <li v-for="item in payload.recommendations" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div>
              <h2>注意事项</h2>
              <ul>
                <li v-for="item in payload.cautions" :key="item">{{ item }}</li>
              </ul>
            </div>
          </section>

          <section class="raw-report-section">
            <details>
              <summary>原始报告原文</summary>
              <pre>{{ payload.sourceQuery }}</pre>
            </details>
          </section>
        </main>
      </div>

      <div v-else-if="!isLoading" class="empty-state" :class="{ 'empty-state--error': statusPhase === 'error' }">
        <div class="state-icon">
          <Icon :icon="statusPhase === 'error' ? 'lucide:triangle-alert' : 'lucide:file-text'" size="28" />
        </div>
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
        <div class="status-steps" aria-label="报告解读处理阶段">
          <span
            v-for="step in statusSteps"
            :key="step.key"
            class="status-step"
            :class="`status-step--${stepState(step.key)}`"
          >
            {{ step.label }}
          </span>
        </div>
        <p v-if="!payload" class="loading-hint">解读结果会在当前窗口直接刷新显示。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.report-window {
  position: relative;
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(139, 176, 255, 0.24), transparent 30%),
    linear-gradient(180deg, #f9fbff 0%, #eef7fb 100%);
  color: #233655;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.window-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(118, 151, 206, 0.18);
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(10px);
  cursor: grab;
  z-index: 10;
}

.window-header:active {
  cursor: grabbing;
}

.header-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #5e7195;
}

.eyebrow {
  margin: 0;
  color: #6b7da0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.header-copy h1,
.loading-state h2,
.empty-state h2 {
  margin: 0;
}

.header-copy h1 {
  color: #183657;
  font-size: 26px;
  line-height: 1.08;
  font-weight: 800;
}

.header-copy span {
  color: #5e7195;
  font-size: 13px;
  font-weight: 600;
}

.window-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.window-action-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(118, 151, 206, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #4d8dff;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(86, 121, 187, 0.08);
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.window-action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(240, 246, 255, 0.98);
  box-shadow: 0 12px 22px rgba(86, 121, 187, 0.18);
}

.window-action-btn:disabled {
  background: rgba(247, 250, 255, 0.7);
  color: #a8b3c1;
  cursor: default;
  box-shadow: none;
}

.close-btn {
  color: #7e8ea8;
}

.close-btn:hover {
  color: #475569;
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
  overflow-y: auto;
  padding: 18px 20px 22px;
}

.window-body--loading {
  filter: saturate(0.92) contrast(0.98);
  pointer-events: none;
}

.report-paper {
  width: min(940px, 100%);
  min-height: calc(100vh - 92px);
  margin: 0 auto;
  padding: 28px 38px 36px;
  background: #ffffff;
  border: 1px solid rgba(118, 151, 206, 0.18);
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(52, 94, 156, 0.12);
}

.report-title-block {
  text-align: center;
  padding-bottom: 24px;
}

.report-title-block h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.2;
  font-weight: 800;
  color: #050505;
}

.report-title-block p {
  margin: 10px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.report-meta-block {
  border-top: 1px solid #8795a8;
  border-bottom: 1px solid #8795a8;
  padding: 12px 0 14px;
}

.meta-row {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.meta-row + .meta-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d9e0ea;
}

.meta-field {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 15px;
  line-height: 1.45;
}

.meta-field--patient strong {
  font-weight: 700;
}

.meta-label {
  flex: 0 0 auto;
  color: #111827;
  font-weight: 700;
}

.meta-field strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #111827;
  font-weight: 500;
}

.history-line {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d9e0ea;
}

.history-line p {
  margin: 0;
  flex: 1;
  color: #111827;
  font-size: 15px;
  line-height: 1.7;
}

.summary-block {
  margin-top: 18px;
  padding: 14px 0 16px;
  border-bottom: 1px solid #8795a8;
}

.summary-block h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.55;
  color: #111827;
}

.summary-block p {
  margin: 8px 0 0;
  color: #243044;
  font-size: 15px;
  line-height: 1.8;
}

.summary-block span {
  display: inline-flex;
  margin-top: 10px;
  color: #6b7280;
  font-size: 12px;
}

.report-section {
  padding: 18px 0;
  border-bottom: 1px dashed #8795a8;
}

.report-section h2 {
  margin: 0 0 14px;
  color: #111827;
  font-size: 18px;
  line-height: 1.35;
}

.abnormal-table {
  display: grid;
  gap: 0;
}

.abnormal-row {
  display: grid;
  grid-template-columns: minmax(128px, 1fr) minmax(118px, 0.85fr) 58px minmax(126px, 0.85fr) minmax(180px, 1.45fr);
  gap: 12px;
  align-items: start;
  min-height: 42px;
  padding: 9px 0;
  border-bottom: 1px solid #e6ebf2;
  color: #293241;
  font-size: 14px;
  line-height: 1.55;
}

.abnormal-row--head {
  min-height: auto;
  padding: 6px 0 8px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 700;
}

.abnormal-row:last-child {
  border-bottom: none;
}

.abnormal-row strong {
  color: #111827;
  font-weight: 600;
}

.abnormal-result {
  color: #ef4444;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.direction-mark {
  color: #2f8cff;
  font-weight: 800;
}

.direction-mark--up,
.direction-mark--positive,
.direction-mark--abnormal {
  color: #ef4444;
}

.direction-mark--down {
  color: #2f8cff;
}

.abnormal-row--high {
  background: linear-gradient(90deg, rgba(254, 226, 226, 0.35), transparent 45%);
}

.empty-report-line {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.7;
}

.judgement-section {
  display: grid;
  gap: 12px;
}

.judgement-item {
  padding-left: 0;
}

.judgement-item h3 {
  margin: 0 0 7px;
  color: #ef4444;
  font-size: 16px;
  line-height: 1.55;
}

.judgement-item--low h3 {
  color: #2563eb;
}

.judgement-item p {
  margin: 0;
  color: #111827;
  font-size: 15px;
  line-height: 1.8;
}

.analysis-list {
  display: grid;
  gap: 12px;
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid #e6ebf2;
}

.analysis-list article {
  display: grid;
  gap: 5px;
}

.analysis-list strong {
  color: #1f4f88;
  font-size: 14px;
}

.analysis-list p {
  margin: 0;
  color: #293241;
  font-size: 15px;
  line-height: 1.75;
}

.advice-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 28px;
  border-bottom-style: solid;
}

.advice-section ul {
  margin: 0;
  padding-left: 18px;
}

.advice-section li {
  margin: 0 0 8px;
  color: #111827;
  font-size: 15px;
  line-height: 1.75;
}

.raw-report-section {
  padding-top: 16px;
}

.raw-report-section summary {
  color: #536273;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.raw-report-section pre {
  margin: 12px 0 0;
  max-height: 240px;
  overflow: auto;
  padding: 12px;
  border: 1px solid #dbe3ee;
  background: #f8fafc;
  color: #293241;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "SFMono-Regular", Monaco, Consolas, "Liberation Mono", Courier, monospace;
  font-size: 13px;
  line-height: 1.65;
}

.loading-state,
.empty-state {
  display: grid;
  place-self: center;
  box-sizing: border-box;
  justify-items: center;
  gap: 10px;
  padding: 28px;
  text-align: center;
  color: #5e7195;
}

.empty-state {
  width: min(460px, calc(100% - 48px));
  max-width: 460px;
  border: 1px solid rgba(118, 151, 206, 0.16);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 34px rgba(52, 94, 156, 0.1);
  backdrop-filter: blur(10px);
}

.loading-state {
  width: 100%;
  height: 100%;
  max-width: none;
  align-content: center;
  justify-content: center;
}

.loading-state--overlay {
  position: absolute;
  inset: 0;
  align-content: center;
  place-self: stretch;
  justify-items: center;
  width: auto;
  padding: 24px;
  background: rgba(247, 250, 255, 0.78);
  backdrop-filter: blur(6px);
  z-index: 100;
}

.empty-state--error {
  color: #8a5361;
}

.state-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: rgba(77, 141, 255, 0.12);
  color: #4d8dff;
}

.status-detail {
  max-width: 520px;
  color: #7486a7;
  font-size: 13px;
}

.loading-hint {
  max-width: 320px;
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
}

.loading-state p,
.empty-state p {
  margin: 0;
  line-height: 1.6;
}

.loading-spinner {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 4px solid rgba(84, 132, 216, 0.16);
  border-top-color: #4d8dff;
  box-shadow: 0 16px 30px rgba(77, 141, 255, 0.16);
  animation: report-interpretation-spin 0.9s linear infinite;
}

.status-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
}

.status-step {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(118, 151, 206, 0.18);
  font-size: 12px;
  font-weight: 700;
}

.status-step--pending {
  background: rgba(255, 255, 255, 0.72);
  color: #8a98b2;
}

.status-step--active {
  background: rgba(77, 141, 255, 0.14);
  border-color: rgba(77, 141, 255, 0.28);
  color: #4274ca;
}

.status-step--done {
  background: rgba(73, 185, 154, 0.14);
  border-color: rgba(73, 185, 154, 0.24);
  color: #2f7a66;
}

@keyframes report-interpretation-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .window-header {
    padding: 10px 12px;
  }

  .header-copy span {
    display: none;
  }

  .window-body {
    padding: 12px;
  }

  .report-paper {
    min-height: calc(100vh - 72px);
    padding: 22px 18px 28px;
  }

  .report-title-block h1 {
    font-size: 26px;
  }

  .report-title-block p {
    font-size: 16px;
  }

  .meta-row,
  .advice-section {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .abnormal-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding: 12px 0;
  }

  .abnormal-row--head {
    display: none;
  }
}

@media print {
  @page {
    size: A4;
    margin: 12mm;
  }

  :global(html),
  :global(body),
  :global(#app) {
    width: auto !important;
    height: auto !important;
    min-height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }

  :global(body) {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-window {
    display: block !important;
    position: static !important;
    height: auto !important;
    min-height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .window-header,
  .loading-state {
    display: none;
  }

  .window-stage,
  .window-body {
    display: block !important;
    position: static !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    filter: none !important;
  }

  .report-paper {
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    break-after: auto;
    page-break-after: auto;
  }

  .report-title-block,
  .report-meta-block,
  .summary-block,
  .abnormal-row,
  .judgement-item,
  .analysis-list article,
  .advice-section li {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-section,
  .advice-section,
  .raw-report-section {
    break-inside: auto;
    page-break-inside: auto;
  }

  .raw-report-section pre {
    max-height: none !important;
    overflow: visible !important;
  }
}
</style>
