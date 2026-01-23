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
/**
 * 组件样式规范：
 * - 所有颜色使用 var(--color-*) 语义变量
 * - 间距使用 var(--space-*)
 * - 动画使用 var(--duration-*) 和 var(--ease-*)
 * - 参考: src/styles/design-tokens.css
 */

.fact-check-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  backdrop-filter: blur(4px);
}

.fact-check-notification {
  background: var(--color-background-white);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  max-width: 420px;
  width: 90%;
  box-shadow: var(--shadow-xl);
  animation: slideUp var(--duration-slow) var(--ease-out);
  border: 1px solid var(--color-border-light);
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
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.header-icon {
  width: 24px;
  height: 24px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.notification-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.notification-content {
  margin-bottom: var(--space-lg);
}

.description {
  margin: 0 0 var(--space-md) 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-muted);
}

.issue-preview {
  background: var(--color-background-gray);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  position: relative;
}

.preview-text {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--color-text-medium);
  margin-bottom: var(--space-sm);
  font-family: var(--font-body);
}

.issue-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-text-strong);
  color: white;
  padding: var(--space-xs) 10px;
  border-radius: var(--radius-lg);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.issue-badge svg {
  width: 16px;
  height: 16px;
  color: var(--color-error);
}

.notification-actions {
  display: flex;
  gap: var(--space-md);
  flex-direction: column;
}

.primary-button {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-text-strong);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.primary-button:hover {
  filter: brightness(1.2);
}

.primary-button:active {
  transform: scale(0.98);
}

.secondary-button {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-background-white);
  color: var(--color-text-strong);
  border: 1px solid var(--color-border-medium);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.secondary-button:hover {
  background: var(--color-background-hover);
  border-color: var(--color-border-strong);
}

.secondary-button:active {
  transform: scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-slow) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
