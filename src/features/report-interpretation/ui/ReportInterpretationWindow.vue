<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emitTo } from '@tauri-apps/api/event';
import Icon from '@shared/ui/Icon.vue';
import ReportInterpretationContent from './ReportInterpretationContent.vue';
import { useTauriWindowEventListeners } from '@shared/composables/useTauriWindowEventListeners';
import type {
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

const reportSubtitle = computed(() => {
  const current = payload.value;
  if (!current) return '';
  const title = current.reportMeta?.reportTitle || current.reportMeta?.reportItem || current.reportKindLabel;
  return title === current.reportKindLabel ? current.reportKindLabel : `${title}（${current.reportKindLabel}）`;
});

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
        <button class="window-action-btn close-btn" type="button" title="关闭" @click.stop="closeWindow">
          <Icon icon="lucide:x" size="18" />
        </button>
      </div>
    </header>

    <div class="window-stage">
      <div v-if="payload" class="window-body" :class="{ 'window-body--loading': isLoading }">
        <ReportInterpretationContent :payload="payload" />
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

}
</style>
