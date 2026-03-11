<template>
  <Transition name="slide-up">
    <div v-if="visible" class="fact-check-widget" @click.stop>
      <div class="notification-header">
        <div class="header-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 8V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div class="header-title">
          <h3>事实核查已开启</h3>
          <p class="description">AI 正守护内容准确性</p>
        </div>
        <button class="close-btn" @click="handleConfirm" aria-label="关闭">
          <Icon icon="lucide:x" size="16" />
        </button>
      </div>

      <div v-if="result && result.hasIssues" class="notification-content">
        <div class="issue-preview">
          <div class="preview-text">
            {{ getPreviewText() }}
          </div>
          <div class="issue-badge">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" fill="currentColor"/>
            </svg>
            发现 {{ result.issues.length }} 个待确认项
          </div>
        </div>
        
        <div class="notification-actions">
          <button class="secondary-button" @click="handleViewDetails">
            查看详情
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
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

.fact-check-widget {
  position: fixed;
  right: 24px;
  bottom: 24px;
  background: var(--color-background-white);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  max-width: 320px;
  width: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Stronger shadow for floating widget */
  border: 1px solid var(--color-border-light);
  z-index: 1000; /* Ensure it stays on top of content but below modal overlays */
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.notification-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.header-icon {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.header-title {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.header-title h3 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  line-height: 1.2;
}

.description {
  margin: 2px 0 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-background-hover);
  color: var(--color-text-strong);
}

.notification-content {
  margin-top: var(--space-xs);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.issue-preview {
  background: var(--color-background-gray);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
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
  background: var(--color-error-bg, #FEF2F2);
  color: var(--color-error);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.issue-badge svg {
  width: 14px;
  height: 14px;
}

.notification-actions {
  display: flex;
  justify-content: flex-end;
}

.secondary-button {
  padding: 6px 16px;
  background: var(--color-background-white);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.secondary-button:hover {
  background: var(--color-primary);
  color: white;
}

.secondary-button:active {
  transform: scale(0.98);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
</style>
