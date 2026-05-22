<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, ComposeOption } from 'echarts/core';
import type { SankeySeriesOption } from 'echarts/charts';
import type { TooltipComponentOption } from 'echarts/components';
import Icon from '@shared/ui/Icon.vue';
import type { DiagnosisPathPayload } from '@services/diagnosisPath';
import { useTauriWindowEventListeners } from '@shared/composables/useTauriWindowEventListeners';
import { formatUserFacingError } from '@shared/lib/errorMessages';

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

type SankeyOption = ComposeOption<SankeySeriesOption | TooltipComponentOption>;
type DiagnosisPathWindowPhase =
  | 'preparing'
  | 'cache'
  | 'generating'
  | 'rendering'
  | 'success'
  | 'error';

interface DiagnosisPathWindowStateEvent {
  loading: boolean;
  phase?: DiagnosisPathWindowPhase;
  message?: string;
  detail?: string;
  clearPayload?: boolean;
}

const appWindow = getCurrentWindow();
const chartEl = ref<HTMLDivElement | null>(null);
const payload = ref<DiagnosisPathPayload | null>(null);
const chart = ref<ECharts | null>(null);
const isLoading = ref(true);
const statusPhase = ref<DiagnosisPathWindowPhase>('preparing');
const statusMessage = ref('正在准备诊断路径窗口...');
const statusDetail = ref('正在连接独立窗口和主问诊页面。');
const windowEventListeners = useTauriWindowEventListeners({
  window: appWindow,
  logContext: 'DiagnosisPathWindow',
  listeners: [
    {
      eventName: 'diagnosis-path:update',
      handler: ({ payload: nextPayload }) => {
        isLoading.value = true;
        statusPhase.value = 'rendering';
        statusMessage.value = '正在渲染诊断路径...';
        statusDetail.value = '正在绘制 Sankey 图和右侧说明面板。';
        payload.value = nextPayload as DiagnosisPathPayload;
      },
    },
    {
      eventName: 'diagnosis-path:status',
      handler: ({ payload: nextState }) => {
        const state = nextState as DiagnosisPathWindowStateEvent | undefined;
        isLoading.value = Boolean(state?.loading);
        statusPhase.value = state?.phase || (isLoading.value ? 'preparing' : 'success');
        statusMessage.value = state?.message || (isLoading.value ? '正在生成诊断路径...' : '');
        statusDetail.value = state?.detail || '';

        if (state?.clearPayload) {
          payload.value = null;
          chart.value?.clear();
        }
      },
    },
    {
      eventName: 'tauri://resize',
      handler: () => {
        chart.value?.resize();
      },
    },
  ],
});

const alternativeText = computed(() => payload.value?.alternatives || []);

type ExplanationSectionKey = 'supportingEvidence' | 'counterEvidence' | 'differentialPoints';

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitEvidenceItems(value: string): string[] {
  return value
    .split(/[，。,；;、\n]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2);
}

