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
        <section class="summary-panel hero-panel">
          <p class="section-tag">快速概览</p>
          <h2>{{ payload.summary }}</h2>
          <p>{{ payload.conclusion }}</p>
          <div class="meta-row">
            <span>{{ payload.reportKindLabel }}</span>
            <span>{{ payload.generatedAt }}</span>
          </div>
        </section>

        <section class="key-points-panel card-panel">
          <div class="panel-head">
            <h3>关键判断点</h3>
            <span>{{ payload.keyPoints.length }} 条</span>
          </div>
          <ul class="key-point-list">
            <li v-for="item in payload.keyPoints" :key="`${item.title}-${item.detail}`" class="key-point-item" :class="`key-point-item--${urgencyToneMap[item.urgency || 'medium']}`">
              <div class="key-point-header">
                <strong>{{ item.title }}</strong>
                <span class="urgency-chip">{{ item.urgency === 'high' ? '高关注' : item.urgency === 'low' ? '低关注' : '中关注' }}</span>
              </div>
              <p>{{ item.detail }}</p>
            </li>
          </ul>
        </section>

        <section class="section-panel card-panel">
          <div class="panel-head">
            <h3>结构化说明</h3>
            <span>结合患者背景阅读</span>
          </div>
          <div class="section-list">
            <article v-for="item in payload.sections" :key="`${item.title}-${item.content}`" class="text-block">
              <span class="block-title">{{ item.title }}</span>
              <p>{{ item.content }}</p>
            </article>
          </div>
        </section>

        <aside class="side-panel">
          <section class="card-panel patient-panel">
            <div class="panel-head">
              <h3>患者背景</h3>
            </div>
            <p>{{ payload.patientSummary }}</p>
          </section>

          <section class="card-panel list-panel">
            <div class="panel-head">
              <h3>建议</h3>
            </div>
            <ul>
              <li v-for="item in payload.recommendations" :key="item">{{ item }}</li>
            </ul>
          </section>

          <section class="card-panel list-panel caution-panel">
            <div class="panel-head">
              <h3>注意事项</h3>
            </div>
            <ul>
              <li v-for="item in payload.cautions" :key="item">{{ item }}</li>
            </ul>
          </section>

          <section class="card-panel raw-panel">
            <div class="panel-head">
              <h3>原始报告</h3>
            </div>
            <pre>{{ payload.sourceQuery }}</pre>
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
    radial-gradient(circle at top left, rgba(255, 230, 196, 0.34), transparent 28%),
    radial-gradient(circle at right center, rgba(120, 185, 255, 0.18), transparent 26%),
    linear-gradient(180deg, #fbfcff 0%, #eef4fb 100%);
  color: #213149;
}

.window-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(104, 132, 170, 0.18);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  cursor: grab;
}

.header-copy {
  flex: 1;
  min-width: 0;
}

.window-header:active {
  cursor: grabbing;
}

.header-copy h1,
.loading-state h2,
.empty-state h2 {
  margin: 0;
}

.header-copy h1 {
  font-size: 26px;
  line-height: 1.12;
}

.subtitle {
  margin: 8px 0 0;
  color: #7184a3;
  font-size: 13px;
  font-weight: 600;
}

.close-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: #6b86b5;
  cursor: pointer;
  flex: 0 0 auto;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 10px 18px rgba(89, 118, 169, 0.14);
  transform: translateY(-1px);
}

.window-stage {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.window-stage::-webkit-scrollbar {
  width: 10px;
}

.window-stage::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(107, 134, 181, 0.34);
}

.window-stage::-webkit-scrollbar-track {
  background: transparent;
}

.window-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.86fr);
  grid-template-areas:
    'hero side'
    'points side'
    'sections side';
  gap: 14px;
  padding: 14px 14px 24px;
}

.window-body--loading {
  filter: saturate(0.94);
}

.summary-panel,
.card-panel {
  border-radius: 24px;
  border: 1px solid rgba(110, 140, 183, 0.16);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 34px rgba(52, 94, 156, 0.08);
}

.hero-panel {
  grid-area: hero;
  padding: 22px 24px;
  background:
    linear-gradient(135deg, rgba(255, 244, 224, 0.96), rgba(239, 248, 255, 0.92)),
    rgba(255, 255, 255, 0.92);
}

.hero-panel h2 {
  margin: 6px 0 10px;
  font-size: 30px;
  line-height: 1.15;
}

.hero-panel p {
  margin: 0;
  line-height: 1.7;
}

.section-tag {
  margin: 0;
  color: #7d6b3f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  color: #5d6f8c;
  font-size: 12px;
  font-weight: 700;
}

.key-points-panel {
  grid-area: points;
  padding: 18px;
}

.section-panel {
  grid-area: sections;
  padding: 18px;
}

.side-panel {
  grid-area: side;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
}

.patient-panel,
.list-panel,
.raw-panel {
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-head h3 {
  margin: 0;
  font-size: 17px;
}

.panel-head span {
  color: #7890b2;
  font-size: 12px;
  font-weight: 700;
}

.key-point-list,
.list-panel ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.key-point-list {
  display: grid;
  gap: 12px;
}

.key-point-item {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(110, 140, 183, 0.12);
  background: #f7fbff;
}

.key-point-item--high {
  background: rgba(255, 239, 229, 0.88);
}

.key-point-item--medium {
  background: rgba(246, 248, 255, 0.96);
}

.key-point-item--low {
  background: rgba(241, 249, 243, 0.96);
}

.key-point-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.key-point-item p,
.text-block p,
.patient-panel p,
.list-panel li,
.empty-state p,
.loading-state p {
  margin: 0;
  line-height: 1.65;
}

.key-point-item p {
  margin-top: 8px;
}

.urgency-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: #5b6f92;
  font-size: 12px;
  font-weight: 800;
}

.section-list {
  display: grid;
  gap: 14px;
}

.text-block {
  padding: 14px 16px;
  border-radius: 18px;
  background: #f8fbff;
}

.block-title {
  display: inline-flex;
  margin-bottom: 8px;
  color: #48648f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.list-panel ul {
  display: grid;
  gap: 10px;
}

.list-panel li {
  padding-left: 16px;
  position: relative;
}

.list-panel li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6e8fd8;
}

.caution-panel li::before {
  background: #df855e;
}

.raw-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SFMono-Regular', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #41536d;
}

.loading-state,
.empty-state {
  place-self: center;
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 480px;
  padding: 24px;
  text-align: center;
  color: #5e7195;
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
  background: rgba(247, 250, 255, 0.78);
  backdrop-filter: blur(6px);
}

.empty-state--error {
  color: #b25e4f;
}

.status-detail {
  max-width: 540px;
  color: #7486a7;
  font-size: 13px;
}

.loading-hint {
  max-width: 360px;
  color: #8a99b2;
  font-size: 13px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid rgba(105, 134, 183, 0.2);
  border-top-color: #6a8bd4;
  animation: report-interpretation-spin 0.9s linear infinite;
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