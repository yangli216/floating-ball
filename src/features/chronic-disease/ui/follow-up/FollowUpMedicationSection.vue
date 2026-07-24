<script setup lang="ts">
import {
  emptyDrugItem,
  type FusedFollowUpFormState,
} from '../../model/followUpFormModel';
import type { ChronicMedicationFact } from '../../types';

const props = defineProps<{
  hasDiabetes: boolean;
  historicalMedications: ChronicMedicationFact[];
}>();

const form = defineModel<FusedFollowUpFormState>({ required: true });

function changeDrugAdjustment(): void {
  if (form.value.fgDrugChange === '1' && form.value.drugList.length === 0) {
    form.value.drugList.push(emptyDrugItem());
  }
  if (form.value.fgDrugChange !== '1') form.value.drugList = [];
}

function addDrug(index: number): void {
  form.value.drugList.splice(index + 1, 0, emptyDrugItem());
}

function removeDrug(index: number): void {
  form.value.drugList.splice(index, 1);
  if (form.value.drugList.length === 0 && form.value.fgDrugChange === '1') {
    form.value.drugList.push(emptyDrugItem());
  }
}

function importHistoricalMedications(): void {
  const rows = props.historicalMedications
    .filter((item) => item.idDrug)
    .map((item) => ({
      ...emptyDrugItem(),
      idDrug: item.idDrug || '',
      naDrug: item.name,
      sdDrugFreq: item.sdDrugFreq || '',
      perDose: item.perDose || '',
      doseUnit: item.doseUnit || '',
      insulin: item.insulin || '',
    }));
  form.value.fgDrugChange = '1';
  form.value.drugList = rows.length > 0 ? rows : [emptyDrugItem()];
}
</script>

<template>
  <div class="form-grid">
    <div v-if="historicalMedications.length" class="full-span history-import">
      <div>
        <strong>历史随访用药</strong>
        <span>{{ historicalMedications.map((item) => item.name).join('、') }}</span>
      </div>
      <button type="button" @click="importHistoricalMedications">导入核对</button>
    </div>
    <label>是否用药调整 fgDrugChange<span class="required">*</span>
      <select v-model="form.fgDrugChange" @change="changeDrugAdjustment">
        <option value="">请选择</option>
        <option value="1">是</option>
        <option value="0">否</option>
      </select>
    </label>
    <label>服药依从性 sdDrugPro<span class="required">*</span>
      <select v-model="form.sdDrugPro">
        <option value="">请选择原系统字典值</option>
        <option value="1">规律</option>
        <option value="2">间断</option>
        <option value="3">医嘱无需服药</option>
        <option value="4">不服药</option>
      </select>
    </label>
    <label>药物不良反应 sdSideEffects<span class="required">*</span>
      <select v-model="form.sdSideEffects">
        <option value="">请选择</option>
        <option value="1">无</option>
        <option value="2">有</option>
      </select>
    </label>
    <label>不良反应说明 desSideEffects
      <input
        v-model="form.desSideEffects"
        maxlength="255"
        :disabled="form.sdSideEffects !== '2'"
      />
    </label>

    <div v-if="form.fgDrugChange === '1'" class="full-span drug-table-wrap">
      <p>只有填写 <code>idDrug</code> 的行会进入原实例 <code>drugList</code>。</p>
      <div class="drug-table">
        <div class="drug-row drug-head">
          <span>药品 ID</span><span>药品名称</span><span>每日频次</span><span>剂量</span>
          <span>单位</span><span v-if="hasDiabetes">胰岛素</span><span>操作</span>
        </div>
        <div v-for="(drug, index) in form.drugList" :key="index" class="drug-row">
          <input v-model="drug.idDrug" placeholder="idDrug" />
          <input v-model="drug.naDrug" placeholder="naDrug" />
          <input v-model="drug.sdDrugFreq" inputmode="numeric" placeholder="sdDrugFreq" />
          <input v-model="drug.perDose" inputmode="decimal" placeholder="perDose" />
          <input v-model="drug.doseUnit" maxlength="10" placeholder="doseUnit" />
          <select v-if="hasDiabetes" v-model="drug.insulin">
            <option value="">请选择</option>
            <option value="1">是</option>
            <option value="2">否</option>
          </select>
          <div class="drug-actions">
            <button type="button" @click="addDrug(index)">＋</button>
            <button type="button" @click="removeDrug(index)">－</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-import {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 10px;
}

.history-import div {
  display: grid;
  gap: 3px;
}

.history-import button {
  padding: 6px 10px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
}

.drug-table-wrap p {
  margin: 0 0 8px;
  color: #64748b;
  font-size: 10px;
}

.drug-table {
  min-width: 720px;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.drug-row {
  padding: 6px;
  display: grid;
  grid-template-columns: 1fr 1.5fr 0.8fr 0.8fr 0.7fr 0.8fr 72px;
  gap: 6px;
  align-items: center;
  border-top: 1px solid #eef2f6;
}

.drug-head {
  color: #475569;
  background: #f8fafc;
  border-top: 0;
  font-size: 10px;
  font-weight: 700;
}

.drug-row input,
.drug-row select {
  min-width: 0;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.drug-actions {
  display: flex;
  gap: 4px;
}

.drug-actions button {
  width: 30px;
  height: 30px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
}
</style>
