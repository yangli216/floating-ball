<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';

const props = defineProps<{
  context: HisOutpatientFollowUpContext;
}>();

type EvidenceTab = 'record' | 'reports';

const activeTab = ref<EvidenceTab>('record');
const recordText = computed(() => props.context.medicalRecordText?.trim() || '');
const labReports = computed(() => props.context.labReports || []);
const examReports = computed(() => props.context.examReports || []);
const reportCount = computed(() => labReports.value.length + examReports.value.length);
const sourceMeta = computed(() => {
  return [
    props.context.source?.visitTime,
    props.context.source?.documentTitle,
  ].filter(Boolean).join(' · ');
});
</script>

<template>
  <section class="evidence-panel">
    <header class="evidence-header">
      <div>
        <h2>复诊依据</h2>
        <p>{{ sourceMeta || '历史门诊病历与已出报告' }}</p>
      </div>
      <span class="evidence-count">{{ reportCount }} 份报告</span>
    </header>

    <div class="evidence-tabs" role="tablist" aria-label="复诊依据">
      <button
        :class="{ active: activeTab === 'record' }"
        role="tab"
        :aria-selected="activeTab === 'record'"
        @click="activeTab = 'record'"
      >
        <Icon icon="lucide:file-text" :size="16" aria-hidden="true" />
        病历
      </button>
      <button
        :class="{ active: activeTab === 'reports' }"
        role="tab"
        :aria-selected="activeTab === 'reports'"
        @click="activeTab = 'reports'"
      >
        <Icon icon="lucide:list" :size="16" aria-hidden="true" />
        检验检查
        <span>{{ reportCount }}</span>
      </button>
    </div>

    <div class="evidence-body">
      <div v-if="activeTab === 'record'" class="record-view">
        <div class="document-meta">
          <Icon icon="lucide:file-text" :size="16" aria-hidden="true" />
          <span>{{ context.source?.documentTitle || '门诊病历' }}</span>
        </div>
        <pre v-if="recordText">{{ recordText }}</pre>
        <div v-else class="empty-state">暂无可预览的病历正文</div>
      </div>

      <div v-else class="reports-view">
        <section v-if="labReports.length" class="report-section">
          <h3>检验报告</h3>
          <article v-for="(report, index) in labReports" :key="`lab-${index}`" class="report-item">
            <div class="report-title">
              <strong>{{ report.reportName || '检验报告' }}</strong>
              <time>{{ report.reportTime || '' }}</time>
            </div>
            <ul v-if="report.items?.length">
              <li v-for="(item, itemIndex) in report.items" :key="`lab-item-${itemIndex}`">
                <span>{{ item.itemName || '项目' }}</span>
                <strong :class="{ abnormal: Boolean(item.abnormalFlag) }">
                  {{ [item.result, item.unit].filter(Boolean).join(' ') || '未提供结果值' }}
                </strong>
              </li>
            </ul>
          </article>
        </section>

        <section v-if="examReports.length" class="report-section">
          <h3>检查报告</h3>
          <article v-for="(report, index) in examReports" :key="`exam-${index}`" class="report-item">
            <div class="report-title">
              <strong>{{ report.examName || '检查报告' }}</strong>
              <time>{{ report.reportTime || '' }}</time>
            </div>
            <p>{{ report.conclusion || report.finding || '报告已出具' }}</p>
            <p v-if="report.finding && report.finding !== report.conclusion" class="finding">
              {{ report.finding }}
            </p>
          </article>
        </section>

        <div v-if="reportCount === 0" class="empty-state">暂无已出具的检验检查报告</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.evidence-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #fff;
}

.evidence-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid #e5e7eb;
}

.evidence-header h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 1.4;
}

.evidence-header p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.evidence-count {
  flex: none;
  color: #0f766e;
  font-size: 12px;
  font-weight: 600;
}

.evidence-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.evidence-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  color: #64748b;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.evidence-tabs button.active {
  color: #0f766e;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.evidence-tabs button span {
  font-size: 11px;
}

.evidence-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 22px;
}

.document-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.record-view pre {
  margin: 0;
  color: #263548;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.report-section + .report-section {
  margin-top: 22px;
}

.report-section h3 {
  margin: 0 0 10px;
  color: #334155;
  font-size: 14px;
}

.report-item {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
}

.report-item + .report-item {
  margin-top: 10px;
}

.report-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.report-title strong {
  color: #1e293b;
  font-size: 13px;
}

.report-title time {
  flex: none;
  color: #94a3b8;
  font-size: 11px;
}

.report-item p {
  margin: 8px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.65;
}

.report-item p.finding {
  color: #64748b;
}

.report-item ul {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.report-item li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-top: 1px solid #edf2f7;
  color: #64748b;
  font-size: 12px;
}

.report-item li strong {
  color: #334155;
  text-align: right;
}

.report-item li strong.abnormal {
  color: #c2410c;
}

.empty-state {
  padding: 44px 12px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}
</style>
