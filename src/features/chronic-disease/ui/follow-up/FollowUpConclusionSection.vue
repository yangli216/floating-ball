<script setup lang="ts">
import {
  COMORBIDITY_OPTIONS,
  COMPLICATION_OPTIONS,
  MAJOR_CC_OPTIONS,
  TARGET_ORGAN_DAMAGE_OPTIONS,
  toggleExclusiveCode,
  type FusedFollowUpFormState,
} from '../../model/followUpFormModel';

defineProps<{
  hasHypertension: boolean;
  hasDiabetes: boolean;
}>();

const form = defineModel<FusedFollowUpFormState>({ required: true });

function toggle(
  field: 'sdComplications' | 'sdComorbidity' | 'sdMajorCc' | 'targetOrganDamage',
  code: string,
  exclusiveCode?: string,
): void {
  const values = form.value[field];
  if (exclusiveCode) {
    form.value[field] = toggleExclusiveCode(values, code, exclusiveCode);
  } else {
    form.value[field] = values.includes(code)
      ? values.filter((item) => item !== code)
      : [...values, code];
  }
}
</script>

<template>
  <div class="form-grid">
    <template v-if="hasDiabetes">
      <label>并发症 desAdr
        <select v-model="form.desAdr">
          <option value="">请选择</option>
          <option value="1">无并发症</option>
          <option value="2">并发症稳定</option>
          <option value="3">并发症不稳定</option>
        </select>
      </label>
      <fieldset class="full-span choice-fieldset">
        <legend>并发症类型 sdComplications</legend>
        <div class="choice-grid">
          <label v-for="option in COMPLICATION_OPTIONS" :key="option.value">
            <input
              type="checkbox"
              :checked="form.sdComplications.includes(option.value)"
              @change="toggle('sdComplications', option.value)"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
      <label v-if="form.sdComplications.includes('0')" class="full-span">并发症其他描述 desComplications
        <input v-model="form.desComplications" maxlength="255" />
      </label>
    </template>

    <label>合并症 desComor
      <select v-model="form.desComor">
        <option value="">请选择</option>
        <option value="1">无合并症</option>
        <option value="2">合并症稳定</option>
        <option value="3">合并症不稳定</option>
      </select>
    </label>
    <fieldset class="full-span choice-fieldset">
      <legend>合并症类型 sdComorbidity</legend>
      <div class="choice-grid">
        <label v-for="option in COMORBIDITY_OPTIONS" :key="option.value">
          <input
            type="checkbox"
            :checked="form.sdComorbidity.includes(option.value)"
            @change="toggle('sdComorbidity', option.value)"
          />
          {{ option.label }}
        </label>
      </div>
    </fieldset>
    <label v-if="form.sdComorbidity.includes('0')" class="full-span">合并症其他描述 desComorbidity
      <input v-model="form.desComorbidity" maxlength="255" />
    </label>

    <template v-if="hasHypertension">
      <fieldset class="full-span choice-fieldset">
        <legend>并发症/合并症 sdMajorCc</legend>
        <div class="choice-grid">
          <label v-for="option in MAJOR_CC_OPTIONS" :key="option.value">
            <input
              type="checkbox"
              :checked="form.sdMajorCc.includes(option.value)"
              @change="toggle('sdMajorCc', option.value, '0')"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
      <fieldset class="full-span choice-fieldset">
        <legend>靶器官损伤 targetOrganDamage</legend>
        <div class="choice-grid">
          <label v-for="option in TARGET_ORGAN_DAMAGE_OPTIONS" :key="option.value">
            <input
              type="checkbox"
              :checked="form.targetOrganDamage.includes(option.value)"
              @change="toggle('targetOrganDamage', option.value, '0')"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
    </template>

    <label class="full-span">健康指导 desPresAdvice
      <textarea v-model="form.desPresAdvice" rows="8" maxlength="5007" />
    </label>
  </div>
</template>

<style scoped>
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
