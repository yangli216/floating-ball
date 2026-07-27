<script setup lang="ts">
import type { FusedFollowUpFormState } from '../../model/followUpFormModel';

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>是否需要转诊
      <select v-model="form.fgRef">
        <option value="">请选择</option>
        <option value="1">良好</option>
        <option value="2">一般</option>
        <option value="3">差</option>
      </select>
    </label>
    <label>转诊状态
      <input v-model="form.sdRefStatus" placeholder="请输入转诊状态" />
    </label>
    <label>转诊原因
      <input v-model="form.desRef" placeholder="请输入转诊原因" />
    </label>
    <label>机构和科别
      <input v-model="form.refDep" maxlength="64" />
    </label>
    <label class="full-span">未转诊原因
      <input v-model="form.desNoRef" maxlength="255" />
    </label>
    <div class="neutral-note full-span">
      业务系统的“是否需要转诊”固定选项为“良好 / 一般 / 差”，本页保持相同业务语义。
    </div>
  </div>
</template>
