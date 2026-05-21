<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';

defineProps<{
  dirty: boolean;
  description: string;
  shortcutLabel: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [];
}>();
</script>

<template>
  <div class="settings-save-bar" :class="{ dirty }">
    <div class="save-bar-status">
      <div class="save-bar-title">
        <Icon :icon="dirty ? 'lucide:circle-alert' : 'lucide:check-circle-2'" :size="16" />
        <span>{{ description }}</span>
      </div>
      <span class="save-bar-divider">·</span>
      <span class="save-bar-hint">{{ shortcutLabel }}</span>
    </div>
    <button class="save-btn compact" @click="emit('save')" :disabled="!dirty || saving">
      <Icon :icon="saving ? 'lucide:loader-2' : dirty ? 'lucide:save' : 'lucide:check'" :size="16" :class="{ spin: saving }" />
      {{ saving ? '保存中...' : dirty ? '保存更改' : '已保存' }}
    </button>
  </div>
</template>

<style scoped>
.settings-save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.94);
  border-top: 1px solid var(--medical-border-light);
  box-shadow: 0 -4px 14px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(12px);
}

.settings-save-bar.dirty {
  border-top-color: rgba(8, 145, 178, 0.24);
  box-shadow: 0 -6px 18px rgba(8, 145, 178, 0.09);
}

.save-bar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.save-bar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--medical-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.save-bar-divider {
  color: var(--medical-border-medium);
  font-size: 12px;
}

.save-bar-hint {
  color: var(--medical-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  background: var(--medical-primary);
  color: white;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
  transition: all var(--duration-normal) var(--ease-out);
}

.save-btn:hover {
  background: var(--medical-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

.save-btn:active {
  transform: translateY(0);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .settings-save-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 12px;
  }

  .save-btn.compact {
    width: 100%;
  }

  .save-bar-status {
    justify-content: space-between;
    flex-wrap: wrap;
  }
}
</style>
