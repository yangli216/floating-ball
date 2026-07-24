<script setup lang="ts">
import type { FusedFollowUpFormState } from '../../model/followUpFormModel';

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>是否需要转诊 fgRef
      <select v-model="form.fgRef">
        <option value="">请选择</option>
        <option value="1">良好</option>
        <option value="2">一般</option>
        <option value="3">差</option>
      </select>
    </label>
    <label>转诊状态 sdRefStatus
      <input v-model="form.sdRefStatus" placeholder="chis.tcd.refStatus 字典值" />
    </label>
    <label>转诊原因 desRef
      <input v-model="form.desRef" placeholder="chis.tcd.referralReason 字典值" />
    </label>
    <label>机构和科别 refDep
      <input v-model="form.refDep" maxlength="64" />
    </label>
    <label class="full-span">未转诊原因 desNoRef
      <input v-model="form.desNoRef" maxlength="255" />
    </label>
    <div class="neutral-note full-span">
      原实例字段名为“是否需要转诊”，但固定选项实际是“良好 / 一般 / 差”。为保证对接兼容，本页保留这一原始语义，不擅自改成布尔值。
    </div>
  </div>
</template>
