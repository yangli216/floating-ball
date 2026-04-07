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
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  max-width: 300px;
  width: auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #EEF2F6;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  width: 18px;
  height: 18px;
  color: #2B7FE3;
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
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  line-height: 1.2;
}

.description {
  margin: 2px 0 0 0;
  font-size: 11px;
  color: #94A3B8;
}

.close-btn {
  background: none;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #F0F6FF;
  color: #2B7FE3;
}

.notification-content {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-preview {
  background: #FAFBFD;
  border-radius: 6px;
  padding: 8px 10px;
}

.preview-text {
  font-size: 12px;
  line-height: 1.5;
  color: #64748B;
  margin-bottom: 6px;
}

.issue-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(245, 158, 11, 0.1);
  color: #B45309;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.issue-badge svg {
  width: 12px;
  height: 12px;
}

.notification-actions {
  display: flex;
  justify-content: flex-end;
}

.secondary-button {
  padding: 4px 12px;
  background: #fff;
  color: #2B7FE3;
  border: 1px solid rgba(43, 127, 227, 0.2);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-button:hover {
  background: #2B7FE3;
  color: white;
  border-color: #2B7FE3;
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
