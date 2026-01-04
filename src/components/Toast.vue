<script setup lang="ts">
import { ref } from 'vue';

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
    <div v-if="visible" class="toast" :class="type">
      <span class="icon" v-if="type === 'success'">✓</span>
      <span class="icon" v-else-if="type === 'error'">✕</span>
      <span class="icon" v-else>ℹ</span>
      <span class="message">{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 9999;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(0, 0, 0, 0.05);
  min-width: 200px;
  justify-content: center;
}

.toast.success {
  color: #16a34a;
  background: #f0fdf4;
  border-color: #dcfce7;
}

.toast.error {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fee2e2;
}

.toast.info {
  color: #2563eb;
  background: #eff6ff;
  border-color: #dbeafe;
}

.icon {
  font-weight: bold;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
