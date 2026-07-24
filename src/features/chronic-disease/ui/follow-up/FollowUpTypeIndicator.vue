<script setup lang="ts">
import type { ChronicDiseaseType } from '../../types';

const props = defineProps<{
  diseaseTypes: readonly ChronicDiseaseType[];
  modeLabel: string;
  templateVersions: string[];
}>();

function selected(diseaseType: ChronicDiseaseType): boolean {
  return props.diseaseTypes.includes(diseaseType);
}
</script>

<template>
  <section class="follow-up-type" aria-label="本次随访类型">
    <div class="type-options">
      <strong>随访类型：</strong>
      <label :class="{ selected: selected('hypertension') }">
        <input type="checkbox" :checked="selected('hypertension')" disabled />
        高血压
      </label>
      <label :class="{ selected: selected('type2_diabetes') }">
        <input type="checkbox" :checked="selected('type2_diabetes')" disabled />
        2 型糖尿病
      </label>
      <span>{{ modeLabel }}</span>
    </div>
    <div class="version-list">
      <span v-for="version in templateVersions" :key="version">{{ version }}</span>
    </div>
  </section>
</template>

<style scoped>
.follow-up-type {
  min-height: 48px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #dbe3ee;
  font-size: 11px;
}

.type-options,
.version-list {
  display: flex;
  align-items: center;
  gap: 10px;
}

.type-options strong {
  color: #334155;
}

.type-options label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.type-options label.selected {
  color: #1d4ed8;
  font-weight: 700;
}

.type-options input {
  width: 15px;
  height: 15px;
  accent-color: #2b7fe3;
  opacity: 1;
}

.type-options > span {
  padding-left: 4px;
  color: #475569;
}

.version-list span {
  padding: 3px 6px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 4px;
  font-size: 9px;
}

@media (max-width: 980px) {
  .follow-up-type {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
