<script setup lang="ts">
import VoiceConsultationNew from './VoiceConsultationNew.vue';
import type { AppPatient } from '../types/appState';
import type { VoiceIntentResult } from '../composables/useVoiceIntentRecognition';

const props = withDefaults(defineProps<{
  initialPatientData?: AppPatient;
  intentResult: VoiceIntentResult | null;
  intentSource?: 'llm' | 'cache' | null;
  channel?: 'voice' | 'symptom';
  showPatientHeader?: boolean;
  secondaryFooterActionText?: string;
  secondaryFooterActionDisabled?: boolean;
}>(), {
  intentSource: null,
  channel: 'voice',
  showPatientHeader: true,
  secondaryFooterActionText: '',
  secondaryFooterActionDisabled: false,
});

const emit = defineEmits(['close', 'cancel', 'secondary-footer-action', 'diagnosis-differential']);
</script>

<template>
  <VoiceConsultationNew
    :initial-patient-data="props.initialPatientData"
    :intent-result="props.intentResult"
    :intent-source="props.intentSource"
    :channel="props.channel"
    :show-patient-header="props.showPatientHeader"
    :secondary-footer-action-text="props.secondaryFooterActionText"
    :secondary-footer-action-disabled="props.secondaryFooterActionDisabled"
    @close="emit('close')"
    @cancel="emit('cancel')"
    @secondary-footer-action="emit('secondary-footer-action')"
  >
    <template #diagnosis-actions="slotProps">
      <slot name="diagnosis-actions" v-bind="slotProps" />
    </template>
  </VoiceConsultationNew>
</template>
