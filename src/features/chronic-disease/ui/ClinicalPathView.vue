<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { getClinicalPathDiagram } from '../lib/clinicalPathDiagram';
import { getPublishedClinicalPath } from '../lib/publishedCatalog';
import type {
  ChronicDiseaseType,
  ChronicDiseaseWindowPayload,
} from '../types';
import ClinicalPathDiagram from './ClinicalPathDiagram.vue';

const props = defineProps<{ payload: ChronicDiseaseWindowPayload }>();

const availableDiseases = computed<ChronicDiseaseType[]>(() => {
  const diseases = props.payload.summary.diseaseTags.map((item) => item.diseaseType);
  return Array.from(new Set(diseases.length > 0 ? diseases : ['hypertension']));
});
const activeDisease = shallowRef<ChronicDiseaseType>(
  props.payload.diseaseType || availableDiseases.value[0] || 'hypertension',
);
const publishedPath = computed(() => getPublishedClinicalPath(activeDisease.value));
const diagram = computed(() => getClinicalPathDiagram(activeDisease.value));
</script>

<template>
  <div class="path-view">
    <div class="path-tabs" role="tablist" aria-label="临床路径病种">
      <button
        v-for="disease in availableDiseases"
        :key="disease"
        type="button"
        :class="{ active: activeDisease === disease }"
        role="tab"
        :aria-selected="activeDisease === disease"
        @click="activeDisease = disease"
      >
        <Icon :icon="disease === 'hypertension' ? 'mdi:heart-pulse' : 'mdi:water-plus-outline'" size="17" />
        {{ disease === 'hypertension' ? '高血压管理路径' : '2 型糖尿病管理路径' }}
      </button>
    </div>

    <div class="path-meta">
      <span><Icon icon="lucide:badge-check" size="15" />已发布</span>
      <span>路径 {{ publishedPath.pathVersion }}</span>
      <span>依据 {{ publishedPath.evidenceVersion }}</span>
      <span>发布 {{ publishedPath.publishedAt }}</span>
      <span class="readonly-note">
        <Icon icon="lucide:lock-keyhole" size="14" />
        原系统正式流程图 · 只读
      </span>
    </div>

    <ClinicalPathDiagram
      :key="activeDisease"
      :diagram="diagram"
    />
  </div>
</template>

<style scoped>
.path-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  background: #fff;
}

.path-tabs {
  padding: 10px 14px 0;
  display: flex;
  gap: 6px;
}

.path-tabs button {
  min-height: 38px;
  padding: 8px 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  background: #fff;
  border: 1px solid #dbe3ee;
  border-radius: 6px 6px 0 0;
}

.path-tabs button.active {
  color: #1d4ed8;
  background: #f0f6ff;
  border-color: #93c5fd;
  font-weight: 700;
}

.path-meta {
  min-height: 38px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 13px;
  color: #64748b;
  border-block: 1px solid #e2e8f0;
  font-size: 10px;
}

.path-meta span {
  white-space: nowrap;
}

.path-meta span:first-child,
.readonly-note {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.path-meta span:first-child {
  color: #1d4ed8;
}

.readonly-note {
  margin-left: auto;
  color: #64748b;
}

@media (max-width: 720px) {
  .path-meta span:not(:first-child):not(.readonly-note) {
    display: none;
  }
}
</style>
