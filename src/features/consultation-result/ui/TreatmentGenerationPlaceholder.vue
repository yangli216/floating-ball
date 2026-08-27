<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';

defineProps<{
  title: string;
  status: 'loading' | 'error';
}>();
</script>

<template>
  <div
    :class="['treatment-generation-placeholder', `is-${status}`]"
    role="status"
    aria-live="polite"
  >
    <Icon
      :icon="status === 'loading' ? 'lucide:loader-2' : 'lucide:circle-alert'"
      :class="{ spin: status === 'loading' }"
      size="16"
      aria-hidden="true"
    />
    <div>
      <strong>{{ title }}</strong>
      <span>{{ status === 'loading' ? 'AI 正在生成建议…' : `${title}暂未生成，可稍后刷新方案。` }}</span>
    </div>
  </div>
</template>

<style scoped>
.treatment-generation-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
  border-top: 1px solid var(--voice-border, rgba(37, 99, 235, 0.12));
  color: var(--voice-text-muted, #64748b);
}

.treatment-generation-placeholder > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.treatment-generation-placeholder strong {
  color: var(--voice-text, #334155);
  font-size: 13px;
  white-space: nowrap;
}

.treatment-generation-placeholder span {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.treatment-generation-placeholder.is-error {
  color: var(--voice-warning, #b45309);
}

.spin {
  animation: treatment-placeholder-spin 0.9s linear infinite;
}

@keyframes treatment-placeholder-spin {
  to { transform: rotate(360deg); }
}
</style>
