<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type {
  ReceptionChronicRefillPresentation,
} from '../lib/receptionChronicRefillPresentation';

defineProps<{
  presentation: ReceptionChronicRefillPresentation;
  generating?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>

<template>
  <div v-if="presentation.available" class="refill-panel">
    <button
      type="button"
      class="refill-card"
      :disabled="generating"
      :aria-busy="generating"
      @click="emit('confirm')"
    >
      <span class="refill-icon">
        <Icon :icon="generating ? 'lucide:loader-circle' : 'mdi:pill'" size="23" />
      </span>
      <span class="refill-copy">
        <span class="refill-title">
          <strong>{{ presentation.title }}</strong>
          <small>{{ generating ? '生成中' : '待确认' }}</small>
        </span>
        <span class="refill-status">{{ presentation.medicationStatus }}</span>
      </span>
      <Icon icon="lucide:chevron-right" size="21" />
    </button>
  </div>

  <div v-else class="refill-empty" role="status">
    <span class="refill-empty-icon">
      <Icon icon="mdi:pill-off" size="22" />
    </span>
    <span>
      <strong>{{ presentation.title }}</strong>
      <small>{{ presentation.medicationStatus }}</small>
    </span>
  </div>
</template>

<style scoped>
.refill-panel {
  display: grid;
}

.refill-card {
  width: 100%;
  min-height: 76px;
  padding: 10px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 9px;
  color: #1e293b;
  text-align: left;
  background: #f8f6ff;
  border: 1px solid #d8ccff;
  border-radius: 10px;
}

.refill-card:hover:not(:disabled) {
  border-color: #a78bfa;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, .08);
}

.refill-card:disabled {
  cursor: wait;
  opacity: .72;
}

.refill-icon,
.refill-empty-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: #6d3bd1;
  background: #f6f2ff;
  border: 1px solid #e4ddff;
  border-radius: 50%;
}

.refill-copy {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.refill-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.refill-title strong {
  font-size: 12px;
}

.refill-title small {
  padding: 2px 5px;
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
  font-size: 8px;
}

.refill-status {
  overflow: hidden;
  color: #64748b;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refill-card > svg {
  color: #7c3aed;
}

.refill-empty {
  min-height: 76px;
  padding: 10px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  color: #64748b;
  background: #fafafa;
  border: 1px dashed #d8dee8;
  border-radius: 10px;
}

.refill-empty-icon {
  color: #94a3b8;
  background: #f8fafc;
  border-color: #e2e8f0;
}

.refill-empty > span:last-child {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.refill-empty strong {
  color: #475569;
  font-size: 11px;
}

.refill-empty small {
  color: #94a3b8;
  font-size: 9px;
  line-height: 1.5;
}

@media (prefers-reduced-motion: no-preference) {
  .refill-card[aria-busy="true"] :deep(svg) {
    animation: refill-spin .8s linear infinite;
  }

  @keyframes refill-spin {
    to { transform: rotate(360deg); }
  }
}
</style>
