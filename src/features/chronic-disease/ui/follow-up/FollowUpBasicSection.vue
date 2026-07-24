<script setup lang="ts">
import type { FusedFollowUpFormState } from '../../model/followUpFormModel';

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>人员主键 idPhr
      <input v-model="form.idPhr" readonly />
    </label>
    <label>登记表主键 idRecord
      <input v-model="form.idRecord" readonly />
    </label>
    <label v-if="form.sdVisitKind.includes('1')">随访计划时间（高）
      <input v-model="form.dtHyPlan" type="date" disabled />
    </label>
    <label v-if="form.sdVisitKind.includes('2')">随访计划时间（糖）
      <input v-model="form.dtDbsPlan" type="date" disabled />
    </label>
    <label>录入医生 inputUser<span class="required">*</span>
      <input v-model.trim="form.inputUser" placeholder="请输入原系统医生 ID" />
    </label>
    <label>责任医生 idUser<span class="required">*</span>
      <input v-model.trim="form.idUser" placeholder="请输入原系统医生 ID" />
    </label>
    <div class="neutral-note full-span">
      当前按原实例“诊后随访”提交，<code>status=3</code>。计划日期由慢病系统返回时只读展示。
    </div>
  </div>
</template>
