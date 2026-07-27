<script setup lang="ts">
import {
  ARTERIOPALMUS_OPTIONS,
  DIABETES_SYMPTOM_OPTIONS,
  HYPERTENSION_SYMPTOM_OPTIONS,
  toggleArteriopalmusCode,
  toggleSymptomCode,
  type FusedFollowUpFormState,
} from '../../model/followUpFormModel';

defineProps<{
  hasHypertension: boolean;
  hasDiabetes: boolean;
}>();

const form = defineModel<FusedFollowUpFormState>({ required: true });

function toggle(field: 'sdHySymptom' | 'sdDbsSymptom', code: string): void {
  form.value[field] = toggleSymptomCode(form.value[field], code);
}

function togglePulse(code: string): void {
  form.value.sdArteriopalmus = toggleArteriopalmusCode(
    form.value.sdArteriopalmus,
    code,
  );
}
</script>

<template>
  <div class="symptom-panel">
    <p>请选择本次随访症状，互斥选项会自动处理。</p>

    <section v-if="hasHypertension" class="symptom-group">
      <h3>高血压症状<span class="required">*</span></h3>
      <div class="choice-grid">
        <label v-for="option in HYPERTENSION_SYMPTOM_OPTIONS" :key="option.value">
          <input
            type="checkbox"
            :checked="form.sdHySymptom.includes(option.value)"
            @change="toggle('sdHySymptom', option.value)"
          />
          {{ option.label }}
        </label>
      </div>
    </section>

    <section v-if="hasDiabetes" class="symptom-group">
      <h3>糖尿病症状<span class="required">*</span></h3>
      <div class="choice-grid">
        <label v-for="option in DIABETES_SYMPTOM_OPTIONS" :key="option.value">
          <input
            type="checkbox"
            :checked="form.sdDbsSymptom.includes(option.value)"
            @change="toggle('sdDbsSymptom', option.value)"
          />
          {{ option.label }}
        </label>
      </div>
    </section>

    <div class="form-grid symptom-details">
      <label class="full-span">其他体征
        <input v-model="form.desOther" maxlength="255" />
      </label>

      <fieldset v-if="hasDiabetes" class="full-span choice-fieldset">
        <legend>足背动脉搏动</legend>
        <div class="choice-grid">
          <label v-for="option in ARTERIOPALMUS_OPTIONS" :key="option.value">
            <input
              type="checkbox"
              :checked="form.sdArteriopalmus.includes(option.value)"
              @change="togglePulse(option.value)"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>

      <label>遵医行为
        <select v-model="form.sdProAct">
          <option value="">请选择</option>
          <option value="1">良好</option>
          <option value="2">一般</option>
          <option value="3">差</option>
        </select>
      </label>
      <label>心理调整<span class="required">*</span>
        <select v-model="form.sdPsychicAdj">
          <option value="">请选择</option>
          <option value="1">良好</option>
          <option value="2">一般</option>
          <option value="3">差</option>
        </select>
      </label>

      <label v-if="hasHypertension">早发心血管家族史
        <select v-model="form.fgCardiovascular">
          <option value="">请选择</option>
          <option value="1">有</option>
          <option value="0">无</option>
        </select>
      </label>
      <label v-if="hasDiabetes">低血糖反应
        <select v-model="form.lowEffects">
          <option value="">请选择</option>
          <option value="0">无</option>
          <option value="1">偶尔</option>
          <option value="2">频繁</option>
        </select>
      </label>
      <label>其他疾病
        <input v-model="form.otherDisease" maxlength="255" />
      </label>
      <label>备注
        <input v-model="form.note" maxlength="255" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.symptom-group + .symptom-group,
.symptom-details {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.symptom-group h3 {
  margin: 0 0 9px;
  color: #334155;
  font-size: 12px;
}

.choice-fieldset {
  margin: 0;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.choice-fieldset legend {
  padding: 0 5px;
  color: #475569;
  font-size: 11px;
  font-weight: 650;
}
</style>
