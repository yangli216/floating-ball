<script setup lang="ts">
import type { AppPatient } from '@/types/appState';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import { TreatmentPlanPage } from '@features/treatment-plan';
import OutpatientFollowUpEvidencePanel from './OutpatientFollowUpEvidencePanel.vue';

defineProps<{
  patient?: AppPatient | null;
  context?: HisOutpatientFollowUpContext | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

</script>

<template>
  <TreatmentPlanPage
    :patient="patient"
    :follow-up-context="context"
    @close="emit('close')"
  >
    <template #evidence>
      <OutpatientFollowUpEvidencePanel
        v-if="context"
        :context="context"
      />
    </template>
  </TreatmentPlanPage>
</template>
