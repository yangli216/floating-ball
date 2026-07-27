<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import { saveTcdForm } from '../api/chronicDiseaseApi';
import { getManagedFollowUpDiseases } from '../lib/chronicDiseaseEligibility';
import { buildFollowUpPresentation } from '../lib/followUpPresentation';
import {
  buildFusedFollowUpRequest,
  createFusedFollowUpFormState,
  validateFusedFollowUpForm,
} from '../model/followUpFormModel';
import type { ChronicDiseaseWindowPayload } from '../types';
import FollowUpBasicSection from './follow-up/FollowUpBasicSection.vue';
import FollowUpConclusionSection from './follow-up/FollowUpConclusionSection.vue';
import FollowUpLifestyleSection from './follow-up/FollowUpLifestyleSection.vue';
import FollowUpMeasurementsSection from './follow-up/FollowUpMeasurementsSection.vue';
import FollowUpMedicationSection from './follow-up/FollowUpMedicationSection.vue';
import FollowUpReferralSection from './follow-up/FollowUpReferralSection.vue';
import FollowUpSymptomsSection from './follow-up/FollowUpSymptomsSection.vue';
import FollowUpTypeIndicator from './follow-up/FollowUpTypeIndicator.vue';

const props = defineProps<{
  payload: ChronicDiseaseWindowPayload;
}>();

const sections = [
  '随访信息',
  '信息测量',
  '病情问询',
  '生活习惯',
  '用药情况',
  '转诊情况',
  '健康评估',
] as const;

const activeSection = shallowRef(0);
const saving = shallowRef(false);
const errorMessage = shallowRef('');
const saved = shallowRef(false);

const diseaseTypes = computed(() => getManagedFollowUpDiseases(props.payload.summary));
const presentation = computed(() => buildFollowUpPresentation(diseaseTypes.value));
const templateVersions = computed(() => ['TcdVisitForm-instance']);

const latestPressure = computed(() => {
  const points = props.payload.summary.bloodPressurePoints;
  return points[points.length - 1];
});

const latestFasting = computed(() => [...props.payload.summary.bloodGlucosePoints]
  .reverse()
  .find((item) => item.measurementType === 'fasting'));

const form = ref(createFusedFollowUpFormState(props.payload.summary));

const savedStatusText = computed(() => (
  saved.value ? `${presentation.value.label}已保存` : ''
));

