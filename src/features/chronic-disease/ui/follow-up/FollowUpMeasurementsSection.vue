<script setup lang="ts">
import type {
  BloodGlucosePoint,
  BloodPressurePoint,
} from '../../types';
import {
  calculateBmi,
  type FusedFollowUpFormState,
} from '../../model/followUpFormModel';

defineProps<{
  hasDiabetes: boolean;
  latestPressure?: BloodPressurePoint;
  latestFasting?: BloodGlucosePoint;
}>();

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>数据来源
      <select v-model="form.sdDataWay">
        <option value="">请选择</option>
        <option value="1">健康小屋</option>
        <option value="2">移动端</option>
        <option value="3">健康设备</option>
      </select>
    </label>
    <label>BMI
      <input :value="calculateBmi(form.stature, form.avoirdupois)" readonly />
    </label>
    <label>目标 BMI
      <input :value="calculateBmi(form.stature, form.advAdp)" readonly />
    </label>
    <label>身高<span class="required">*</span>
      <input v-model="form.stature" inputmode="decimal" maxlength="5" />
    </label>
    <label>体重<span class="required">*</span>
      <input v-model="form.avoirdupois" inputmode="decimal" maxlength="5" />
    </label>
    <label>目标体重<span class="required">*</span>
      <input v-model="form.advAdp" inputmode="decimal" maxlength="5" />
    </label>
    <label>腰围<span class="required">*</span>
      <input v-model="form.waistline" inputmode="decimal" maxlength="5" />
    </label>
    <label>目标腰围<span class="required">*</span>
      <input v-model="form.advWaistline" inputmode="decimal" maxlength="5" />
    </label>
    <label>心率<span class="required">*</span>
      <input v-model="form.heartRate" inputmode="numeric" maxlength="3" />
    </label>
    <label>收缩压<span class="required">*</span>
      <input v-model="form.pressureH" inputmode="numeric" maxlength="3" />
      <small v-if="latestPressure">上次随访：{{ latestPressure.systolic }} mmHg</small>
    </label>
    <label>舒张压<span class="required">*</span>
      <input v-model="form.pressureL" inputmode="numeric" maxlength="3" />
      <small v-if="latestPressure">上次随访：{{ latestPressure.diastolic }} mmHg</small>
    </label>
    <template v-if="hasDiabetes">
      <label>是否空腹
        <select v-model="form.isGlu">
          <option value="1">是</option>
          <option value="0">否</option>
        </select>
      </label>
      <label v-if="form.isGlu === '1'">血糖<span class="required">*</span>
        <input v-model="form.glu" inputmode="decimal" maxlength="5" />
        <small v-if="latestFasting">上次随访：{{ latestFasting.value }} mmol/L</small>
      </label>
      <label v-else>血糖<span class="required">*</span>
        <input v-model="form.fbgMeal" inputmode="decimal" maxlength="5" />
      </label>
    </template>
  </div>
</template>
