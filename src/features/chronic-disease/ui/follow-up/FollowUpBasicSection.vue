<script setup lang="ts">
import type { FusedFollowUpFormState } from '../../model/followUpFormModel';

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label v-if="form.sdVisitKind.includes('1')">随访计划时间（高）
      <input v-model="form.dtHyPlan" type="date" disabled />
    </label>
    <label v-if="form.sdVisitKind.includes('2')">随访计划时间（糖）
      <input v-model="form.dtDbsPlan" type="date" disabled />
    </label>
    <div class="neutral-note full-span">
      当前按“诊后随访”提交。计划日期只读展示，患者、随访记录与医生身份由系统自动关联。
    </div>
  </div>
</template>
