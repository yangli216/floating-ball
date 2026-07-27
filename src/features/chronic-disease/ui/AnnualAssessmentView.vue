<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { generateAnnualAssessmentDraft } from '../api/annualAssessmentService';
import { buildAnnualChronicAssessment } from '../lib/annualAssessment';
import type { AnnualAssessmentDraft, ChronicDiseaseWindowPayload } from '../types';
import AnnualAssessmentEvidencePanel from './AnnualAssessmentEvidencePanel.vue';
import AnnualAssessmentResult from './AnnualAssessmentResult.vue';

const props = defineProps<{
  payload: ChronicDiseaseWindowPayload;
}>();

const currentYear = new Date().getFullYear();
const selectedYear = shallowRef(currentYear);
const generating = shallowRef(false);
const draft = shallowRef<AnnualAssessmentDraft | null>(null);
const doctorName = shallowRef(props.payload.summary.doctorName || '');
const doctorConclusion = shallowRef('');
const doctorConfirmed = shallowRef(false);
const errorMessage = shallowRef('');

const assessment = computed(() => buildAnnualChronicAssessment(
  props.payload.summary,
  selectedYear.value,
));
const isReadyToPrint = computed(() => (
  Boolean(draft.value)
  && doctorConfirmed.value
  && Boolean(doctorName.value.trim())
));

watch(selectedYear, () => {
  draft.value = null;
  doctorConclusion.value = '';
  doctorConfirmed.value = false;
  errorMessage.value = '';
});

async function generate(): Promise<void> {
  generating.value = true;
  doctorConfirmed.value = false;
  errorMessage.value = '';
  try {
    draft.value = await generateAnnualAssessmentDraft(
      props.payload.summary,
      assessment.value,
    );
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '年度健康评估生成失败。';
  } finally {
    generating.value = false;
  }
}