function normalizeEvidenceItems(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = Array.from(
    new Set(
      source
        .flatMap((item) => splitEvidenceItems(String(item || '')))
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized.slice(0, 4) : fallback;
}

function formatDiagnosisLabel(name: string, code?: string): string {
  return code ? `${name}（${code}）` : name;
}

function buildFallbackSectionItems(
  data: DiagnosisPathPayload,
  section: ExplanationSectionKey
): string[] {
  const chapterLabel = data.chapterRange
    ? `${data.chapterTitle}（${data.chapterRange}）`
    : data.chapterTitle;
  const topAlternatives = (data.alternatives || []).slice(0, 2);

  switch (section) {
    case 'supportingEvidence': {
      const items = [
        data.summary,
        data.facts.length > 0 ? `关键事实：${data.facts.slice(0, 3).join('；')}` : '',
        data.rationale ? `目标诊断依据：${data.rationale}` : '',
        chapterLabel ? `章节归类：${chapterLabel}` : '',
      ];
      return Array.from(new Set(items.filter(Boolean))).slice(0, 4);
    }
    case 'counterEvidence': {
      const items = topAlternatives.map((item) => {
        const label = formatDiagnosisLabel(item.name, item.code);
        return item.rationale
          ? `仍需排除 ${label}：${item.rationale}`
          : `仍需排除 ${label}，需结合体征和检查结果进一步确认`;
      });

      return items.length > 0
        ? Array.from(new Set(items)).slice(0, 4)
        : ['当前记录未见明确反证，仍需结合体征、实验室或影像进一步确认。'];
    }
    case 'differentialPoints': {
      const items = topAlternatives.map((item) => {
        const label = formatDiagnosisLabel(item.name, item.code);
        return item.rationale
          ? `与 ${label} 鉴别：${item.rationale}`
          : `与 ${label} 鉴别时重点比较症状分布、体征和检查结果`;
      });

      return items.length > 0
        ? Array.from(new Set(items)).slice(0, 4)
        : [chapterLabel ? `优先在 ${chapterLabel} 内继续做相近疾病鉴别` : '结合症状分布、体征和检查结果继续鉴别。'];
    }
    default:
      return [];
  }
}

const explanationSections = computed(() => {
  const data = payload.value;
  if (!data) {
    return {
      supportingEvidence: [],
      counterEvidence: [],
      differentialPoints: [],
    };
  }

  return {
    supportingEvidence: normalizeEvidenceItems(
      data.supportingEvidence,
      buildFallbackSectionItems(data, 'supportingEvidence')
    ),
    counterEvidence: normalizeEvidenceItems(
      data.counterEvidence,
      buildFallbackSectionItems(data, 'counterEvidence')
    ),
    differentialPoints: normalizeEvidenceItems(
      data.differentialPoints,
      buildFallbackSectionItems(data, 'differentialPoints')
    ),
  };
});

const loadingTitle = computed(() => {
  switch (statusPhase.value) {
    case 'cache':
      return '正在检查缓存';
    case 'generating':
      return '诊断路径生成中';
    case 'rendering':
      return '诊断路径渲染中';
    case 'error':
      return '诊断路径处理失败';
    case 'success':
      return '诊断路径已就绪';
    case 'preparing':
    default:
      return '诊断路径准备中';
  }
});

const statusSteps = computed(() => [
  { key: 'cache', label: '检查缓存' },
  { key: 'generating', label: '生成推理链' },
  { key: 'rendering', label: '渲染诊断图' },
]);

function stepState(step: 'cache' | 'generating' | 'rendering'): 'done' | 'active' | 'pending' {
  const phaseOrder: DiagnosisPathWindowPhase[] = ['preparing', 'cache', 'generating', 'rendering', 'success', 'error'];
  const stepOrder: Array<'cache' | 'generating' | 'rendering'> = ['cache', 'generating', 'rendering'];
  const currentIndex = phaseOrder.indexOf(statusPhase.value);
  const stepIndex = stepOrder.indexOf(step);

  if (statusPhase.value === 'error') {
    return stepIndex < 2 ? 'done' : 'active';
  }

  if (statusPhase.value === 'success') {
    return 'done';
  }

  const activeIndex = Math.max(0, Math.min(stepOrder.length - 1, currentIndex - 1));
  if (stepIndex < activeIndex) {
    return 'done';
  }
  if (stepIndex === activeIndex) {
    return 'active';
  }
  return 'pending';
}

function buildSankeyLayout(data: DiagnosisPathPayload): { nodeWidth: number; nodeGap: number } {
  const nodeCount = data.nodes.length;

  if (nodeCount >= 16) {
    return { nodeWidth: 10, nodeGap: 12 };
  }

  if (nodeCount >= 12) {
    return { nodeWidth: 12, nodeGap: 16 };
  }

  return { nodeWidth: 14, nodeGap: 20 };
}

function buildInitialZoom(data: DiagnosisPathPayload): number {
  const nodeCount = data.nodes.length;

  if (nodeCount >= 16) {
    return 0.9;
  }

  if (nodeCount >= 12) {
    return 0.94;
  }

  return 1;
}

function buildSankeyViewport(data: DiagnosisPathPayload): {
  width: string;
  height: string;
  left: string;
  top: string;
} {
  const nodeCount = data.nodes.length;

  if (nodeCount >= 16) {
    return {
      width: '82%',
      height: '56%',
      left: '9%',
      top: '22%',
    };
  }

  if (nodeCount >= 12) {
    return {
      width: '84%',
      height: '60%',
      left: '8%',
      top: '20%',
    };
  }

  if (nodeCount >= 8) {
    return {
      width: '86%',
      height: '66%',
      left: '7%',
      top: '17%',
    };
  }

  return {
    width: '88%',
    height: '72%',
    left: '6%',
    top: '14%',
  };
}

function buildChartOption(data: DiagnosisPathPayload): SankeyOption {
  const layout = buildSankeyLayout(data);
  const initialZoom = buildInitialZoom(data);
  const viewport = buildSankeyViewport(data);

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: 'rgba(24, 38, 66, 0.94)',
      borderWidth: 0,
      textStyle: {
        color: '#f8fbff',
        fontSize: 12,
      },
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}<br/>权重：${params.data.value}`;
        }
        return params.data?.name || '';
      },
    },
    series: [
      {
        type: 'sankey',
        data: data.nodes,
        links: data.links,
        left: viewport.left,
        top: viewport.top,
        width: viewport.width,
        height: viewport.height,
        nodeWidth: layout.nodeWidth,
        nodeGap: layout.nodeGap,
        nodeAlign: 'justify',
        draggable: true,
        roam: true,
        roamTrigger: 'global',
        zoom: initialZoom,
        scaleLimit: {
          min: 0.45,
          max: 2.4,
        },
        emphasis: {
          focus: 'adjacency',
        },
        animationDurationUpdate: 260,
        lineStyle: {
          color: 'gradient',
          curveness: 0.5,
          opacity: 0.42,
        },
        itemStyle: {
          borderWidth: 0,
          borderRadius: 6,
        },
        label: {
          color: '#233655',
          fontSize: 12,
          fontWeight: 700,
        },
        levels: [
          {
            depth: 0,
            itemStyle: {
              color: '#7b8798',
            },
            lineStyle: {
              color: 'source',
              opacity: 0.24,
            },
          },
          {
            depth: 1,
            itemStyle: {
              color: '#d65c9b',
            },
            lineStyle: {
              color: 'source',
              opacity: 0.28,
            },
          },
          {
            depth: 2,
            itemStyle: {
              color: '#4d8dff',
            },
            lineStyle: {
              color: 'source',
              opacity: 0.4,
            },
          },
        ],
      },
    ],
  };
}

async function renderChart(data: DiagnosisPathPayload | null): Promise<void> {
  if (!data) {
    return;
  }

  await nextTick();
  await nextTick();

  if (!chartEl.value) {
    throw new Error('诊断路径图表容器未完成挂载。');
  }

  if (!chart.value) {
    chart.value = echarts.init(chartEl.value);
  }

  chart.value.setOption(buildChartOption(data), true);
  chart.value.resize();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function closeWindow(): Promise<void> {
  await appWindow.close();
}

async function resetChartView(): Promise<void> {
  if (!payload.value) {
    return;
  }

  isLoading.value = true;
  statusPhase.value = 'rendering';
  statusMessage.value = '正在重置诊断路径视图...';
  statusDetail.value = '重新布局节点与连线。';
  await renderChart(payload.value);
  isLoading.value = false;
  statusPhase.value = 'success';
  statusMessage.value = '';
  statusDetail.value = '';
}

onMounted(async () => {
  await windowEventListeners.registerListeners();
  await emit('diagnosis-path:ready', { label: appWindow.label });
});

watch(payload, (nextPayload) => {
  if (!nextPayload) {
    return;
  }

  void (async () => {
    try {
      await renderChart(nextPayload);
      isLoading.value = false;
      statusPhase.value = 'success';
      statusMessage.value = '';
      statusDetail.value = '';
      await emit('diagnosis-path:rendered', { label: appWindow.label });
    } catch (error) {
      console.error('[DiagnosisPathWindow] Failed to render chart:', error);
      isLoading.value = false;
      statusPhase.value = 'error';
      statusMessage.value = '诊断路径渲染失败，请稍后重试。';
      statusDetail.value = formatUserFacingError(error, { fallback: '图表组件未能完成渲染。' });
      await emit('diagnosis-path:render-failed', {
        label: appWindow.label,
        message: statusMessage.value,
      });
    }
  })();
}, { immediate: true });

onUnmounted(() => {
  chart.value?.dispose();
  chart.value = null;
});
</script>

<template>
  <section class="diagnosis-path-window">
    <header class="window-header" data-tauri-drag-region>
      <div class="header-copy" data-tauri-drag-region>
        <p class="eyebrow">Diagnosis Path</p>
        <h1>诊断推理路径</h1>
        <span v-if="payload" class="subtitle">{{ payload.patientName }} · {{ payload.diagnosisName }}</span>
      </div>
      <button class="close-btn" title="关闭" @click="closeWindow">
        <Icon icon="lucide:x" size="18" />
      </button>
    </header>

    <div class="window-stage">
      <div v-if="payload" class="window-body" :class="{ 'window-body--loading': isLoading }">
        <section class="chart-panel">
          <div class="chart-toolbar">
            <div class="chart-tips">
              <span>滚轮缩放</span>
              <span>拖动画布</span>
              <span>拖动节点</span>
            </div>
            <button class="toolbar-btn" type="button" @click="resetChartView">重置视图</button>
          </div>
          <div ref="chartEl" class="chart-canvas"></div>
        </section>

        <aside class="explain-panel">
          <div class="explain-block">
            <span class="block-title">病情概述</span>
            <p>{{ payload.summary }}</p>
          </div>

          <div class="explain-block">
            <span class="block-title">推荐诊断</span>
            <strong>{{ payload.diagnosisName }}<span v-if="payload.diagnosisCode">（{{ payload.diagnosisCode }}）</span></strong>
            <p>{{ payload.rationale }}</p>
          </div>

          <div class="explain-block explain-block--support">
            <span class="block-title block-title--support">支持证据</span>
            <ul class="evidence-list">
              <li v-for="item in explanationSections.supportingEvidence" :key="`support-${item}`">{{ item }}</li>
            </ul>
          </div>

          <div class="explain-block explain-block--counter">
            <span class="block-title block-title--counter">反证提醒</span>
            <ul class="evidence-list">
              <li v-for="item in explanationSections.counterEvidence" :key="`counter-${item}`">{{ item }}</li>
            </ul>
          </div>

          <div class="explain-block explain-block--diff">
            <span class="block-title block-title--diff">鉴别要点</span>
            <ul class="evidence-list">
              <li v-for="item in explanationSections.differentialPoints" :key="`diff-${item}`">{{ item }}</li>
            </ul>
          </div>

          <div class="explain-block">
            <span class="block-title">章节归类</span>
            <p>{{ payload.chapterTitle }}<span v-if="payload.chapterRange">（{{ payload.chapterRange }}）</span></p>
          </div>

          <div class="explain-block">
            <span class="block-title">关键事实</span>
            <ul class="tag-list">
              <li v-for="fact in payload.facts" :key="fact">{{ fact }}</li>
            </ul>
          </div>

          <div v-if="alternativeText.length" class="explain-block">
            <span class="block-title">备选诊断</span>
            <div v-for="item in alternativeText" :key="`${item.name}-${item.code || ''}`" class="alt-item">
              <strong>{{ item.name }}<span v-if="item.code">（{{ item.code }}）</span></strong>
              <span v-if="item.rate" class="alt-rate">{{ item.rate }}</span>
              <p>{{ item.rationale || '未返回更多说明。' }}</p>
            </div>
          </div>

          <div class="explain-block muted">
            <span class="block-title">生成时间</span>
            <p>{{ payload.generatedAt }}</p>
          </div>
        </aside>
      </div>

      <div v-if="isLoading" class="loading-state" :class="{ 'loading-state--overlay': !!payload }">
        <div class="loading-spinner" aria-hidden="true"></div>
        <h2>{{ loadingTitle }}</h2>
        <p>{{ statusMessage || '正在准备结构化推理链，请稍候。' }}</p>
        <p v-if="statusDetail" class="status-detail">{{ statusDetail }}</p>
        <div class="status-steps" aria-label="诊断路径处理阶段">
          <span
            v-for="step in statusSteps"
            :key="step.key"
            class="status-step"
            :class="`status-step--${stepState(step.key as 'cache' | 'generating' | 'rendering')}`"
          >
            {{ step.label }}
          </span>
        </div>
      </div>

      <div v-else-if="!payload" class="empty-state" :class="{ 'empty-state--error': statusPhase === 'error' }">
        <Icon :icon="statusPhase === 'error' ? 'lucide:triangle-alert' : 'lucide:workflow'" size="34" />
        <h2>{{ loadingTitle }}</h2>
        <p>{{ statusMessage || '等待诊断路径数据' }}</p>
        <p v-if="statusDetail" class="status-detail">{{ statusDetail }}</p>
        <p v-if="statusPhase !== 'error'">请从推荐诊断区域点击“查看诊断路径”，在新窗口载入当前诊断推理流向。</p>
        <p v-else>可以关闭窗口后重试；如果持续失败，请检查模型响应或渲染日志。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.diagnosis-path-window {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  background:
    radial-gradient(circle at top left, rgba(255, 194, 214, 0.22), transparent 26%),
    radial-gradient(circle at top right, rgba(139, 176, 255, 0.22), transparent 28%),
    linear-gradient(180deg, #f9fbff 0%, #eef4ff 100%);
  color: #233655;
}

.window-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(118, 151, 206, 0.18);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(10px);
}

.eyebrow {
  margin: 0 0 4px;
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
  font-size: 28px;
  line-height: 1.08;
}

.subtitle {
  display: inline-block;
  margin-top: 6px;
  color: #5e7195;
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
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.close-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(86, 121, 187, 0.18);
}

.window-stage {
  position: relative;
  min-height: 0;
}

.window-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 2.08fr) minmax(300px, 0.86fr);
  gap: 12px;
  padding: 12px 14px 14px;
}

.window-body--loading {
  filter: saturate(0.92);
}

.chart-panel,
.explain-panel {
  min-height: 0;
  border-radius: 24px;
  border: 1px solid rgba(118, 151, 206, 0.16);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 34px rgba(52, 94, 156, 0.1);
}

.chart-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  padding: 8px;
}

.chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 600px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(249, 251, 255, 0.92), rgba(239, 245, 255, 0.92));
}

.chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 6px 0;
}

.chart-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chart-tips span,
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.chart-tips span {
  background: rgba(84, 132, 216, 0.1);
  color: #4669a4;
}

.toolbar-btn {
  border: 1px solid rgba(84, 132, 216, 0.18);
  background: rgba(255, 255, 255, 0.92);
  color: #3d68b2;
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out);
}

.toolbar-btn:hover {
  background: rgba(240, 246, 255, 0.98);
  transform: translateY(-1px);
}

.explain-panel {
  padding: 16px;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 12px;
}

.explain-block {
  padding: 14px;
  border-radius: 18px;
  background: rgba(244, 248, 255, 0.96);
  border: 1px solid rgba(118, 151, 206, 0.12);
}

.explain-block--support {
  background: linear-gradient(180deg, rgba(240, 246, 255, 0.98), rgba(250, 253, 255, 0.98));
}

.explain-block--counter {
  background: linear-gradient(180deg, rgba(255, 244, 244, 0.98), rgba(255, 250, 250, 0.98));
}

.explain-block--diff {
  background: linear-gradient(180deg, rgba(239, 250, 247, 0.98), rgba(250, 255, 253, 0.98));
}

.explain-block.muted {
  background: rgba(249, 250, 253, 0.96);
}

.block-title {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(84, 132, 216, 0.1);
  color: #4167a7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.block-title--support {
  background: rgba(84, 132, 216, 0.12);
  color: #4167a7;
}

.block-title--counter {
  background: rgba(226, 96, 96, 0.12);
  color: #b24747;
}

.block-title--diff {
  background: rgba(73, 185, 154, 0.12);
  color: #2f7a66;
}

.explain-block strong {
  display: block;
  margin-top: 10px;
  font-size: 16px;
}

.explain-block p {
  margin: 10px 0 0;
  color: #5d6f8e;
  font-size: 13px;
  line-height: 1.65;
}

.evidence-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: grid;
  gap: 8px;
}

.evidence-list li {
  position: relative;
  padding: 10px 12px 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(118, 151, 206, 0.12);
  background: rgba(255, 255, 255, 0.88);
  color: #516481;
  font-size: 13px;
  line-height: 1.55;
}

.evidence-list li::before {
  content: '';
  position: absolute;
  top: 14px;
  left: 8px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.tag-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-list li {
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(233, 241, 255, 0.92);
  color: #4a6ca8;
  font-size: 12px;
  font-weight: 700;
}

.alt-item + .alt-item {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(118, 151, 206, 0.18);
}

.alt-rate {
  display: inline-flex;
  margin-top: 6px;
  color: #4772bc;
  font-size: 12px;
  font-weight: 800;
}

.loading-state,
.empty-state {
  place-self: center;
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 420px;
  padding: 24px;
  text-align: center;
  color: #5e7195;
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
  z-index: 3;
}

.loading-state p,
.empty-state p {
  margin: 0;
  line-height: 1.6;
}

.status-detail {
  max-width: 520px;
  color: #7486a7;
  font-size: 13px;
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

.empty-state--error {
  color: #8a5361;
}

.loading-spinner {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 4px solid rgba(84, 132, 216, 0.16);
  border-top-color: #4d8dff;
  box-shadow: 0 16px 30px rgba(77, 141, 255, 0.16);
  animation: diagnosis-path-spin 0.9s linear infinite;
}

@keyframes diagnosis-path-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
