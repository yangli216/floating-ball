<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type {
  BloodGlucosePoint,
  BloodPressurePoint,
  ChronicMetricKind,
} from '../types';

const props = defineProps<{
  metric: ChronicMetricKind;
  bloodPressurePoints: BloodPressurePoint[];
  bloodGlucosePoints: BloodGlucosePoint[];
}>();

const chartEl = ref<HTMLDivElement | null>(null);
const chart = ref<ECharts | null>(null);
let resizeObserver: ResizeObserver | null = null;

const hasData = computed(() => props.metric === 'blood-pressure'
  ? props.bloodPressurePoints.length > 0
  : props.bloodGlucosePoints.length > 0);

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildPressureOption(): EChartsOption {
  const points = props.bloodPressurePoints;
  return {
    animationDuration: 260,
    color: ['#f97316', '#2b7fe3'],
    grid: { left: 42, right: 14, top: 34, bottom: 30 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const index = params?.[0]?.dataIndex ?? 0;
        const point = points[index];
        return [
          point ? new Date(point.measuredAt).toLocaleString('zh-CN') : '',
          ...params.map((item: any) => `${item.marker}${item.seriesName}：${item.value} mmHg`),
          point?.sourceLabel || '',
        ].filter(Boolean).join('<br/>');
      },
    },
    legend: { top: 0, right: 4, itemWidth: 9, itemHeight: 9, textStyle: { color: '#64748b', fontSize: 10 } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((item) => dateLabel(item.measuredAt)),
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 9 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#eef2f6', type: 'dashed' } },
    },
    series: [
      { name: '收缩压', type: 'line', smooth: true, symbolSize: 6, data: points.map((item) => item.systolic) },
      { name: '舒张压', type: 'line', smooth: true, symbolSize: 6, data: points.map((item) => item.diastolic) },
    ],
  };
}

function buildGlucoseOption(): EChartsOption {
  const points = props.bloodGlucosePoints;
  return {
    animationDuration: 260,
    color: ['#2b7fe3'],
    grid: { left: 42, right: 14, top: 34, bottom: 30 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const index = params?.[0]?.dataIndex ?? 0;
        const point = points[index];
        return [
          point ? new Date(point.measuredAt).toLocaleString('zh-CN') : '',
          `${params?.[0]?.marker || ''}血糖：${point?.value ?? '-'} mmol/L`,
          point?.sourceLabel || '',
        ].filter(Boolean).join('<br/>');
      },
    },
    legend: { top: 0, right: 4, data: ['血糖'], itemWidth: 9, itemHeight: 9, textStyle: { color: '#64748b', fontSize: 10 } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((item) => dateLabel(item.measuredAt)),
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 9 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#eef2f6', type: 'dashed' } },
    },
    series: [
      { name: '血糖', type: 'line', smooth: true, symbolSize: 6, data: points.map((item) => item.value) },
    ],
  };
}

async function renderChart(): Promise<void> {
  await nextTick();
  if (!chartEl.value || !hasData.value) {
    chart.value?.clear();
    return;
  }
  if (!chart.value) chart.value = echarts.init(chartEl.value);
  chart.value.setOption(
    props.metric === 'blood-pressure' ? buildPressureOption() : buildGlucoseOption(),
    true,
  );
  chart.value.resize();
}

watch(
  () => [props.metric, props.bloodPressurePoints, props.bloodGlucosePoints],
  renderChart,
  { deep: true },
);

onMounted(() => {
  void renderChart();
  if (chartEl.value) {
    resizeObserver = new ResizeObserver(() => chart.value?.resize());
    resizeObserver.observe(chartEl.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart.value?.dispose();
});
</script>

<template>
  <div class="trend-shell">
    <div v-show="hasData" ref="chartEl" class="trend-chart" />
    <div v-if="!hasData" class="trend-empty">
      <span>{{ metric === 'blood-pressure' ? '暂无有效血压记录' : '暂无可解析的血糖记录' }}</span>
      <small>系统不会生成演示数值，请核实 HIS 或患者记忆数据来源。</small>
    </div>
  </div>
</template>

<style scoped>
.trend-shell {
  min-height: 196px;
}

.trend-chart {
  width: 100%;
  height: 210px;
}

.trend-empty {
  min-height: 172px;
  display: grid;
  place-content: center;
  gap: 6px;
  padding: 18px;
  color: #64748b;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 7px;
}

.trend-empty span {
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.trend-empty small {
  max-width: 250px;
  font-size: 10px;
  line-height: 1.5;
}
</style>
