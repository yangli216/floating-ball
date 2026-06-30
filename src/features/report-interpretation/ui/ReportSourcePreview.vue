<script setup lang="ts">
import { computed } from 'vue';
import {
  buildLabReferenceRange,
  resolveLabItemDirection,
} from '../api/reportedReportHistory';
import type { ReportHistoryEntry } from '../types';

const props = defineProps<{
  report: ReportHistoryEntry;
}>();

const labRows = computed(() => (props.report.labItems || []).map((item) => ({
  ...item,
  direction: resolveLabItemDirection(item),
  referenceRange: buildLabReferenceRange(item),
})));

function directionText(direction: string | undefined): string {
  if (direction === 'up') return '↑ 偏高';
  if (direction === 'down') return '↓ 偏低';
  if (direction === 'positive') return '阳性';
  if (direction === 'abnormal') return '异常';
  return '正常';
}

function displayText(value: string | undefined): string {
  return value || '--';
}
</script>

<template>
  <article class="source-report" aria-label="原始报告">
    <header>
      <div>
        <span>HIS 原始报告</span>
        <h2>{{ report.title }}</h2>
      </div>
      <time>{{ report.reportTime || '报告时间待确认' }}</time>
    </header>

    <template v-if="report.taskId === 'inspectReport'">
      <div v-if="labRows.length" class="lab-table" role="table" aria-label="检验结果">
        <div class="lab-row lab-row--head" role="row">
          <span>检验项目</span><span>结果</span><span>方向</span><span>参考范围</span>
        </div>
        <div v-for="(item, index) in labRows" :key="item.itemId || `${item.itemName}-${index}`" class="lab-row" role="row">
          <strong>{{ displayText(item.itemName) }}</strong>
          <span class="result-value">{{ [item.result, item.unit].filter(Boolean).join(' ') || '--' }}</span>
          <span class="direction" :class="`direction--${item.direction}`">{{ directionText(item.direction) }}</span>
          <span>{{ displayText(item.referenceRange) }}</span>
        </div>
      </div>
      <pre v-else>{{ report.sourceQuery || '报告项目暂不可用。' }}</pre>
    </template>

    <div v-else class="exam-content">
      <section>
        <h3>检查所见</h3>
        <p>{{ displayText(report.examFinding) }}</p>
      </section>
      <section>
        <h3>检查结论</h3>
        <p>{{ displayText(report.examConclusion) }}</p>
      </section>
    </div>

    <p class="source-note">以上为 HIS 原始结果，AI 解读仅作为辅助参考。</p>
  </article>
</template>

<style scoped>
.source-report { color: #172033; }
.source-report > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding: 0 0 9px; border-bottom: 1px solid #8291a5; }
.source-report header span { color: #60758f; font-size: 12px; font-weight: 700; }
.source-report h2 { margin: 3px 0 0; font-size: 18px; line-height: 1.35; }
.source-report time { flex: none; color: #64748b; font-size: 13px; }
.lab-table { margin-top: 9px; }
.lab-row { display: grid; grid-template-columns: minmax(150px, 1.35fr) minmax(110px, .85fr) 82px minmax(130px, 1fr); gap: 12px; align-items: center; min-height: 36px; padding: 4px 0; border-bottom: 1px solid #e3e9f1; font-size: 13px; line-height: 1.4; }
.lab-row--head { min-height: auto; color: #64748b; font-size: 12px; font-weight: 700; }
.result-value { font-weight: 700; }
.direction { font-weight: 700; }
.direction--normal { color: #2e7d56; }
.direction--up, .direction--down, .direction--positive, .direction--abnormal { color: #c24135; }
.exam-content { display: grid; gap: 10px; padding: 12px 0 4px; }
.exam-content section { padding-bottom: 10px; border-bottom: 1px solid #e3e9f1; }
.exam-content h3 { margin: 0 0 5px; font-size: 14px; }
.exam-content p { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.source-report pre { margin: 10px 0 0; padding: 10px; border: 1px solid #dde5ee; background: #f8fafc; white-space: pre-wrap; font-size: 12px; line-height: 1.55; }
.source-note { margin: 9px 0 0; color: #7b8797; font-size: 11px; }
@media (max-width: 760px) {
  .source-report > header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .lab-row { grid-template-columns: 1fr; gap: 4px; padding: 12px 0; }
  .lab-row--head { display: none; }
}
</style>
