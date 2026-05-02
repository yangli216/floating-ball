<template>
  <!-- 治疗项可编辑字段：药品（剂量/频次/用法/总量/天数/备注），检查/检验/处置（数量/执行科室/备注）。
       直接对传入的 rec 进行 v-model 赋值；频次/用法下拉同时更新文本与编码字段。
       该组件仅做 UI，未做候选切换或 HIS 回流，业务侧（症状问诊、语音问诊）按需复用。 -->
  <div class="treatment-item-editor" @click.stop>
    <template v-if="(rec.type || 'medicine') === 'medicine'">
      <div class="te-row">
        <label class="te-label">用法</label>
        <MedicineUsageFieldSelector
          :rec="rec"
          field="route"
          :options="routeOptions"
          :show-meta="true"
          placeholder="请选择用法"
        />
      </div>
      <div class="te-row">
        <label class="te-label">频次</label>
        <MedicineUsageFieldSelector
          :rec="rec"
          field="frequency"
          :options="frequencyOptions"
          placeholder="请选择频次"
        />
      </div>
      <div class="te-row">
        <label class="te-label">单次剂量</label>
        <input class="te-input te-input-num" type="text" :value="rec.dosage || ''" @input="(e) => rec.dosage = (e.target as HTMLInputElement).value" />
        <span class="te-suffix">{{ rec.dosageUnit || '' }}</span>
      </div>
      <div class="te-row">
        <label class="te-label">总量</label>
        <input
          class="te-input te-input-num"
          type="text"
          :value="rec.totalQty || ''"
          @input="(e) => { rec.totalQty = (e.target as HTMLInputElement).value; rec.totalManualEdited = true; }"
        />
        <span class="te-suffix">{{ rec.totalUnit || '' }}</span>
      </div>
      <div class="te-row">
        <label class="te-label">用药天数</label>
        <input class="te-input te-input-num" type="text" :value="rec.days || ''" @input="(e) => rec.days = (e.target as HTMLInputElement).value" />
        <span class="te-suffix">天</span>
      </div>
    </template>
    <template v-else>
      <div class="te-row">
        <label class="te-label">数量</label>
        <input class="te-input te-input-num" type="text" :value="rec.totalQty || '1'" @input="(e) => rec.totalQty = (e.target as HTMLInputElement).value" />
        <span class="te-suffix">{{ rec.totalUnit || '次' }}</span>
      </div>
      <div v-if="rec.execDept" class="te-row">
        <label class="te-label">执行科室</label>
        <span class="te-readonly">{{ rec.execDept }}</span>
      </div>
      <div v-if="rec.bodySite" class="te-row">
        <label class="te-label">部位方式</label>
        <span class="te-readonly">{{ rec.bodySite }}</span>
      </div>
    </template>
    <div class="te-row te-row-wide">
      <label class="te-label">备注</label>
      <input class="te-input" type="text" :value="rec.remark || ''" placeholder="可选" @input="(e) => rec.remark = (e.target as HTMLInputElement).value" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import type { TreatmentRecommendation } from '../types/consultation';
import type { UsageOption } from '../utils/medicalDictionaryHelpers';
import MedicineUsageFieldSelector from './MedicineUsageFieldSelector.vue';

defineProps({
  rec: {
    type: Object as PropType<TreatmentRecommendation>,
    required: true,
  },
  frequencyOptions: {
    type: Array as PropType<UsageOption[]>,
    default: () => [],
  },
  routeOptions: {
    type: Array as PropType<UsageOption[]>,
    default: () => [],
  },
});
</script>

<style scoped>
.treatment-item-editor {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0, 122, 255, 0.04);
  border: 1px solid rgba(0, 122, 255, 0.15);
  border-radius: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}

.te-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-strong, #333);
}

.te-row-wide {
  grid-column: 1 / -1;
}

.te-label {
  flex: 0 0 64px;
  color: #666;
  font-weight: 500;
}

.te-input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  line-height: 1.4;
}

.te-input-num {
  flex: 0 0 80px;
}

.te-suffix {
  flex: 0 0 auto;
  color: #888;
  font-size: 12px;
}

.te-readonly {
  flex: 1;
  padding: 3px 6px;
  color: #555;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
}

.te-input:focus {
  outline: none;
  border-color: var(--accent, #007aff);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}
</style>
