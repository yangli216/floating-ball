<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type {
  ClinicalResultGenerationState,
  ClinicalResultRecommendationType,
} from '@features/clinical-result';
import {
  buildClinicalGenerationProgress,
  type ClinicalTreatmentGenerationStatus,
} from '../model/clinicalGenerationProgress';

const props = defineProps<{
  generation?: ClinicalResultGenerationState;
  treatmentLoading: boolean;
  treatmentStates: Record<ClinicalResultRecommendationType, ClinicalTreatmentGenerationStatus>;
}>();

const progress = computed(() => buildClinicalGenerationProgress({
  generation: props.generation,
  treatmentLoading: props.treatmentLoading,
  treatmentStates: props.treatmentStates,
}));
</script>

<template>
  <div
    v-if="progress.visible"
    :class="['generation-progress', { 'is-error': generation?.status === 'error' }]"
    role="status"
    aria-live="polite"
  >
    <div class="generation-progress-heading">
      <Icon class="progress-sparkles-icon" icon="lucide:sparkles" size="16" aria-hidden="true" />
      <div>
        <strong>{{ progress.title }}</strong>
        <p>{{ progress.detail }}</p>
      </div>
      <span>{{ progress.percent }}%</span>
    </div>
    <div class="generation-progress-track" aria-hidden="true">
      <i :style="{ width: `${progress.percent}%` }"></i>
    </div>
    <div class="generation-progress-steps">
      <span
        v-for="step in progress.steps"
        :key="step.key"
        :class="`is-${step.status}`"
      >
        <Icon
          :icon="step.status === 'complete' ? 'lucide:check' : step.status === 'error' ? 'lucide:triangle-alert' : 'lucide:circle'"
          size="12"
          aria-hidden="true"
        />
        {{ step.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.generation-progress {
  margin: 0 18px 10px;
  padding: 11px 13px;
  border: 1px solid rgba(65, 121, 214, 0.2);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(238, 244, 255, 0.96), rgba(246, 250, 255, 0.9));
  color: #365f9f;
}

.generation-progress.is-error {
  border-color: rgba(190, 72, 72, 0.24);
  background: rgba(255, 246, 246, 0.96);
  color: #a13f3f;
}

.generation-progress.is-error .generation-progress-heading p { color: #a96565; }

.generation-progress-heading {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 8px;
  font-size: 13px;
}

.generation-progress-heading strong { font-weight: 650; }
.generation-progress-heading p { margin: 3px 0 0; color: #6780a8; font-size: 12px; }
.generation-progress-heading > span { color: #5578b1; font-variant-numeric: tabular-nums; }

.generation-progress-track {
  height: 3px;
  margin: 9px 0;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(70, 112, 181, 0.14);
}

.generation-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.15) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 75%,
    transparent 75%,
    transparent
  ), linear-gradient(90deg, #4e82d5, #72a4ed);
  background-size: 20px 20px, 100% 100%;
  animation: progress-bar-stripes 1s linear infinite;
  transition: width 240ms ease;
}

.progress-sparkles-icon {
  animation: spin-and-pulse 2s linear infinite;
}

@keyframes progress-bar-stripes {
  from { background-position: 0 0, 0 0; }
  to { background-position: 20px 0, 0 0; }
}

@keyframes spin-and-pulse {
  0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
  50% { transform: scale(1.15) rotate(180deg); opacity: 1; }
  100% { transform: scale(1) rotate(360deg); opacity: 0.8; }
}

.generation-progress-steps { display: flex; flex-wrap: wrap; gap: 6px; }
.generation-progress-steps span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 99px;
  background: rgba(83, 119, 174, 0.08);
  color: #7a8da9;
  font-size: 11px;
}
.generation-progress-steps .is-active { background: rgba(68, 122, 210, 0.14); color: #396bb8; }
.generation-progress-steps .is-complete { color: #3d7d66; }
.generation-progress-steps .is-error { color: #aa654b; }
</style>
