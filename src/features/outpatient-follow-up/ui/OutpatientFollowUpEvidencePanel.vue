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
const diagnosisText = computed(() => props.context.currentDiagnosis?.trim() || '');
const assessment = computed(() => props.context.assessment);
const assessmentLabel = computed(() => {
  const labels = {
    no_treatment_needed: '无需新增治疗',
    observe: '观察随访',
    needs_follow_up: '需进一步处置',
    needs_treatment: '需药物治疗',
  };
  return assessment.value ? labels[assessment.value.actionability] : '';
});
function isLabItemAbnormal(item: { abnormal?: boolean; abnormalFlag?: string }): boolean {
  if (typeof item.abnormal === 'boolean') {
    return item.abnormal;
  }
  const flag = item.abnormalFlag?.trim().toUpperCase() || '';
  if (!flag) return false;
  if (/正常|NORMAL|阴性|NEGATIVE/i.test(flag) || flag === 'N' || flag === '0') {
    return false;
  }
  return true;
}

const abnormalCount = computed(() => {
  const abnormalLabs = labReports.value.reduce((count, report) => (
    count + (report.items || []).filter(isLabItemAbnormal).length
  ), 0);
  const abnormalExamPattern = /异常|阳性|感染|结节|占位|积液|狭窄|增厚|高密度|低密度/u;
  const abnormalExams = examReports.value.filter((report) => (
    abnormalExamPattern.test(`${report.finding || ''}${report.conclusion || ''}`)
  )).length;
  return abnormalLabs + abnormalExams;
});
const sourceMeta = computed(() => {
  return [
    props.context.source?.visitTime,
    props.context.source?.documentTitle,
  ].filter(Boolean).join(' · ');
});

function formatLabResult(item: { result?: string; unit?: string }): string {
  return [item.result, item.unit].filter(Boolean).join(' ') || '未提供结果值';
}
</script>

<template>
  <section class="evidence-panel">
    <header class="evidence-header">
      <div>
        <h2>复诊依据</h2>
        <p>{{ sourceMeta || '本次门诊病历与已出报告' }}</p>
      </div>
      <div class="evidence-stats" aria-label="复诊依据状态">
        <span :class="{ ok: Boolean(recordText) }">病历{{ recordText ? '可用' : '缺失' }}</span>
        <span>{{ reportCount }} 份报告</span>
        <span :class="{ warning: abnormalCount > 0 }">{{ abnormalCount }} 项异常</span>
      </div>
    </header>

    <div class="evidence-tabs" role="tablist" aria-label="复诊依据">
      <button
        :class="{ active: activeTab === 'record' }"
        role="tab"
        :aria-selected="activeTab === 'record'"
        @click="activeTab = 'record'"
      >
        <Icon icon="lucide:file-text" :size="16" aria-hidden="true" />
        本次病历
      </button>
      <button
        :class="{ active: activeTab === 'reports' }"
        role="tab"
        :aria-selected="activeTab === 'reports'"
        @click="activeTab = 'reports'"
      >
        <Icon icon="lucide:list" :size="16" aria-hidden="true" />
        报告结果
        <span>{{ reportCount }}</span>
      </button>
    </div>

    <div class="evidence-body">
      <div v-if="activeTab === 'record'" class="record-view">
        <div class="evidence-note">
          <Icon icon="lucide:sparkles" :size="16" aria-hidden="true" />
          <span>AI 将基于本次病历和已出报告推荐后续治疗方案。</span>
        </div>
        <div v-if="diagnosisText" class="diagnosis-reference">
          <span>诊断参考</span>
          <strong>{{ diagnosisText }}</strong>
        </div>
        <div v-if="assessment" class="assessment-reference">
          <strong>报告处置结论：{{ assessmentLabel }}</strong>
          <span>{{ assessment.summary }}</span>
        </div>
        <div class="document-meta">
          <span>{{ context.source?.documentTitle || '本次门诊病历' }}</span>
          <time>{{ context.source?.visitTime || '' }}</time>
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
            <ul v-if="report.items?.length" class="lab-result-list">
              <li v-for="(item, itemIndex) in report.items" :key="`lab-item-${itemIndex}`">
                <span class="item-name">{{ item.itemName || '项目' }}</span>
                <strong :class="{ abnormal: isLabItemAbnormal(item) }">{{ formatLabResult(item) }}</strong>
                <span class="item-range">{{ item.referenceRange ? `参考 ${item.referenceRange}` : '' }}</span>
                <span v-if="isLabItemAbnormal(item) && item.abnormalFlag" class="abnormal-flag">{{ item.abnormalFlag }}</span>
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
            <p class="conclusion">{{ report.conclusion || report.finding || '报告已出具' }}</p>
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
  padding: 18px 18px 12px;
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

.evidence-stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  max-width: 190px;
}

.evidence-stats span {
  flex: none;
  padding: 3px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  color: #64748b;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
}

.evidence-stats span.ok {
  color: #047857;
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.evidence-stats span.warning {
  color: #b45309;
  border-color: #fed7aa;
  background: #fffbeb;
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

.evidence-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  color: #1e40af;
  background: #eff6ff;
  font-size: 12px;
  line-height: 1.5;
}

.diagnosis-reference {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}

.diagnosis-reference span {
  color: #64748b;
  font-weight: 600;
}

.diagnosis-reference strong {
  color: #0f172a;
}

.assessment-reference {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 12px;
  line-height: 1.55;
}

.assessment-reference strong {
  color: #1e3a8a;
}

.document-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.document-meta time {
  flex: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 500;
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

.report-item p.conclusion {
  color: #1f2937;
  font-size: 13px;
}

.report-item p.finding {
  color: #64748b;
}

.lab-result-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.lab-result-list li {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(72px, auto) minmax(78px, auto) auto;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid #edf2f7;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.lab-result-list li:first-child {
  border-top: 0;
}

.lab-result-list .item-name {
  color: #334155;
}

.lab-result-list strong {
  color: #0f172a;
  font-weight: 600;
}

.lab-result-list strong.abnormal {
  color: #b91c1c;
}

.item-range {
  color: #94a3b8;
}

.abnormal-flag {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  color: #b91c1c;
  background: #fee2e2;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.empty-state {
  padding: 44px 12px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}
</style>
