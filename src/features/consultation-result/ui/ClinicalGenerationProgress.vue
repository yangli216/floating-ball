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
    <div
      class="generation-progress-track"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress.percent"
      :aria-valuetext="`${progress.title}，${progress.stepText}`"
    >
      <i :style="{ width: `${progress.percent}%` }" aria-hidden="true"></i>
      <div class="generation-progress-content">
        <span class="generation-progress-current">
          <Icon
            :class="generation?.status === 'error' ? 'progress-error-icon' : 'progress-running-icon'"
            :icon="generation?.status === 'error' ? 'lucide:triangle-alert' : 'lucide:loader-circle'"
            size="15"
            aria-hidden="true"
          />
          <strong :title="progress.title">{{ progress.title }}</strong>
        </span>
        <span class="generation-progress-step">{{ progress.stepText }}</span>
      </div>
    </div>
    <p v-if="progress.detail" class="generation-progress-detail">{{ progress.detail }}</p>
    <div class="generation-progress-steps">
      <span
        v-for="step in progress.steps"
        :key="step.key"
        :class="`is-${step.status}`"
      >
        <Icon
          :class="{ 'active-step-icon': step.status === 'active' }"
          :icon="step.status === 'complete' ? 'lucide:check' : step.status === 'error' ? 'lucide:triangle-alert' : step.status === 'active' ? 'lucide:loader-circle' : 'lucide:circle'"
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
  padding: 9px 12px;
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

.generation-progress-track {
  position: relative;
  height: 28px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(70, 112, 181, 0.1);
  box-shadow: inset 0 0 0 1px rgba(70, 112, 181, 0.08);
}

.generation-progress-track i {
  position: absolute;
  inset: 0 auto 0 0;
  display: block;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
  background: linear-gradient(90deg, rgba(78, 130, 213, 0.38), rgba(114, 164, 237, 0.5));
  transition: width 360ms ease;
}

.generation-progress-track i::after {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(105deg, transparent 15%, rgba(255, 255, 255, 0.62) 46%, transparent 76%);
  transform: translateX(-110%);
  animation: progress-shimmer 1.45s ease-in-out infinite;
}

.generation-progress-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  gap: 12px;
  padding: 0 10px;
  color: #294f87;
  font-size: 13px;
}

.generation-progress-current {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.generation-progress-current strong {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-progress-step {
  flex: none;
  color: #3e6297;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.progress-running-icon,
.active-step-icon {
  flex: none;
  animation: progress-icon-spin 1.1s linear infinite;
}

.progress-error-icon { flex: none; }

.generation-progress-detail {
  margin: 7px 2px 0;
  color: #6780a8;
  font-size: 12px;
  line-height: 1.45;
}

.generation-progress.is-error .generation-progress-track {
  background: rgba(190, 72, 72, 0.08);
  box-shadow: inset 0 0 0 1px rgba(190, 72, 72, 0.12);
}

.generation-progress.is-error .generation-progress-track i {
  background: rgba(190, 72, 72, 0.12);
}

.generation-progress.is-error .generation-progress-track i::after { display: none; }
.generation-progress.is-error .generation-progress-content { color: #923f3f; }
.generation-progress.is-error .generation-progress-step { color: #a96565; }
.generation-progress.is-error .generation-progress-detail { color: #a96565; }

@keyframes progress-shimmer {
  0% { transform: translateX(-110%); }
  70%, 100% { transform: translateX(110%); }
}

@keyframes progress-icon-spin {
  to { transform: rotate(360deg); }
}

.generation-progress-steps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.generation-progress-steps span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 99px;
  background: rgba(83, 119, 174, 0.08);
  color: #7487a3;
  font-size: 12px;
}
.generation-progress-steps .is-active {
  background: rgba(68, 122, 210, 0.2);
  color: #264f8d;
  font-weight: 650;
  box-shadow: inset 0 0 0 1px rgba(68, 122, 210, 0.2);
}
.generation-progress-steps .is-complete {
  background: rgba(61, 125, 102, 0.06);
  color: #39745d;
}
.generation-progress-steps .is-error { color: #aa654b; }

@media (prefers-reduced-motion: reduce) {
  .generation-progress-track i,
  .generation-progress-track i::after,
  .progress-running-icon,
  .active-step-icon {
    animation: none;
    transition: none;
  }
}
</style>
