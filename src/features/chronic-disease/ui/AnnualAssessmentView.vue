<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { buildAnnualChronicAssessment } from '../lib/annualAssessment';
import type { ChronicDiseaseWindowPayload } from '../types';

const props = defineProps<{
  payload: ChronicDiseaseWindowPayload;
}>();
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const doctorName = ref(props.payload.summary.doctorName || '');
const errorMessage = ref('');

const assessment = computed(() => buildAnnualChronicAssessment(
  props.payload.summary,
  selectedYear.value,
));

async function printAssessment(): Promise<void> {
  if (!doctorName.value.trim()) {
    errorMessage.value = '请填写打印医生姓名。';
    return;
  }

  errorMessage.value = '';
  await nextTick();
  window.print();
}
</script>

<template>
  <div class="assessment-view">
    <div class="assessment-hero">
      <div>
        <span class="patient-avatar"><Icon icon="lucide:user-round" size="24" /></span>
        <span>
          <strong>{{ payload.summary.name }}</strong>
          <small>{{ payload.summary.gender }} · {{ payload.summary.ageText }}</small>
        </span>
      </div>
      <label>
        评估年度
        <select v-model="selectedYear">
          <option :value="currentYear">{{ currentYear }}</option>
          <option :value="currentYear - 1">{{ currentYear - 1 }}</option>
          <option :value="currentYear - 2">{{ currentYear - 2 }}</option>
        </select>
      </label>
    </div>

    <div class="assessment-content">
      <section>
        <h2>基本情况</h2>
        <dl>
          <div><dt>签约状态</dt><dd>{{ payload.summary.contractLabel }}</dd></div>
          <div><dt>慢病管理</dt><dd>{{ payload.summary.diseaseTags.map((item) => item.label).join('、') || '未识别' }}</dd></div>
          <div><dt>{{ selectedYear }} 年最近血压</dt><dd>{{ assessment.latestPressure ? `${assessment.latestPressure.systolic}/${assessment.latestPressure.diastolic} mmHg` : '本年度暂无有效记录' }}</dd></div>
          <div><dt>{{ selectedYear }} 年最近血糖</dt><dd>{{ assessment.latestGlucose ? `${assessment.latestGlucose.value} mmol/L` : '本年度暂无有效记录' }}</dd></div>
        </dl>
      </section>

      <section>
        <h2>{{ selectedYear }} 年数据完整性</h2>
        <dl>
          <div><dt>血压记录</dt><dd>{{ assessment.bloodPressurePoints.length }} 条</dd></div>
          <div><dt>血糖记录</dt><dd>{{ assessment.bloodGlucosePoints.length }} 条</dd></div>
          <div><dt>有日期的用药事实</dt><dd>{{ assessment.medicationFacts.length }} 项</dd></div>
          <div><dt>患者记忆质量</dt><dd>{{ payload.summary.sourceQuality === 'ready' ? '可用' : payload.summary.sourceQuality === 'partial' ? '部分可用' : '不可用' }}</dd></div>
        </dl>
      </section>

      <section class="wide-section">
        <h2>{{ selectedYear }} 年度关注点</h2>
        <ul>
          <li v-if="assessment.bloodPressurePoints.length === 0">本年度未取得可追溯血压记录，需要核实院内或家庭监测数据。</li>
          <li v-else>本年度已取得 {{ assessment.bloodPressurePoints.length }} 条血压记录；控制情况需结合个体目标由医生判断。</li>
          <li v-if="payload.summary.diseaseTags.some((item) => item.diseaseType === 'type2_diabetes') && assessment.bloodGlucosePoints.length === 0">
            本年度糖尿病对象未取得可解析的结构化血糖记录。
          </li>
          <li>检查检验、用药和生活方式建议应在本年度真实记录基础上由医生确认。</li>
        </ul>
      </section>

      <p class="assessment-source">
        数据来源：当前接诊上下文、门诊历史与患者记忆 · {{ selectedYear }} 年记录截至
        {{ assessment.latestDataAt ? new Date(assessment.latestDataAt).toLocaleString('zh-CN') : '无可追溯记录' }}
      </p>
    </div>

    <footer class="window-footer">
      <span v-if="errorMessage" class="error-message">{{ errorMessage }}</span>
      <span v-else>只读聚合；医生确认后仅在本机打印</span>
      <label class="doctor-field">
        打印医生
        <input v-model="doctorName" maxlength="64" placeholder="请输入姓名" />
      </label>
      <button type="button" class="primary-button" :disabled="!doctorName.trim()" @click="printAssessment">
        <Icon icon="lucide:printer" size="17" />
        打印年度评估
      </button>
    </footer>
  </div>
</template>

<style scoped>
.assessment-view { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: #f6f8fb; }
.assessment-hero { padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; color: #fff; background: #2b7fe3; }
.assessment-hero > div { display: flex; align-items: center; gap: 10px; }
.patient-avatar { width: 44px; height: 44px; display: grid; place-items: center; color: #2b7fe3; background: #fff; border: 2px solid rgba(255,255,255,.7); border-radius: 50%; }
.assessment-hero span { display: grid; }
.assessment-hero small { margin-top: 3px; color: #dbeafe; font-size: 10px; }
.assessment-hero label { display: flex; align-items: center; gap: 8px; font-size: 10px; }
.assessment-hero select { padding: 7px 10px; color: #1e293b; background: #fff; border: 0; border-radius: 5px; }
.assessment-content { padding: 18px; display: grid; grid-template-columns: 1fr 1fr; align-content: start; gap: 14px; overflow-y: auto; }
.assessment-content section { padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
.assessment-content h2 { margin: 0 0 12px; color: #1e293b; font-size: 15px; }
.assessment-content dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.assessment-content dl > div { padding: 10px; background: #f8fafc; border-radius: 5px; }
.assessment-content dt { color: #64748b; font-size: 9px; }
.assessment-content dd { margin: 4px 0 0; color: #1e293b; font-size: 11px; line-height: 1.5; }
.wide-section { grid-column: 1 / -1; }
.wide-section ul { margin: 0; padding-left: 20px; color: #475569; font-size: 11px; line-height: 1.9; }
.assessment-source { grid-column: 1 / -1; margin: 0; color: #94a3b8; font-size: 9px; }
.window-footer { min-height: 60px; padding: 10px 18px; display: flex; align-items: center; justify-content: flex-end; gap: 12px; color: #64748b; background: #fff; border-top: 1px solid #e2e8f0; font-size: 10px; }
.window-footer > span { margin-right: auto; }
.doctor-field { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.doctor-field input { width: 110px; padding: 7px 9px; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 5px; }
.error-message { color: #b91c1c; }
.primary-button { min-height: 36px; padding: 8px 15px; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #2b7fe3; border: 1px solid #2b7fe3; border-radius: 6px; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
@media print {
  .window-footer { display: none; }
  .assessment-view { height: auto; }
  .assessment-content { overflow: visible; }
}
</style>
