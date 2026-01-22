<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  text?: string;
  detail?: string;
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  color: 'var(--color-primary)',
});

const sizeClasses = {
  sm: 'spinner-sm',
  md: 'spinner-md',
  lg: 'spinner-lg',
};
</script>

<template>
  <div class="loading-container" role="status" aria-live="polite">
    <div
      class="spinner"
      :class="sizeClasses[size]"
      :style="{ borderTopColor: color }"
      aria-hidden="true"
    ></div>
    <p v-if="text" class="loading-text">{{ text }}</p>
    <p v-if="detail" class="loading-detail">{{ detail }}</p>
  </div>
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md, 16px);
  padding: var(--space-xl, 32px);
}

/* Spinner 基础样式 */
.spinner {
  border: 3px solid var(--color-border-light, #E2E8F0);
  border-top-color: var(--color-primary, #0891B2);
  border-radius: var(--radius-full, 9999px);
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 20px;
  height: 20px;
  border-width: 2px;
}

.spinner-md {
  width: 40px;
  height: 40px;
  border-width: 3px;
}

.spinner-lg {
  width: 60px;
  height: 60px;
  border-width: 4px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 文本样式 */
.loading-text {
  font-size: var(--font-size-base, 16px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #164E63);
  margin: 0;
}

.loading-detail {
  font-size: var(--font-size-sm, 14px);
  color: var(--color-text-weak, #475569);
  margin: 0;
  text-align: center;
  max-width: 400px;
}

/* Reduced Motion 支持 */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    /* 显示静态指示器 */
    border-top-color: var(--color-primary, #0891B2);
    border-right-color: var(--color-primary, #0891B2);
  }
}
</style>