async function printAssessment(): Promise<void> {
  if (!draft.value) {
    errorMessage.value = '请先生成年度健康评估。';
    return;
  }
  if (!doctorName.value.trim()) {
    errorMessage.value = '请填写打印医生姓名。';
    return;
  }
  if (!doctorConfirmed.value) {
    errorMessage.value = '请确认已复核 AI 评估内容。';
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
      <div class="patient-summary">
        <span class="patient-avatar"><Icon icon="lucide:user-round" size="24" /></span>
        <span>
          <strong>{{ payload.summary.name }}</strong>
          <small>
            {{ payload.summary.gender }} · {{ payload.summary.ageText }} ·
            {{ payload.summary.diseaseTags.map((item) => item.label).join('、') || '慢病信息待核实' }}
          </small>
        </span>
      </div>
      <label class="year-field">
        评估年度
        <select v-model.number="selectedYear" :disabled="generating">
          <option :value="currentYear">{{ currentYear }}</option>
          <option :value="currentYear - 1">{{ currentYear - 1 }}</option>
          <option :value="currentYear - 2">{{ currentYear - 2 }}</option>
        </select>
      </label>
    </div>

    <div class="assessment-layout">
      <AnnualAssessmentEvidencePanel
        :summary="payload.summary"
        :assessment="assessment"
        :year="selectedYear"
      />

      <main class="assessment-main">
        <div class="main-heading">
          <div>
            <p>Doctor-reviewed assessment</p>
            <h2>AI 辅助慢病年度健康评估</h2>
            <span>覆盖控制趋势、风险共病、并发症筛查、用药安全、生活方式和随访计划。</span>
          </div>
          <button type="button" class="generate-button" :disabled="generating" @click="generate">
            <Icon
              :icon="generating ? 'lucide:loader-circle' : 'lucide:sparkles'"
              size="17"
              :class="{ spinning: generating }"
            />
            {{ generating ? '正在分析年度证据…' : draft ? '重新生成评估' : '生成 AI 评估' }}
          </button>
        </div>

        <div v-if="errorMessage" class="error-state" role="alert">{{ errorMessage }}</div>

        <div v-if="!draft && !generating" class="empty-state">
          <span class="empty-icon"><Icon icon="lucide:clipboard-pulse" size="36" /></span>
          <strong>尚未生成 {{ selectedYear }} 年度健康评估</strong>
          <span>
            AI 将严格基于左侧可追溯证据形成六类评估；没有记录的项目会明确列为“待核实”。
          </span>
        </div>

        <div v-else-if="generating" class="empty-state generating-state" aria-live="polite">
          <span class="empty-icon"><Icon icon="lucide:brain-circuit" size="36" /></span>
          <strong>正在组织慢病医生评估框架</strong>
          <span>正在核对年度趋势、数据缺口与医生复核重点，请稍候。</span>
        </div>

        <template v-if="draft">
          <AnnualAssessmentResult :draft="draft" />

          <section class="doctor-confirmation">
            <div class="confirmation-heading">
              <Icon icon="lucide:stethoscope" size="18" />
              <div>
                <h3>医生复核结论</h3>
                <p>AI 草稿不自动进入患者档案；打印前由医生确认事实、缺口和随访重点。</p>
              </div>
            </div>
            <label class="conclusion-field">
              个体化补充
              <textarea
                v-model="doctorConclusion"
                rows="4"
                maxlength="1200"
                placeholder="可补充个体控制目标、实际检查结果、用药复核结论和后续安排"
              />
            </label>
            <label class="confirmation-check">
              <input v-model="doctorConfirmed" type="checkbox" />
              <span>我已复核患者事实和 AI 评估内容，并确认本次打印版本。</span>
            </label>
          </section>
        </template>
      </main>
    </div>

    <footer class="window-footer">
      <span v-if="errorMessage" class="error-message">{{ errorMessage }}</span>
      <span v-else-if="draft">
        {{ doctorConfirmed ? '医生已确认；仅在本机打印' : '等待医生复核确认' }}
      </span>
      <span v-else>等待生成年度评估</span>
      <label class="doctor-field">
        打印医生
        <input v-model="doctorName" maxlength="64" placeholder="请输入姓名" />
      </label>
      <button type="button" class="primary-button" :disabled="!isReadyToPrint" @click="printAssessment">
        <Icon icon="lucide:printer" size="17" />
        打印年度评估
      </button>
    </footer>
  </div>
</template>

<style scoped>
.assessment-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: #1e293b;
  background: #fff;
}
.assessment-hero {
  min-height: 66px;
  padding: 11px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  color: #fff;
  background: linear-gradient(115deg, #2563eb, #0f70d8);
}
.patient-summary { display: flex; align-items: center; gap: 10px; }
.patient-avatar {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #fff;
  border: 2px solid rgba(255,255,255,.7);
  border-radius: 50%;
}
.patient-summary > span { display: grid; }
.patient-summary strong { font-size: 15px; }
.patient-summary small { margin-top: 3px; color: #dbeafe; font-size: 9px; }
.year-field { display: flex; align-items: center; gap: 8px; font-size: 10px; }
.year-field select {
  padding: 7px 10px;
  color: #1e293b;
  background: #fff;
  border: 0;
  border-radius: 6px;
}
.assessment-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 285px minmax(0, 1fr);
  overflow: hidden;
}
.assessment-main { min-width: 0; padding: 18px; overflow-y: auto; background: #fff; }
.main-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.main-heading p {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.main-heading h2 { margin: 0; color: #1e293b; font-size: 18px; }
.main-heading span { display: block; margin-top: 4px; color: #64748b; font-size: 10px; }
.generate-button {
  min-height: 36px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  white-space: nowrap;
  background: #2563eb;
  border: 1px solid #2563eb;
  border-radius: 7px;
}
.empty-state {
  min-height: 360px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
  color: #94a3b8;
  text-align: center;
}
.empty-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 18px;
}
.empty-state strong { color: #475569; font-size: 14px; }
.empty-state > span:last-child { max-width: 440px; font-size: 10px; line-height: 1.7; }
.generating-state .empty-icon { animation: breathe 1.5s ease-in-out infinite; }
.error-state {
  margin: 14px 0;
  padding: 10px;
  color: #b91c1c;
  background: #fef2f2;
  border-radius: 7px;
  font-size: 10px;
}
.doctor-confirmation {
  margin-top: 14px;
  padding: 15px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
}
.confirmation-heading { display: flex; align-items: flex-start; gap: 8px; color: #2563eb; }
.confirmation-heading h3 { margin: 0; color: #334155; font-size: 13px; }
.confirmation-heading p { margin: 3px 0 0; color: #64748b; font-size: 9px; line-height: 1.5; }
.conclusion-field {
  margin-top: 12px;
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 10px;
  font-weight: 650;
}
.conclusion-field textarea {
  padding: 9px;
  color: #1e293b;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  resize: vertical;
  line-height: 1.6;
}
.confirmation-check {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: #475569;
  font-size: 10px;
  line-height: 1.5;
}
.confirmation-check input { margin-top: 2px; }
.window-footer {
  min-height: 60px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 11px;
  color: #64748b;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  font-size: 10px;
}
.window-footer > span { margin-right: auto; }
.doctor-field { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.doctor-field input {
  width: 120px;
  padding: 7px 9px;
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
}
.error-message { color: #b91c1c; }
.primary-button {
  min-height: 36px;
  padding: 8px 15px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  background: #2563eb;
  border: 1px solid #2563eb;
  border-radius: 6px;
}
button:disabled { opacity: .55; cursor: not-allowed; }
.spinning { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { 50% { transform: scale(1.06); } }

@media (max-width: 900px) {
  .assessment-layout { grid-template-columns: 245px minmax(0, 1fr); }
}

@media print {
  .generate-button, .window-footer, .confirmation-check { display: none !important; }
  .assessment-view { height: auto; display: block; }
  .assessment-layout { display: block; overflow: visible; }
  .assessment-main { overflow: visible; }
  .doctor-confirmation { break-inside: avoid; }
  .conclusion-field textarea { border: 0; resize: none; }
}
</style>
