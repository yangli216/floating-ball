<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { AnnualChronicAssessment } from '../lib/annualAssessment';
import type { ChronicDiseasePatientSummary } from '../types';

const props = defineProps<{
  summary: ChronicDiseasePatientSummary;
  assessment: AnnualChronicAssessment;
  year: number;
}>();

const diseaseLabels = computed(() => (
  props.summary.diseaseTags.map((item) => item.label).join('、') || '未识别'
));
const medicationNames = computed(() => (
  Array.from(new Set(props.assessment.medicationFacts.map((item) => item.name)))
));
</script>

<template>
  <aside class="evidence-panel">
    <div class="panel-heading">
      <span class="heading-icon"><Icon icon="lucide:database" size="17" /></span>
      <div>
        <p>Traceable evidence</p>
        <h2>{{ year }} 年可追溯事实</h2>
      </div>
    </div>

    <dl class="evidence-grid">
      <div>
        <dt>慢病管理</dt>
        <dd>{{ diseaseLabels }}</dd>
      </div>
      <div>
        <dt>签约状态</dt>
        <dd>{{ summary.contractLabel }}</dd>
      </div>
      <div>
        <dt>最近血压</dt>
        <dd v-if="assessment.latestPressure">
          {{ assessment.latestPressure.systolic }}/{{ assessment.latestPressure.diastolic }} mmHg
        </dd>
        <dd v-else>本年度暂无有效记录</dd>
      </div>
      <div>
        <dt>最近血糖</dt>
        <dd v-if="assessment.latestGlucose">
          {{ assessment.latestGlucose.value }} mmol/L
        </dd>
        <dd v-else>本年度暂无有效记录</dd>
      </div>
    </dl>

    <section class="coverage-section">
      <h3>数据覆盖</h3>
      <div class="coverage-row">
        <span>血压记录</span>
        <strong>{{ assessment.bloodPressurePoints.length }} 条</strong>
      </div>
      <div class="coverage-row">
        <span>血糖记录</span>
        <strong>{{ assessment.bloodGlucosePoints.length }} 条</strong>
      </div>
      <div class="coverage-row">
        <span>有日期的用药事实</span>
        <strong>{{ assessment.medicationFacts.length }} 项</strong>
      </div>
      <div class="coverage-row">
        <span>患者记忆质量</span>
        <strong>
          {{ summary.sourceQuality === 'ready' ? '可用' : summary.sourceQuality === 'partial' ? '部分可用' : '不可用' }}
        </strong>
      </div>
    </section>

    <section class="medication-section">
      <h3>年度用药事实</h3>
      <ul v-if="medicationNames.length > 0">
        <li v-for="name in medicationNames" :key="name">{{ name }}</li>
      </ul>
      <p v-else>本年度未取得有日期的用药记录。</p>
    </section>

    <div class="source-note">
      <Icon icon="lucide:shield-check" size="15" />
      <span>
        数据来自当前接诊上下文、门诊历史与患者记忆；无记录不等于结果正常。
        截至 {{ assessment.latestDataAt ? new Date(assessment.latestDataAt).toLocaleString('zh-CN') : '待核实' }}。
      </span>
    </div>
  </aside>
</template>

<style scoped>
.evidence-panel {
  padding: 18px;
  overflow-y: auto;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}
.panel-heading { display: flex; align-items: center; gap: 10px; }
.heading-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #dbeafe;
  border-radius: 8px;
}
.panel-heading p {
  margin: 0 0 3px;
  color: #64748b;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.panel-heading h2 { margin: 0; color: #1e293b; font-size: 15px; }
.evidence-grid { margin: 15px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.evidence-grid > div { padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 7px; }
.evidence-grid dt { color: #64748b; font-size: 9px; }
.evidence-grid dd { margin: 4px 0 0; color: #1e293b; font-size: 11px; line-height: 1.45; }
.coverage-section, .medication-section { margin-top: 16px; }
.coverage-section h3, .medication-section h3 { margin: 0 0 8px; color: #334155; font-size: 12px; }
.coverage-row {
  padding: 7px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  font-size: 10px;
}
.coverage-row strong { color: #334155; font-size: 10px; }
.medication-section ul { margin: 0; padding-left: 18px; color: #475569; font-size: 10px; line-height: 1.8; }
.medication-section p { margin: 0; color: #94a3b8; font-size: 10px; line-height: 1.6; }
.source-note {
  margin-top: 18px;
  padding: 10px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  font-size: 9px;
  line-height: 1.6;
}
.source-note :deep(svg) { flex: 0 0 auto; color: #0f766e; }

@media print {
  .evidence-panel { overflow: visible; border-right: 0; border-bottom: 1px solid #e2e8f0; }
}
</style>
