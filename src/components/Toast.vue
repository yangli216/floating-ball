<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';

const visible = ref(false);
const message = ref('');
const type = ref<'success' | 'error' | 'info'>('info');
let timer: ReturnType<typeof setTimeout> | null = null;

const show = (msg: string, msgType: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
  message.value = msg;
  type.value = msgType;
  visible.value = true;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    visible.value = false;
  }, duration);
};

defineExpose({ show });
</script>

<template>
  <Transition name="toast-fade">
    <div
      v-if="visible"
      class="toast"
      :class="type"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon
        v-if="type === 'success'"
        icon="lucide:check-circle-2"
        :size="20"
        aria-hidden="true"
        class="toast-icon"
      />
      <Icon
        v-else-if="type === 'error'"
        icon="lucide:x-circle"
        :size="20"
        aria-hidden="true"
        class="toast-icon"
      />
      <Icon
        v-else
        icon="lucide:info"
        :size="20"
        aria-hidden="true"
        class="toast-icon"
      />
      <span class="toast-message">{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-background-white, white);
  box-shadow: var(--shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1));
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  z-index: var(--z-notification, 9999);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  font-family: var(--font-body);
  border: 1px solid var(--color-border-light, rgba(0, 0, 0, 0.05));
  min-width: 200px;
  max-width: 500px;
  justify-content: center;
  backdrop-filter: blur(8px);
}

/* 成功状态 */
.toast.success {
  color: var(--color-success, #10B981);
  background: var(--color-success-bg, #D1FAE5);
  border-color: var(--color-success-border, #6EE7B7);
}

.toast.success .toast-icon {
  color: var(--color-success, #10B981);
}

/* 错误状态 */
.toast.error {
  color: var(--color-error, #DC2626);
  background: var(--color-error-bg, #FEE2E2);
  border-color: var(--color-error-border, #FCA5A5);
}

.toast.error .toast-icon {
  color: var(--color-error, #DC2626);
}

/* 信息状态 */
.toast.info {
  color: var(--color-info, #2563EB);
  background: var(--color-info-bg, #DBEAFE);
  border-color: var(--color-info-border, #93C5FD);
}

.toast.info .toast-icon {
  color: var(--color-info, #2563EB);
}

.toast-icon {
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: var(--line-height-normal, 1.5);
}

/* 过渡动画 - 使用 transform 和 opacity 优化性能 */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition:
    opacity var(--duration-normal, 200ms) var(--ease-out, ease-out),
    transform var(--duration-normal, 200ms) var(--ease-out, ease-out);
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}

/* 响应式设计 */
@media (max-width: 767px) {
  .toast {
    max-width: calc(100vw - 40px);
    font-size: var(--font-size-sm, 14px);
  }
}
</style>
