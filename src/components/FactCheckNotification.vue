<template>
  <Transition name="fade">
    <div v-if="visible" class="fact-check-overlay" @click="handleOverlayClick">
      <div class="fact-check-notification" @click.stop>
        <div class="notification-header">
          <div class="header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M12 8V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
          </div>
          <h3>事实核查已开启</h3>
        </div>

        <div class="notification-content">
          <p class="description">
            独立 AI 审查员会自动分析内容，与可验证来源进行交叉核对，并标记出潜在的事实问题，以帮助保持内容的准确性和可信度。
          </p>

          <div v-if="result && result.hasIssues" class="issue-preview">
            <div class="preview-text">
              {{ getPreviewText() }}
            </div>
            <div class="issue-badge">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" fill="currentColor"/>
              </svg>
              {{ result.issues.length }} {{ result.issues.length === 1 ? 'issue' : 'issues' }}
            </div>
          </div>
        </div>

        <div class="notification-actions">
          <button class="primary-button" @click="handleConfirm">知道了</button>
          <button v-if="result && result.hasIssues" class="secondary-button" @click="handleViewDetails">
            查看详情
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FactCheckResult } from '../services/factChecker';

interface Props {
  result?: FactCheckResult | null;
  modelValue: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'viewDetails': [];
  'confirm': [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const handleOverlayClick = () => {
  visible.value = false;
};

const handleConfirm = () => {
  emit('confirm');
  visible.value = false;
};

const handleViewDetails = () => {
  emit('viewDetails');
  visible.value = false;
};

const getPreviewText = () => {
  if (!props.result || !props.result.hasIssues || props.result.issues.length === 0) {
    return '';
  }

  const firstIssue = props.result.issues[0];
  const text = firstIssue.content || firstIssue.issue;

  // 限制长度
  if (text.length > 60) {
    return text.substring(0, 60) + '...';
  }

  return text;
};
</script>

<style scoped>
.fact-check-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.fact-check-notification {
  background: white;
  border-radius: 16px;
  padding: 24px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.header-icon {
  width: 24px;
  height: 24px;
  color: #2563eb;
  flex-shrink: 0;
}

.notification-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.notification-content {
  margin-bottom: 24px;
}

.description {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.6;
  color: #6b7280;
}

.issue-preview {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px;
  position: relative;
}

.preview-text {
  font-size: 13px;
  line-height: 1.5;
  color: #374151;
  margin-bottom: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.issue-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #1f2937;
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.issue-badge svg {
  width: 16px;
  height: 16px;
  color: #ef4444;
}

.notification-actions {
  display: flex;
  gap: 12px;
  flex-direction: column;
}

.primary-button {
  width: 100%;
  padding: 12px 24px;
  background: #1f2937;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-button:hover {
  background: #374151;
}

.primary-button:active {
  transform: scale(0.98);
}

.secondary-button {
  width: 100%;
  padding: 12px 24px;
  background: white;
  color: #1f2937;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-button:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.secondary-button:active {
  transform: scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
