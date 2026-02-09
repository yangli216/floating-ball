<template>
  <Transition name="fade">
    <div v-if="modelValue" class="modal-overlay" @click="handleOverlayClick">
      <div class="modal-container" @click.stop>
        <header class="modal-header">
          <div class="header-content">
            <h3>{{ result?.name || '文档详情' }}</h3>
            <div v-if="result?.sourceInfo" class="header-meta">
              <span v-if="result.sourceInfo.knowledgeLibName">{{ result.sourceInfo.knowledgeLibName }}</span>
              <span v-if="result.sourceInfo.publishYear">{{ result.sourceInfo.publishYear }}</span>
            </div>
          </div>
          <button class="close-btn" @click="close" title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>正在加载文档内容...</span>
          </div>

          <div v-else-if="error" class="error-state">
            <span class="error-icon">⚠️</span>
            <span>{{ error }}</span>
            <button class="retry-btn" @click="loadContent">重试</button>
          </div>

          <div v-else-if="clipData" class="content-wrapper">
            <!-- AI 摘要 -->
            <div v-if="result?.aiAbstract" class="ai-abstract-section">
              <h4>AI 摘要</h4>
              <p>{{ result.aiAbstract }}</p>
            </div>

            <!-- 文档内容 -->
            <div class="document-content" v-html="sanitizedContent"></div>
          </div>

          <div v-else class="empty-state">
            <span>暂无文档内容</span>
          </div>
        </div>

        <footer class="modal-footer">
          <div class="footer-info">
            <span v-if="result?.words" class="word-count">{{ result.words }} 字</span>
            <span v-if="result?.score" class="score-info">
              相似度: {{ Math.round((result.score || 0) * 100) }}%
            </span>
          </div>
          <button class="close-action-btn" @click="close">关闭</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { pmphaiService, type SearchResult, type ClipData } from '../services/pmphai';

const props = defineProps<{
  modelValue: boolean;
  result: SearchResult | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const clipData = ref<ClipData | null>(null);

// 监听弹窗打开，自动加载内容
watch(() => props.modelValue, async (visible) => {
  if (visible && props.result?.id) {
    await loadContent();
  } else if (!visible) {
    // 关闭时重置状态
    clipData.value = null;
    error.value = null;
  }
});

async function loadContent() {
  if (!props.result?.id) return;

  loading.value = true;
  error.value = null;

  try {
    clipData.value = await pmphaiService.getClip(props.result.id);
  } catch (e: any) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

// 简单的 HTML 清理（移除危险标签）
const sanitizedContent = computed(() => {
  if (!clipData.value?.xml) return '';

  let html = clipData.value.xml;

  // 移除 script 和 style 标签
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 移除事件处理器
  html = html.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  return html;
});

function handleOverlayClick() {
  close();
}

function close() {
  emit('update:modelValue', false);
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  background: var(--color-background-white, #ffffff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s ease;
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

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border-light, #e5e7eb);
}

.header-content {
  flex: 1;
}

.header-content h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-strong, #1f2937);
  line-height: 1.4;
}

.header-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-background-gray, #f3f4f6);
  border-radius: 10px;
  cursor: pointer;
  color: var(--color-text-medium, #4b5563);
  transition: all 0.2s;
  flex-shrink: 0;
  margin-left: 16px;
}

.close-btn:hover {
  background: var(--color-background-gray, #e5e7eb);
  color: var(--color-text-strong, #1f2937);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-muted, #6b7280);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border-light, #e5e7eb);
  border-top-color: var(--color-primary, #3b82f6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  font-size: 32px;
}

.retry-btn {
  margin-top: 8px;
  padding: 8px 16px;
  border: 1px solid var(--color-primary, #3b82f6);
  background: transparent;
  color: var(--color-primary, #3b82f6);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.content-wrapper {
  max-width: 100%;
}

.ai-abstract-section {
  margin-bottom: 24px;
  padding: 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border-radius: 12px;
  border-left: 4px solid var(--color-primary, #3b82f6);
}

.ai-abstract-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}

.ai-abstract-section p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-medium, #4b5563);
}

.document-content {
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text-strong, #1f2937);
}

.document-content :deep(h1),
.document-content :deep(h2),
.document-content :deep(h3),
.document-content :deep(h4) {
  margin-top: 24px;
  margin-bottom: 12px;
  color: var(--color-text-strong, #1f2937);
}

.document-content :deep(p) {
  margin-bottom: 16px;
}

.document-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px 0;
}

.document-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.document-content :deep(th),
.document-content :deep(td) {
  padding: 10px 12px;
  border: 1px solid var(--color-border-light, #e5e7eb);
  text-align: left;
}

.document-content :deep(th) {
  background: var(--color-background-gray, #f9fafb);
  font-weight: 600;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border-light, #e5e7eb);
  background: var(--color-background-gray, #f9fafb);
  border-radius: 0 0 16px 16px;
}

.footer-info {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.close-action-btn {
  padding: 10px 24px;
  border: none;
  background: var(--color-primary, #3b82f6);
  color: white;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.close-action-btn:hover {
  background: #2563eb;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