async function save(): Promise<void> {
  const issue = validateFusedFollowUpForm({
    form: form.value,
  });
  if (issue) {
    errorMessage.value = issue.message;
    activeSection.value = issue.sectionIndex;
    return;
  }

  saving.value = true;
  errorMessage.value = '';

  try {
    const request = buildFusedFollowUpRequest(form.value);
    await saveTcdForm(request);
    saved.value = true;
  } catch (error) {
    errorMessage.value = formatUserFacingError(error, {
      fallback: '随访保存失败，表单内容已保留，请重试。',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="follow-up-view">
    <div class="patient-strip">
      <strong>{{ payload.summary.name }}</strong>
      <span>{{ payload.summary.gender }} · {{ payload.summary.ageText }}</span>
      <span>{{ payload.summary.organizationName || '机构待核实' }}</span>
      <span class="source-pill">
        <Icon icon="lucide:shield-check" size="13" />
        随访类型来自公卫标记
      </span>
    </div>

    <FollowUpTypeIndicator
      :disease-types="diseaseTypes"
      :mode-label="presentation.label"
      :template-versions="templateVersions"
    />

    <div class="follow-up-layout">
      <nav class="section-nav" aria-label="融合随访表单章节">
        <button
          v-for="(section, index) in sections"
          :key="section"
          type="button"
          :class="{ active: activeSection === index }"
          @click="activeSection = index"
        >
          <span>{{ index + 1 }}</span>{{ section }}
        </button>
      </nav>

      <form class="follow-up-form" @submit.prevent="save">
        <div class="form-heading">
          <div>
            <h2>{{ sections[activeSection] }}</h2>
            <p>公共字段只录入一次；病种字段由传入标记自动组合，不能在本页增删管理病种。</p>
          </div>
          <span class="published-pill"><Icon icon="lucide:badge-check" size="14" />已发布</span>
        </div>

        <FollowUpBasicSection
          v-if="activeSection === 0"
          v-model="form"
        />
        <FollowUpMeasurementsSection
          v-else-if="activeSection === 1"
          v-model="form"
          :has-diabetes="presentation.hasDiabetes"
          :latest-pressure="latestPressure"
          :latest-fasting="latestFasting"
        />
        <FollowUpSymptomsSection
          v-else-if="activeSection === 2"
          v-model="form"
          :has-hypertension="presentation.hasHypertension"
          :has-diabetes="presentation.hasDiabetes"
        />
        <FollowUpLifestyleSection
          v-else-if="activeSection === 3"
          v-model="form"
          :has-hypertension="presentation.hasHypertension"
          :has-diabetes="presentation.hasDiabetes"
        />
        <FollowUpMedicationSection
          v-else-if="activeSection === 4"
          v-model="form"
          :has-diabetes="presentation.hasDiabetes"
          :historical-medications="payload.summary.recentMedicationFacts"
        />
        <FollowUpReferralSection
          v-else-if="activeSection === 5"
          v-model="form"
        />
        <FollowUpConclusionSection
          v-else
          v-model="form"
          :has-hypertension="presentation.hasHypertension"
          :has-diabetes="presentation.hasDiabetes"
        />
      </form>

      <aside class="evidence-rail">
        <h3>本次参考</h3>
        <div>
          <span>随访类型</span>
          <b>{{ presentation.label }}</b>
          <small>来自患者公卫管理标记</small>
        </div>
        <div>
          <span>最近就诊</span>
          <b>{{ payload.summary.lastVisitLabel }}</b>
          <small>{{ payload.summary.diagnosisText }}</small>
        </div>
        <div>
          <span>最近血压</span>
          <b>{{ latestPressure ? `${latestPressure.systolic}/${latestPressure.diastolic} mmHg` : '暂无有效记录' }}</b>
          <small>{{ latestPressure?.sourceLabel || '待补充' }}</small>
        </div>
        <div v-if="presentation.hasDiabetes">
          <span>最近空腹血糖</span>
          <b>{{ latestFasting ? `${latestFasting.value} mmol/L` : '暂无有效记录' }}</b>
          <small>{{ latestFasting?.sourceLabel || '待补充' }}</small>
        </div>
        <p><Icon icon="lucide:info" size="15" />绿色参考值只用于录入辅助，必须由医生确认。</p>
      </aside>
    </div>

    <footer class="window-footer">
      <div class="save-status">
        <span v-if="errorMessage" class="error-text"><Icon icon="lucide:circle-alert" size="15" />{{ errorMessage }}</span>
        <span v-else-if="savedStatusText" class="success-text"><Icon icon="lucide:circle-check" size="15" />{{ savedStatusText }}</span>
      </div>
      <button type="button" class="secondary-button" :disabled="activeSection === 0" @click="activeSection -= 1">上一步</button>
      <button v-if="activeSection < sections.length - 1" type="button" class="primary-button" @click="activeSection += 1">下一步</button>
      <button v-else type="button" class="primary-button" :disabled="saving" @click="save">
        <Icon :icon="saving ? 'lucide:loader-circle' : 'lucide:save'" size="17" :class="{ spinning: saving }" />
        {{ saving ? '正在保存…' : presentation.mode === 'combined' ? '保存联合随访' : '保存随访' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.follow-up-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  background: #fff;
}

.patient-strip {
  min-height: 50px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  font-size: 12px;
}

.patient-strip strong {
  color: #1e293b;
  font-size: 14px;
}

.source-pill {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #047857;
}

.follow-up-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 154px minmax(0, 1fr) 210px;
  overflow: hidden;
}

.section-nav {
  padding: 10px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}

.section-nav button {
  width: 100%;
  padding: 9px 7px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #64748b;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 11px;
}

.section-nav button span {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  color: #fff;
  background: #94a3b8;
  border-radius: 50%;
  font-size: 9px;
}

.section-nav button.active {
  color: #1d4ed8;
  background: #eff6ff;
  font-weight: 700;
}

.section-nav button.active span {
  background: #2b7fe3;
}

.follow-up-form {
  min-width: 0;
  padding: 18px;
  overflow-y: auto;
}

.form-heading {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.form-heading h2 {
  margin: 0;
  color: #1e293b;
  font-size: 17px;
}

.form-heading p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 10px;
}

.published-pill {
  height: fit-content;
  padding: 4px 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 4px;
  font-size: 9px;
}

.follow-up-form :deep(.form-grid) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.follow-up-form :deep(.form-grid > label) {
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 11px;
  font-weight: 650;
}

.follow-up-form :deep(.form-grid input:not([type="checkbox"])),
.follow-up-form :deep(.form-grid select),
.follow-up-form :deep(.form-grid textarea) {
  width: 100%;
  min-height: 37px;
  padding: 8px 10px;
  color: #1e293b;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  font-size: 12px;
}

.follow-up-form :deep(.form-grid textarea) {
  resize: vertical;
}

.follow-up-form :deep(.form-grid small) {
  color: #10b981;
  font-size: 9px;
}

.follow-up-form :deep(.full-span) {
  grid-column: 1 / -1;
}

.follow-up-form :deep(.required) {
  margin-left: 3px;
  color: #dc2626;
}

.follow-up-form :deep(.switch-label) {
  min-height: 38px;
  display: flex !important;
  grid-auto-flow: column;
  align-items: center;
  justify-content: start;
}

.follow-up-form :deep(.switch-label input) {
  width: 16px;
  height: 16px;
  accent-color: #2b7fe3;
}

.follow-up-form :deep(.neutral-note) {
  padding: 12px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.6;
}

.follow-up-form :deep(.symptom-panel > p) {
  margin: 0 0 12px;
  color: #475569;
  font-size: 12px;
}

.follow-up-form :deep(.choice-grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.follow-up-form :deep(.choice-grid label) {
  min-height: 42px;
  padding: 9px 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
}

.follow-up-form :deep(.choice-grid input) {
  accent-color: #2b7fe3;
}

.evidence-rail {
  padding: 16px 13px;
  overflow-y: auto;
  background: #fbfdff;
  border-left: 1px solid #e2e8f0;
}

.evidence-rail h3 {
  margin: 0 0 10px;
  font-size: 13px;
}

.evidence-rail > div {
  padding: 10px 0;
  display: grid;
  gap: 3px;
  border-bottom: 1px solid #eef2f6;
}

.evidence-rail span {
  color: #64748b;
  font-size: 9px;
}

.evidence-rail b {
  color: #1e293b;
  font-size: 11px;
}

.evidence-rail small {
  color: #94a3b8;
  font-size: 9px;
  line-height: 1.5;
}

.evidence-rail p {
  margin: 13px 0 0;
  padding: 9px;
  display: flex;
  align-items: flex-start;
  gap: 5px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 5px;
  font-size: 9px;
  line-height: 1.5;
}

.window-footer {
  min-height: 60px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #e2e8f0;
}

.save-status {
  margin-right: auto;
  min-width: 0;
  font-size: 11px;
}

.save-status span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.error-text {
  color: #dc2626;
}

.success-text {
  color: #047857;
}

.primary-button,
.secondary-button {
  min-height: 36px;
  padding: 8px 15px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
}

.primary-button {
  color: #fff;
  background: #2b7fe3;
  border: 1px solid #2b7fe3;
}

.secondary-button {
  color: #475569;
  background: #fff;
  border: 1px solid #cbd5e1;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .follow-up-layout {
    grid-template-columns: 140px minmax(0, 1fr);
  }

  .evidence-rail {
    display: none;
  }
}
</style>
