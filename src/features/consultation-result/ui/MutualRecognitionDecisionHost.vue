<script setup lang="ts">
import type { MutualRecognitionDecision } from '../model/useMutualRecognitionDecision';
import MutualRecognitionDecisionDialog from './MutualRecognitionDecisionDialog.vue';

defineProps<{ decision: MutualRecognitionDecision }>();
</script>

<template>
  <MutualRecognitionDecisionDialog
    :open="decision.open.value"
    :message="decision.message.value"
    :items="decision.items.value"
    :selected-item-ids="decision.selectedItemIds.value"
    :submitting="decision.submitting.value"
    @toggle-item="decision.setItemSelected"
    @toggle-all="decision.toggleAll"
    @decision="decision.submitDecision"
  />
</template>
